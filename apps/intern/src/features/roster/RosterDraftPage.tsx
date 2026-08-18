import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { repository } from '../../data';
import {
  DAY_NAMES,
  DAY_SHORT,
  addDays,
  emptyWeek,
  formatDayMonth,
  formatMinutes,
  isoDate,
  isoWeekNumber,
  mondayOf,
  parseTime,
  shiftMinutes,
  weekMinutes,
  type ShiftDay,
  type ShiftStatus,
} from './rosterModel';

/**
 * Entwurf des Dienstplans als eigenes Modul der Plattform.
 *
 * Der bisherige Editor ist eine eigenständige Seite mit 22 Spalten je Woche —
 * für jeden Tag drei (Beginn, Ende, Stunden). Er kann alles, aber man muss ihn
 * lesen lernen. Dieser Entwurf behält jede Funktion und ändert die Darstellung:
 *
 *   Ein Tag ist eine Fläche, nicht drei Zellen. Wer den Plan überfliegt, will
 *   „14:30–23:00" sehen, nicht drei Zahlen zusammensetzen.
 *
 *   Farbe markiert, sie füllt nicht. Ein Streifen am Bereich genügt; große
 *   Farbflächen machen den Plan unruhig und die Schrift schlechter lesbar.
 *
 *   Am Handy zählt der Tag, nicht die Woche. Sieben Spalten auf 375 Pixel
 *   ergeben keine Übersicht — also dort: ein Tag, alle Namen darunter.
 *
 * Gespeichert wird hier nichts. Der Entwurf liest den echten Plan, damit man
 * ihn mit den eigenen Namen beurteilen kann, und lässt die Datenbank in Ruhe.
 */

const GROUPS: { no: number; name: string; color: string }[] = [
  { no: 1, name: 'Küche', color: '#b8791c' },
  { no: 2, name: 'Service', color: '#c2582a' },
  { no: 3, name: 'Service Aushilfen', color: '#7b57c4' },
  { no: 4, name: 'Counter', color: '#1a7a4c' },
  { no: 5, name: 'Mechanik', color: '#1f6f92' },
];

/** Schnellauswahl je Bereich — die Zeiten, die im Center wirklich vorkommen. */
const PRESETS: Record<number, [string, string][]> = {
  1: [['09:00', '18:00'], ['12:00', '18:00'], ['14:00', '22:00']],
  2: [['14:30', '19:00'], ['14:30', '23:00']],
  3: [['17:00', '23:00']],
  4: [['08:00', '11:00'], ['09:00', '12:00'], ['14:30', '23:00']],
  5: [['09:00', '17:00']],
};

/**
 * Gewichtung der Zustaende.
 *
 * Nur der Dienst bekommt eine Flaeche. Wer den Plan aufschlaegt, sucht, wer
 * arbeitet — nicht, wer frei hat. Gaebe man jedem Tag ein Kaestchen, entstuende
 * eine Wand aus Kaesten, in der die eine Schicht untergeht, die man sucht.
 * Urlaub und Krank sind Ausnahmen und duerfen auffallen; frei ist der
 * Normalfall und bleibt still.
 */
/**
 * Abstufungen einer Bereichsfarbe.
 *
 * Die Farbe ordnet den Plan — man findet seinen Bereich, ohne zu lesen. Auf
 * hellem Grund darf sie aber nicht als volle Flaeche unter der Schrift liegen,
 * sonst leidet die Lesbarkeit. Also: kraeftig im Band, sehr leicht in den
 * Zeilen, und die Schichtkarte bleibt weiss und hebt sich davon ab.
 */
const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, #ffffff)`;

const STATUS_PILL: Record<ShiftStatus, { label: string; cls: string }> = {
  dienst: { label: 'Dienst', cls: '' },
  frei: { label: 'frei', cls: 'text-lw-text3' },
  urlaub: { label: 'Urlaub', cls: 'bg-lw-ok/12 text-lw-ok' },
  krank: { label: 'Krank', cls: 'bg-lw-bad/12 text-lw-bad' },
  nein: { label: '·', cls: 'text-lw-line2' },
};

interface Employee {
  id: string;
  name: string;
  groupNo: number;
  /** Sollstunden je Woche; 0 = ohne Vorgabe. */
  targetHours: number;
}

type WeekPlan = Record<string, ShiftDay[]>;

const DEMO_EMPLOYEES: Employee[] = [
  { id: 'd1', name: 'Sven', groupNo: 1, targetHours: 40 },
  { id: 'd2', name: 'Antonia', groupNo: 1, targetHours: 30 },
  { id: 'd3', name: 'Justin', groupNo: 2, targetHours: 40 },
  { id: 'd4', name: 'Kira', groupNo: 2, targetHours: 20 },
  { id: 'd5', name: 'Diego', groupNo: 3, targetHours: 0 },
  { id: 'd6', name: 'Stefano', groupNo: 4, targetHours: 40 },
  { id: 'd7', name: 'Marko', groupNo: 5, targetHours: 40 },
];

export function RosterDraftPage() {
  const { session } = useAuth();
  const canEdit = session?.isLead || session?.isAdmin || session === null;

  const [tab, setTab] = useState<'plan' | 'team'>('plan');
  const [offset, setOffset] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>(DEMO_EMPLOYEES);
  const [plan, setPlan] = useState<WeekPlan>({});
  const [undoStack, setUndoStack] = useState<WeekPlan[]>([]);
  const [editing, setEditing] = useState<{ empId: string; day: number; rect: DOMRect } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [realPlan, setRealPlan] = useState<WeekPlan>({});
  const [tvOpen, setTvOpen] = useState(false);
  const [showExample, setShowExample] = useState(false);

  // Wie in der Bahnwartung: neben einer hellen Flaeche laeuft der Rahmen eine
  // Stufe heller, sonst steht sie wie ein Loch im dunklen Bild.
  useEffect(() => {
    document.body.classList.add('db-hell', 'db-breit', 'db-plan');
    return () => document.body.classList.remove('db-hell', 'db-breit', 'db-plan');
  }, []);

  const monday = useMemo(() => addDays(mondayOf(new Date()), offset * 7), [offset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const todayIndex = useMemo(() => {
    const t = isoDate(new Date());
    return days.findIndex((d) => isoDate(d) === t);
  }, [days]);

  // Der Entwurf liest den echten Plan — mit den eigenen Namen lässt sich eine
  // Gestaltung beurteilen, mit Musternamen nicht.
  useEffect(() => {
    let active = true;
    repository
      .listRosterEmployees()
      .then((rows) => {
        if (!active || rows.length === 0) return;
        setEmployees(
          rows.map((r) => ({ id: r.id, name: r.name, groupNo: r.groupNo, targetHours: 0 })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    repository
      .rosterWeek(isoDate(monday))
      .then((data) => {
        if (!active) return;
        const next: WeekPlan = {};
        for (const [empId, entry] of Object.entries(data)) {
          const list = (entry as { d?: ShiftDay[] })?.d;
          if (Array.isArray(list)) next[empId] = normalizeWeek(list);
        }
        // Eine fast leere Woche zeigt vom Entwurf nichts. Dann startet die
        // Ansicht mit einer Beispielwoche — abschaltbar, deutlich gekennzeichnet.
        const shifts = Object.values(next).reduce(
          (n, w) => n + w.filter((d) => d.status === 'dienst').length,
          0,
        );
        setRealPlan(next);
        setPlan(next);
        setShowExample(shifts < 3);
        setUndoStack([]);
      })
      .catch(() => setPlan({}));
    return () => {
      active = false;
    };
  }, [monday]);

  // Die Beispielwoche ersetzt die echte ganz — sonst blieben die gespeicherten
  // „frei" stehen und vom Entwurf waere wieder nichts zu sehen.
  useEffect(() => {
    if (employees.length === 0) return;
    setPlan(showExample ? exampleWeek(employees) : realPlan);
    setUndoStack([]);
  }, [showExample, employees, realPlan]);

  const weekOf = (empId: string): ShiftDay[] => plan[empId] ?? emptyWeek();

  function change(empId: string, day: number, value: ShiftDay) {
    setUndoStack((s) => [...s.slice(-19), plan]);
    setPlan((p) => {
      const week = [...(p[empId] ?? emptyWeek())];
      week[day] = value;
      return { ...p, [empId]: week };
    });
  }

  function undo() {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      setPlan(s[s.length - 1]);
      return s.slice(0, -1);
    });
  }

  function flash(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 2600);
  }

  const editingEmployee = editing ? employees.find((e) => e.id === editing.empId) ?? null : null;

  return (
    <div>
      <div className="nicht-drucken flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-auto text-2xl font-extrabold">Dienstplan</h1>
        <span className="rounded-md bg-db-card2 px-2 py-1 text-xs font-semibold text-db-text2">
          Entwurf — nichts wird gespeichert
        </span>
      </div>

      <nav className="db-scroll-x mt-5 flex gap-1 overflow-x-auto pl-5">
        {(
          [
            ['plan', 'Wochenplan'],
            ['team', 'Mitarbeiter & Bereiche'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
              tab === key ? 'bg-lw-bg text-lw-text' : 'text-db-text2 hover:bg-db-card2 hover:text-db-text'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="lw-sheet space-y-3">
        {tab === 'plan' ? (
          <>
            {/* Auf dem Blatt fehlen Reiter und Bedienleiste — dann muss oben
                stehen, um welche Woche es geht. */}
            <div className="nur-drucken hidden">
              <div className="text-lg font-extrabold">
                Dienstplan KW {isoWeekNumber(monday)} · {formatDayMonth(monday)} –{' '}
                {formatDayMonth(addDays(monday, 6))}
                {monday.getFullYear()}
              </div>
            </div>

            <Toolbar
              monday={monday}
              offset={offset}
              canEdit={canEdit}
              canUndo={undoStack.length > 0}
              onWeek={setOffset}
              onUndo={undo}
              onAction={flash}
              onTv={() => setTvOpen(true)}
            />

            {!canEdit && (
              <p className="rounded-lg bg-lw-card2 px-4 py-2.5 text-sm text-lw-text2">
                👁 Nur Ansicht — Änderungen nimmt die Leitung vor.
              </p>
            )}

            <label className="nicht-drucken flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-lw-card2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={showExample}
                onChange={(ev) => setShowExample(ev.target.checked)}
              />
              <span className="font-semibold">Beispielwoche</span>
              <span className="text-lw-text2">
                {showExample
                  ? 'Erfundene Schichten — so sieht der Plan gefüllt aus.'
                  : 'Zeigt den echten Plan dieser Woche.'}
              </span>
            </label>

            {/* Woche: ab Tablet als Raster, am Handy nach Tagen. */}
            <div className="hidden md:block">
              <WeekGrid
                employees={employees}
                days={days}
                todayIndex={todayIndex}
                weekOf={weekOf}
                canEdit={canEdit}
                onPick={(empId, day, rect) => setEditing({ empId, day, rect })}
              />
            </div>
            <div className="nicht-drucken md:hidden">
              <DayView
                employees={employees}
                days={days}
                todayIndex={todayIndex}
                weekOf={weekOf}
                ownName={session?.displayName ?? null}
              />
            </div>

            <Legend />
          </>
        ) : (
          <TeamTab employees={employees} canEdit={canEdit} onChange={setEmployees} />
        )}
      </div>

      {editing && editingEmployee && (
        <CellEditor
          anchor={editing.rect}
          employee={editingEmployee}
          dayName={DAY_NAMES[editing.day]}
          date={days[editing.day]}
          value={weekOf(editing.empId)[editing.day]}
          onChange={(v) => change(editing.empId, editing.day, v)}
          onClose={() => setEditing(null)}
        />
      )}

      {tvOpen && (
        <TvView
          employees={employees}
          days={days}
          monday={monday}
          todayIndex={todayIndex}
          weekOf={weekOf}
          onClose={() => setTvOpen(false)}
        />
      )}

      {note && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-db-card2 px-4 py-2 text-sm text-db-text shadow-xl lg:bottom-8">
          {note}
        </div>
      )}
    </div>
  );
}

/** Fremde Daten kommen als sieben Tage — oder eben nicht. Hier wird es sicher. */
function normalizeWeek(list: ShiftDay[]): ShiftDay[] {
  const week = emptyWeek();
  for (let i = 0; i < 7; i++) {
    const d = list[i];
    if (d && typeof d === 'object') {
      week[i] = {
        status: (['dienst', 'frei', 'urlaub', 'krank', 'nein'] as ShiftStatus[]).includes(d.status)
          ? d.status
          : 'nein',
        b: typeof d.b === 'string' ? d.b : '',
        e: typeof d.e === 'string' ? d.e : '',
      };
    }
  }
  return week;
}

/**
 * Eine plausible Woche zum Ansehen — feste Muster je Bereich, kein Zufall,
 * damit dieselbe Belegschaft immer dieselbe Beispielwoche ergibt.
 */
function exampleWeek(employees: Employee[]): WeekPlan {
  const plan: WeekPlan = {};
  employees.forEach((emp, idx) => {
    const presets = PRESETS[emp.groupNo] ?? [['09:00', '17:00']];
    const week = emptyWeek();
    for (let day = 0; day < 7; day++) {
      const slot = (day + idx) % 7;
      if (slot === 0 || slot === 3) {
        week[day] = { status: 'frei', b: '', e: '' };
      } else if (slot === 5 && idx % 4 === 1) {
        week[day] = { status: 'urlaub', b: '', e: '' };
      } else {
        const [b, e] = presets[(day + idx) % presets.length];
        week[day] = { status: 'dienst', b, e };
      }
    }
    plan[emp.id] = week;
  });
  return plan;
}

function Toolbar({
  monday,
  offset,
  canEdit,
  canUndo,
  onWeek,
  onUndo,
  onAction,
  onTv,
}: {
  monday: Date;
  offset: number;
  canEdit: boolean;
  canUndo: boolean;
  onWeek: (o: number) => void;
  onUndo: () => void;
  onAction: (text: string) => void;
  onTv: () => void;
}) {
  const sunday = addDays(monday, 6);
  return (
    <div className="nicht-drucken flex flex-wrap items-center gap-x-2 gap-y-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onWeek(offset - 1)}
          className="lw-btn-ghost h-9 w-9 text-lg leading-none"
          aria-label="Woche zurück"
        >
          ‹
        </button>
        <div className="px-2 text-center">
          <div className="text-base font-bold">KW {isoWeekNumber(monday)}</div>
          <div className="text-xs text-lw-text2">
            {formatDayMonth(monday)} – {formatDayMonth(sunday)}
            {sunday.getFullYear()}
          </div>
        </div>
        <button
          onClick={() => onWeek(offset + 1)}
          className="lw-btn-ghost h-9 w-9 text-lg leading-none"
          aria-label="Woche vor"
        >
          ›
        </button>
        {offset !== 0 && (
          <button onClick={() => onWeek(0)} className="lw-btn-ghost ml-1 px-3 py-1.5 text-sm">
            Heute
          </button>
        )}
      </div>

      {/* Am Handy zaehlt der Blick auf den Tag. Drucken, CSV und Kopieren sind
          Schreibtischarbeit und wuerden hier nur den Plan nach unten druecken. */}
      <div className="ml-auto hidden flex-wrap items-center gap-2 sm:flex">
        {canEdit && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="lw-btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ↩ Rückgängig
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onAction('Woche kopiert (im Entwurf ohne Wirkung).')}
            className="lw-btn-ghost px-3 py-1.5 text-sm"
          >
            Woche kopieren
          </button>
        )}
        <button onClick={onTv} className="lw-btn-ghost px-3 py-1.5 text-sm">
          📺 Fernseher
        </button>
        <button onClick={() => window.print()} className="lw-btn-ghost px-3 py-1.5 text-sm">
          Drucken
        </button>
        <button
          onClick={() => onAction('CSV wird im fertigen Modul erzeugt.')}
          className="lw-btn-ghost px-3 py-1.5 text-sm"
        >
          CSV
        </button>
      </div>
    </div>
  );
}

function WeekGrid({
  employees,
  days,
  todayIndex,
  weekOf,
  canEdit,
  onPick,
}: {
  employees: Employee[];
  days: Date[];
  todayIndex: number;
  weekOf: (id: string) => ShiftDay[];
  canEdit: boolean;
  onPick: (empId: string, day: number, rect: DOMRect) => void;
}) {
  const groups = GROUPS.filter((g) => employees.some((e) => e.groupNo === g.no));

  return (
    <div className="db-scroll-x overflow-x-auto">
      <table className="w-full min-w-[58rem] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-lw-bg px-3 pb-1.5 text-left text-xs font-semibold tracking-wide text-lw-text3 uppercase">
              Name
            </th>
            {days.map((d, i) => (
              <th key={i} className="px-2 pb-1.5 text-center">
                {i === todayIndex ? (
                  <div className="mx-auto inline-block rounded-md bg-lw-warn/15 px-2 py-0.5">
                    <div className="text-sm font-bold text-lw-warn">{DAY_SHORT[i]}</div>
                    <div className="text-xs text-lw-warn/80">{formatDayMonth(d)}</div>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-bold text-lw-text2">{DAY_SHORT[i]}</div>
                    <div className="text-xs text-lw-text3">{formatDayMonth(d)}</div>
                  </>
                )}
              </th>
            ))}
            <th className="px-3 pb-1.5 text-right text-xs font-semibold tracking-wide text-lw-text3 uppercase">
              Woche
            </th>
          </tr>
        </thead>

        {groups.map((group) => {
          const rows = employees.filter((e) => e.groupNo === group.no);
          const total = rows.reduce((sum, e) => sum + weekMinutes(weekOf(e.id)), 0);
          return (
            <tbody key={group.no}>
              <tr>
                <td colSpan={9} className="pt-3 pb-1">
                  <div
                    className="bereichs-band flex items-center gap-3 rounded-md px-3 py-1"
                    style={{ background: tint(group.color, 18), color: group.color }}
                  >
                    <span className="text-[13px] font-extrabold tracking-wide uppercase">{group.name}</span>
                    <span className="text-[11px] opacity-70">{rows.length}</span>
                    <span className="ml-auto text-[13px] font-bold">{formatMinutes(total)} h</span>
                  </div>
                </td>
              </tr>

              {rows.map((emp, rowIndex) => {
                const week = weekOf(emp.id);
                const minutes = weekMinutes(week);
                // Zeile fuer Zeile abwechselnd getoent, dazu eine helle Fuge:
                // ueber sieben Spalten hinweg verrutscht man sonst leicht in
                // die Nachbarzeile.
                const rowBg = tint(group.color, rowIndex % 2 === 0 ? 7 : 13);
                const gap = rowIndex === 0 ? undefined : '2px solid #ffffff';
                return (
                  <tr key={emp.id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 py-1.5 pr-4 pl-3 text-left text-sm font-semibold whitespace-nowrap"
                      style={{ background: rowBg, borderLeft: `3px solid ${group.color}`, borderTop: gap }}
                    >
                      {emp.name}
                    </th>
                    {week.map((day, i) => (
                      <td key={i} className="px-1 py-1.5" style={{ background: rowBg, borderTop: gap }}>
                        <DayCell
                          day={day}
                          color={group.color}
                          isToday={i === todayIndex}
                          canEdit={canEdit}
                          onPick={(rect) => onPick(emp.id, i, rect)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right" style={{ background: rowBg, borderTop: gap }}>
                      <span className="tabular text-sm font-bold">{formatMinutes(minutes)}</span>
                      {emp.targetHours > 0 && (
                        <span className="ml-1 text-xs text-lw-text3">/ {emp.targetHours}:00</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}

        {/* Wie stark ist der Tag besetzt? Steht unter den Spalten, wo man beim
            Ueberfliegen ohnehin landet. */}
        <tfoot>
          <tr>
            <th className="sticky left-0 z-10 bg-lw-bg px-3 pt-2 text-left text-xs font-semibold tracking-wide text-lw-text3 uppercase">
              Im Dienst
            </th>
            {days.map((_, i) => {
              const list = employees.filter((e) => weekOf(e.id)[i].status === 'dienst');
              const minutes = list.reduce((sum, e) => sum + shiftMinutes(weekOf(e.id)[i]), 0);
              return (
                <td key={i} className="px-1 pt-2 text-center">
                  <div className={`text-sm font-bold ${list.length === 0 ? 'text-lw-text3' : ''}`}>
                    {list.length}
                  </div>
                  <div className="text-[11px] text-lw-text3">{formatMinutes(minutes)} h</div>
                </td>
              );
            })}
            <td className="px-3 pt-2 text-right text-[11px] text-lw-text3">Personen<br />Stunden</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Ein Tag als eine Fläche.
 *
 * Dienst zeigt die Zeitspanne groß und die Dauer klein darunter — das ist,
 * was gesucht wird. Alles andere ist eine ruhige Marke, die nicht um
 * Aufmerksamkeit kämpft.
 */
function DayCell({
  day,
  color,
  isToday,
  canEdit,
  onPick,
}: {
  day: ShiftDay;
  color: string;
  isToday: boolean;
  canEdit: boolean;
  onPick: (rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const minutes = shiftMinutes(day);
  const pill = STATUS_PILL[day.status];
  void isToday; // Der heutige Tag wird einmal in der Kopfzeile markiert, nicht an jeder Zelle.

  const base = 'block w-full rounded-lg text-center transition';

  const body =
    day.status === 'dienst' ? (
      // Weiss auf der eingefaerbten Zeile: die Schicht tritt hervor, der Rand
      // in der Bereichsfarbe haelt sie sichtbar bei ihrem Bereich.
      /* Eine Zeile statt drei: die Dauer steht in der Wochensumme rechts und
         beim Zeigen auf die Zelle. Erst dadurch passt die Belegschaft auf
         einen Bildschirm — und auf ein Blatt. */
      <div
        className="schicht-karte rounded-lg bg-white px-2 py-1.5"
        style={{ boxShadow: `inset 0 0 0 1px ${tint(color, 30)}` }}
      >
        <div className="tabular text-sm leading-tight font-bold whitespace-nowrap">
          {day.b || '—'}
          <span className="mx-px font-normal text-lw-text3">–</span>
          {day.e || '—'}
        </div>
        <div className="dauer text-[11px] leading-tight text-lw-text3">
          {minutes > 0 ? `${formatMinutes(minutes)} h` : ' '}
        </div>
      </div>
    ) : (
      <div className={`status-marke rounded-lg px-2 py-3 text-xs font-semibold ${pill.cls}`}>
        {pill.label}
      </div>
    );

  if (!canEdit) return <div className={base}>{body}</div>;

  return (
    <button
      ref={ref}
      onClick={() => ref.current && onPick(ref.current.getBoundingClientRect())}
      className={`${base} cursor-pointer hover:brightness-[0.97]`}
    >
      {body}
    </button>
  );
}

/**
 * Fernseher-Ansicht.
 *
 * Im Center haengt der Plan an der Wand. Dort kann niemand scrollen — was
 * nicht auf dem Bild ist, existiert nicht. Also wird nicht gehofft, dass es
 * passt, sondern gerechnet: der Plan wird in seiner natuerlichen Groesse
 * aufgebaut, gemessen und dann so weit skaliert, dass er in beide Richtungen
 * hineingeht. Das haelt auch, wenn morgen fuenf Namen dazukommen — dann wird
 * das Bild eben etwas kleiner, statt unten abgeschnitten zu sein.
 *
 * Auf einem grossen Schirm darf er ueber 100 % hinauswachsen; ein 16:9-Fernseher
 * steht weit weg und die Schrift muss dorthin tragen.
 */
function TvView({
  employees,
  days,
  monday,
  todayIndex,
  weekOf,
  onClose,
}: {
  employees: Employee[];
  days: Date[];
  monday: Date;
  todayIndex: number;
  weekOf: (id: string) => ShiftDay[];
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState({ scale: 1, dx: 0, dy: 0 });

  // Zwei Formen zur Wahl: die Tafel, die eigens fuer die Wand gebaut ist, und
  // die Editor-Ansicht, wie sie am Rechner steht, nur passend gerechnet. Was
  // im Center besser funktioniert, entscheidet sich vor dem Geraet und nicht
  // hier — die Wahl bleibt deshalb gespeichert.
  const [form, setForm] = useState<'tafel' | 'editor'>(
    () => (localStorage.getItem('dienstplan-tv-form') as 'tafel' | 'editor') ?? 'tafel',
  );
  useEffect(() => {
    localStorage.setItem('dienstplan-tv-form', form);
  }, [form]);

  const fit = useCallback(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    // Die Transformation aendert die Groesse des Elements nicht — gemessen wird
    // also immer der unskalierte Aufbau, egal wie oft wir nachrechnen.
    const byWidth = box.clientWidth / inner.offsetWidth;
    const byHeight = box.clientHeight / inner.offsetHeight;
    const scale = Math.min(byWidth, byHeight, 2.2);
    // Der Block ist breiter als der Rahmen und liegt deshalb links an; eine
    // Skalierung aus der Mitte wuerde ihn rechts aus dem Bild schieben. Also
    // linke obere Ecke als Ursprung und die Mitte selbst ausrechnen — sonst
    // fehlen Sonntag und die Wochensumme.
    const dx = (box.clientWidth - inner.offsetWidth * scale) / 2;
    const dy = (box.clientHeight - inner.offsetHeight * scale) / 2;
    setFitted({ scale, dx, dy });
  }, []);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [fit, form]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Vollbild, wenn der Browser es hergibt — am Fernseher zaehlt jede Zeile.
    void document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);

  return (
    /* Die Ansicht steht ausserhalb des hellen Bereichs und muss ihre Farben
       deshalb selbst mitbringen — sonst erbt sie die helle Schrift des dunklen
       Rahmens und steht hell auf hell. */
    <div className="fixed inset-0 z-50 flex flex-col bg-lw-bg text-lw-text">
      <div className="absolute top-3 right-4 z-10 flex gap-2 opacity-30 transition hover:opacity-100">
        {(
          [
            ['tafel', 'Wandtafel'],
            ['editor', 'Editor-Ansicht'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setForm(key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              form === key ? 'bg-lw-text text-lw-card' : 'bg-lw-card text-lw-text2'
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={onClose} className="rounded-lg bg-lw-card px-3 py-1.5 text-sm text-lw-text2">
          Schließen (Esc)
        </button>
      </div>

      {/* Der Rahmen misst ohne eigene Polsterung, damit die Rechnung aufgeht;
          die Luft steckt im Inhalt. */}
      <div ref={boxRef} className="flex-1 overflow-hidden">
        <div
          ref={innerRef}
          /* Der Tag wird schmaler aufgebaut als die Woche: er hat weniger
             Zeilen und darf deshalb weiter aufgeblasen werden, bis er die
             Hoehe ausfuellt. Bei gleicher Breite bliebe das halbe Bild leer. */
          className="plan-tv w-[1820px] origin-top-left px-4 py-2"
          style={{ transform: `translate(${fitted.dx}px, ${fitted.dy}px) scale(${fitted.scale})` }}
        >
          {/* Keine Kopfzeile: die Tagesspalten tragen das Datum bereits, und
              jede Zeile oben kostet Schriftgroesse in allen Feldern darunter.
              Die Kalenderwoche steht in der leeren Ecke ueber der Namensspalte
              — dort ist ohnehin Platz. */}
          {form === 'tafel' ? (
            <TvMatrix
              employees={employees}
              days={days}
              todayIndex={todayIndex}
              weekOf={weekOf}
              woche={`KW ${isoWeekNumber(monday)}`}
            />
          ) : (
            <WeekGrid
              employees={employees}
              days={days}
              todayIndex={todayIndex}
              weekOf={weekOf}
              canEdit={false}
              onPick={() => {}}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Die Woche fuer die Wand: Zeilen wie in der Tabelle, Ruhe wie bei den Kacheln.
 *
 * Eine Person bleibt eine Zeile — nur so kann man jemanden ueber die Woche
 * verfolgen, und das ist der Sinn eines Wochenplans. Unruhig war nicht die
 * Form, sondern was in den Feldern stand: in jeder zweiten Zelle ein
 * ausgeschriebenes „frei", darunter in jeder besetzten noch eine zweite Zahl,
 * dazu eine Summenspalte und eine Fusszeile.
 *
 * Hier traegt nur Tinte, wo jemand arbeitet: eine weisse Kachel mit der Zeit
 * in Bereichsfarbe, gross. Freie Tage bleiben leer, die Zeile ist getoent, und
 * der gewonnene Platz geht an die Schrift. Stundensummen sind Schreibtisch-
 * arbeit — die stehen am Rechner und auf dem Ausdruck.
 */
function TvMatrix({
  employees,
  days,
  todayIndex,
  weekOf,
  woche,
}: {
  employees: Employee[];
  days: Date[];
  todayIndex: number;
  weekOf: (id: string) => ShiftDay[];
  woche: string;
}) {
  const gruppen = GROUPS.filter((g) => employees.some((e) => e.groupNo === g.no));

  return (
    <table className="w-full border-separate border-spacing-0">
      <thead>
        <tr>
          <th className="w-[190px] pb-2 pl-1 text-left align-bottom">
            <span className="text-2xl font-extrabold text-lw-text3">{woche}</span>
          </th>
          {days.map((d, i) => {
            const anzahl = employees.filter((e) => weekOf(e.id)[i].status === 'dienst').length;
            const heute = i === todayIndex;
            return (
              <th key={i} className="pb-2 text-center">
                <div
                  className={`mx-1 rounded-lg px-2 py-1 ${heute ? 'bg-lw-warn/20 text-lw-warn' : 'text-lw-text2'}`}
                >
                  <span className="text-2xl font-extrabold">{DAY_SHORT[i]}</span>
                  <span className="ml-2 text-lg">{formatDayMonth(d)}</span>
                  <span className="ml-2 text-lg font-bold opacity-70">{anzahl}</span>
                </div>
              </th>
            );
          })}
        </tr>
      </thead>

      {gruppen.map((group) => (
        <tbody key={group.no}>
          <tr>
            {/* Fuenf Bereichsbaender kosteten zusammen so viel Hoehe wie fuenf
                Mitarbeiter. Sie tragen nur ein Wort — das darf schmal sein,
                die gewonnene Hoehe geht an die Zeiten. */}
            <td colSpan={8} className="pt-1">
              <div
                className="rounded px-3 text-base leading-6 font-extrabold tracking-wide uppercase"
                style={{ background: tint(group.color, 20), color: group.color }}
              >
                {group.name}
              </div>
            </td>
          </tr>

          {employees
            .filter((e) => e.groupNo === group.no)
            .map((emp, rowIndex) => {
              const week = weekOf(emp.id);
              const rowBg = tint(group.color, rowIndex % 2 === 0 ? 7 : 13);
              const fuge = rowIndex === 0 ? undefined : '3px solid #ffffff';
              return (
                <tr key={emp.id}>
                  <th
                    scope="row"
                    className="px-3 py-1 text-left text-xl font-bold whitespace-nowrap"
                    style={{ background: rowBg, borderLeft: `4px solid ${group.color}`, borderTop: fuge }}
                  >
                    {emp.name}
                  </th>
                  {week.map((day, i) => (
                    <td
                      key={i}
                      className="px-1 py-1"
                      style={{ background: rowBg, borderTop: fuge }}
                    >
                      {day.status === 'dienst' ? (
                        <div className="rounded-lg bg-white px-2 py-1 text-center">
                          <span
                            className="tabular text-[22px] leading-tight font-extrabold whitespace-nowrap"
                            style={{ color: group.color }}
                          >
                            {day.b}
                            <span className="mx-px font-normal text-lw-text3">–</span>
                            {day.e}
                          </span>
                        </div>
                      ) : day.status === 'urlaub' || day.status === 'krank' ? (
                        <div
                          className={`rounded-lg px-2 py-1 text-center text-lg font-bold ${
                            day.status === 'urlaub' ? 'text-lw-ok' : 'text-lw-bad'
                          }`}
                          style={{ background: '#ffffff' }}
                        >
                          {STATUS_PILL[day.status].label}
                        </div>
                      ) : (
                        // Frei bleibt leer. Das Wort in jeder zweiten Zelle war
                        // die halbe Unruhe und hat nichts erzaehlt.
                        <div className="py-1 text-center text-lw-line2">·</div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      ))}
    </table>
  );
}

/**
 * Handy-Ansicht: ein Tag, alle Namen darunter.
 *
 * Sieben Spalten auf einem Telefon ergeben keine Übersicht, nur ein kleineres
 * Problem. Wer unterwegs nachsieht, will wissen, wer heute da ist.
 */
function DayView({
  employees,
  days,
  todayIndex,
  weekOf,
  ownName,
}: {
  employees: Employee[];
  days: Date[];
  todayIndex: number;
  weekOf: (id: string) => ShiftDay[];
  ownName: string | null;
}) {
  const [sel, setSel] = useState(todayIndex >= 0 ? todayIndex : 0);
  useEffect(() => {
    if (todayIndex >= 0) setSel(todayIndex);
  }, [todayIndex]);

  const onDuty = employees
    .map((e) => ({ emp: e, day: weekOf(e.id)[sel] }))
    .filter((x) => x.day.status === 'dienst' || x.day.status === 'urlaub' || x.day.status === 'krank');

  return (
    <div className="space-y-4">
      <div className="db-scroll-x -mx-1 flex gap-1 overflow-x-auto px-1">
        {days.map((d, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            className={`min-w-[3.2rem] flex-1 rounded-lg px-1 py-2 text-center transition ${
              i === sel ? 'bg-lw-text text-lw-card' : 'bg-lw-card text-lw-text2'
            }`}
          >
            <div className="text-xs font-bold">{DAY_SHORT[i]}</div>
            <div className={`text-[11px] ${i === sel ? 'opacity-80' : 'text-lw-text3'}`}>
              {formatDayMonth(d)}
            </div>
            {i === todayIndex && (
              <div className={`mt-0.5 text-[10px] font-bold ${i === sel ? 'opacity-90' : 'text-lw-warn'}`}>
                heute
              </div>
            )}
          </button>
        ))}
      </div>

      {onDuty.length === 0 ? (
        <p className="lw-card px-4 py-6 text-center text-lw-text3">
          Für {DAY_NAMES[sel]} ist niemand eingeteilt.
        </p>
      ) : (
        <div className="space-y-5">
          {GROUPS.filter((g) => onDuty.some((x) => x.emp.groupNo === g.no)).map((group) => (
            <div key={group.no}>
              <div
                className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: tint(group.color, 18), color: group.color }}
              >
                <span className="text-sm font-extrabold tracking-wide uppercase">{group.name}</span>
                <span className="ml-auto text-xs opacity-70">
                  {onDuty.filter((x) => x.emp.groupNo === group.no).length} im Dienst
                </span>
              </div>
              <div
                className="divide-y divide-white/70 overflow-hidden rounded-xl"
                style={{ background: tint(group.color, 8), borderLeft: `3px solid ${group.color}` }}
              >
                {onDuty
                  .filter((x) => x.emp.groupNo === group.no)
                  .map(({ emp, day }) => {
                    const mine = ownName && emp.name === ownName;
                    return (
                      <div
                        key={emp.id}
                        className={`flex items-center gap-3 px-3 py-3 ${mine ? 'bg-lw-warn/15' : ''}`}
                      >
                        <span className="font-semibold">{emp.name}</span>
                        {mine && (
                          <span className="rounded bg-lw-warn/15 px-1.5 py-0.5 text-[11px] font-bold text-lw-warn">
                            du
                          </span>
                        )}
                        <span className="tabular ml-auto font-bold">
                          {day.status === 'dienst' ? (
                            <>
                              {day.b}
                              <span className="mx-0.5 font-normal text-lw-text3">–</span>
                              {day.e}
                            </>
                          ) : (
                            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_PILL[day.status].cls}`}>
                              {STATUS_PILL[day.status].label}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Eingabe direkt an der Zelle.
 *
 * Vorlagen zuerst — der übliche Fall soll ein Klick sein, nicht vier Eingaben.
 * Die Zeitfelder verstehen Kurzschreibweise ("930" wird 09:30), damit die
 * Tastatur nicht ausgebremst wird.
 */
function CellEditor({
  anchor,
  employee,
  dayName,
  date,
  value,
  onChange,
  onClose,
}: {
  anchor: DOMRect;
  employee: Employee;
  dayName: string;
  date: Date;
  value: ShiftDay;
  onChange: (v: ShiftDay) => void;
  onClose: () => void;
}) {
  const [b, setB] = useState(value.b);
  const [e, setE] = useState(value.e);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = shiftMinutes({ status: 'dienst', b: parseTime(b) ?? '', e: parseTime(e) ?? '' });

  function commit(nb: string, ne: string) {
    const pb = parseTime(nb);
    const pe = parseTime(ne);
    if (pb === null || pe === null) {
      setError('Uhrzeit nicht verstanden — z. B. 9, 930 oder 14:30.');
      return;
    }
    setError(null);
    onChange({ status: 'dienst', b: pb, e: pe });
  }

  function setStatus(status: ShiftStatus) {
    onChange({ status, b: status === 'dienst' ? value.b : '', e: status === 'dienst' ? value.e : '' });
    if (status !== 'dienst') onClose();
  }

  // Unter der Zelle, aber niemals aus dem Bild heraus.
  const width = 264;
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8);
  const openUp = anchor.bottom + 260 > window.innerHeight;
  const top = openUp ? undefined : anchor.bottom + 6;
  const bottom = openUp ? window.innerHeight - anchor.top + 6 : undefined;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={boxRef}
        className="lw-card fixed z-50 p-3 shadow-2xl"
        style={{ left, top, bottom, width }}
      >
        <div className="mb-2 text-xs text-lw-text3">
          <span className="font-semibold text-lw-text2">{employee.name}</span> · {dayName}{' '}
          {formatDayMonth(date)}
        </div>

        {(PRESETS[employee.groupNo] ?? []).length > 0 && (
          <>
            <div className="mb-1 text-[10px] font-bold tracking-wide text-lw-text3 uppercase">Vorlagen</div>
            <div className="mb-3 flex flex-wrap gap-1">
              {(PRESETS[employee.groupNo] ?? []).map(([pb, pe]) => (
                <button
                  key={`${pb}-${pe}`}
                  onClick={() => {
                    setB(pb);
                    setE(pe);
                    commit(pb, pe);
                  }}
                  className="lw-btn-ghost tabular px-2 py-1 text-xs"
                >
                  {pb}–{pe}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mb-1 text-[10px] font-bold tracking-wide text-lw-text3 uppercase">Zeit</div>
        <div className="mb-1 flex items-center gap-2">
          <input
            autoFocus
            value={b}
            onChange={(ev) => setB(ev.target.value)}
            onBlur={() => commit(b, e)}
            placeholder="14:30"
            className="lw-input tabular w-full px-2 py-1.5 text-center"
          />
          <span className="text-lw-text3">–</span>
          <input
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            onBlur={() => commit(b, e)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                commit(b, e);
                onClose();
              }
            }}
            placeholder="23:00"
            className="lw-input tabular w-full px-2 py-1.5 text-center"
          />
        </div>
        <div className="mb-3 h-4 text-center text-xs">
          {error ? (
            <span className="text-lw-bad">{error}</span>
          ) : preview > 0 ? (
            <span className="text-lw-text3">{formatMinutes(preview)} Stunden</span>
          ) : null}
        </div>

        <div className="mb-1 text-[10px] font-bold tracking-wide text-lw-text3 uppercase">Status</div>
        <div className="grid grid-cols-2 gap-1">
          {(['frei', 'urlaub', 'krank', 'nein'] as ShiftStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`lw-btn-ghost px-2 py-1.5 text-xs ${value.status === s ? 'ring-1 ring-lw-line2' : ''}`}
            >
              {STATUS_PILL[s].label === '—' ? 'Nicht eingeteilt' : STATUS_PILL[s].label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function Legend() {
  return (
    <div className="nicht-drucken flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-lw-line pt-3 text-xs text-lw-text3">
      <span>Klick auf einen Tag ändert ihn.</span>
      <span className="ml-auto flex flex-wrap gap-x-3">
        {(['urlaub', 'krank'] as ShiftStatus[]).map((s) => (
          <span key={s} className={`rounded px-1.5 py-0.5 ${STATUS_PILL[s].cls}`}>
            {STATUS_PILL[s].label}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Zweiter Reiter: Belegschaft und Bereiche — dieselben Angaben wie bisher. */
function TeamTab({
  employees,
  canEdit,
  onChange,
}: {
  employees: Employee[];
  canEdit: boolean;
  onChange: (list: Employee[]) => void;
}) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState(2);
  const [target, setTarget] = useState('');

  function add() {
    if (!name.trim()) return;
    onChange([
      ...employees,
      { id: `neu-${employees.length}-${name}`, name: name.trim(), groupNo: group, targetHours: Number(target) || 0 },
    ]);
    setName('');
    setTarget('');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section>
        <h2 className="mb-2 text-sm font-bold tracking-wide text-lw-text3 uppercase">Mitarbeiter</h2>
        <div className="lw-card divide-y divide-lw-line overflow-hidden">
          {employees.map((emp) => {
            const group = GROUPS.find((g) => g.no === emp.groupNo);
            return (
              <div key={emp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <span
                  className="h-4 w-1 rounded-full"
                  style={{ background: group?.color ?? 'var(--color-lw-line2)' }}
                />
                <span className="font-semibold">{emp.name}</span>
                <span className="text-xs text-lw-text3">{group?.name}</span>
                <span className="ml-auto text-xs text-lw-text2">
                  {emp.targetHours > 0 ? `${emp.targetHours} h/Woche` : 'ohne Vorgabe'}
                </span>
                {canEdit && (
                  <button
                    onClick={() => onChange(employees.filter((e) => e.id !== emp.id))}
                    className="text-lw-text3 hover:text-lw-bad"
                    aria-label={`${emp.name} entfernen`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="lw-input w-40"
            />
            <select value={group} onChange={(e) => setGroup(Number(e.target.value))} className="lw-input w-44">
              {GROUPS.map((g) => (
                <option key={g.no} value={g.no}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="h/Woche"
              inputMode="numeric"
              className="lw-input w-24"
            />
            <button onClick={add} className="lw-btn-primary px-4 py-2 text-sm">
              Hinzufügen
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold tracking-wide text-lw-text3 uppercase">Bereiche</h2>
        <div className="lw-card divide-y divide-lw-line overflow-hidden">
          {GROUPS.map((g) => (
            <div key={g.no} className="flex items-center gap-3 px-3 py-2.5">
              <span className="h-4 w-1 rounded-full" style={{ background: g.color }} />
              <span className="font-semibold">{g.name}</span>
              <span className="ml-auto text-xs text-lw-text3">
                {employees.filter((e) => e.groupNo === g.no).length} Personen
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-lw-text3">
          Umbenennen, Farbe und Reihenfolge kommen im fertigen Modul dazu — sie ändern nur Stammdaten und
          brauchen keine eigene Gestaltung.
        </p>
        <a href="/dienstplan/index.html" className="mt-4 inline-block text-sm underline underline-offset-2">
          Zum bisherigen Editor →
        </a>
      </section>
    </div>
  );
}
