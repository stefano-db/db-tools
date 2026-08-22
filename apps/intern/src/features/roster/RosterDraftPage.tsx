import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { repository, type ShareLink } from '../../data';
import { teileBild, zeichnePlan } from './planAlsBild';
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

/**
 * Jeder Bereich hat ein Zeichen.
 *
 * Es steht im Bereichsband, damit man es beilaeufig lernt, und taucht auf einer
 * Schicht auf, sobald sie in einem fremden Bereich liegt. Farbe allein wuerde
 * das nicht tragen: aus vier Metern und quer durch die Zeile sagt ein anderer
 * Farbton „irgendwas ist anders", das Zeichen sagt, was.
 */
export const GROUPS: { no: number; name: string; color: string; symbol: string }[] = [
  { no: 1, name: 'Küche', color: '#b8791c', symbol: '🍳' },
  { no: 2, name: 'Service', color: '#c2582a', symbol: '🍻' },
  { no: 3, name: 'Service Aushilfen', color: '#7b57c4', symbol: '🤝' },
  { no: 4, name: 'Counter', color: '#1a7a4c', symbol: '🎳' },
  { no: 5, name: 'Mechanik', color: '#1f6f92', symbol: '🔧' },
];

const gruppe = (no: number) => GROUPS.find((g) => g.no === no) ?? GROUPS[0];

/**
 * Abwesenheit auf der Wandtafel.
 *
 * Kraeftige Flaechen, keine blassen Toene: gelesen wird das aus vier Metern,
 * und was von dort nur „irgendwie hell" aussieht, sagt nichts. Die Zuordnung
 * kommt aus dem Plan, der bisher im Haus haengt — gruen frei, gelb Urlaub —,
 * damit niemand umlernen muss. Die Schrift steht jeweils dunkel auf der
 * Flaeche, damit sie auch aus der Entfernung traegt.
 */
const ABWESEND: Record<string, { background: string; color: string }> = {
  // Das Wort steht leiser als die Flaeche — es benennt nur, was die Farbe
  // schon gesagt hat. Nicht beliebig blass allerdings: bei rund 3,7:1 tritt es
  // zurueck und bleibt aus der Naehe trotzdem lesbar.
  frei: { background: '#b7e4bd', color: '#4a7752' },
  urlaub: { background: '#ffd977', color: '#8a6a28' },
  krank: { background: '#ffb4ae', color: '#8e4f4a' },
  nein: { background: '#e8e2d6', color: '#a9a094' },
};

const ABWESEND_WORT: Record<string, string> = {
  frei: 'frei',
  urlaub: 'Urlaub',
  krank: 'Krank',
  nein: '—',
};

/** Der Bereich, in dem diese Schicht tatsaechlich stattfindet. */
function bereichDerSchicht(day: ShiftDay, stammBereich: number) {
  return day.bereich ?? stammBereich;
}

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

  const [tab, setTab] = useState<'plan' | 'team' | 'teilen'>('plan');
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
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            groupNo: r.groupNo,
            targetHours: r.targetHours,
          })),
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
          Entwurf — Schichten werden nicht gespeichert
        </span>
      </div>

      <nav className="db-scroll-x mt-5 flex gap-1 overflow-x-auto pl-5">
        {(
          [
            ['plan', 'Wochenplan'],
            ['team', 'Mitarbeiter & Bereiche'],
            ['teilen', 'Teilen & Drucken'],
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
            <div className="bildschirm-plan hidden md:block">
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

            {/* Fassung fuers Blatt. Am Bildschirm arbeitet man mit Stundenzahl,
                Wochensumme und ausgeschriebenem „frei" — auf Papier ist das
                Ballast, der die Zeilen zusammendrueckt. Gedruckt wird deshalb
                dieselbe ruhige Form wie an der Wand, in Millimetern statt in
                Bildpunkten bemessen. */}
            <div className="nur-drucken druckplan hidden">
              <div className="druck-kopf">
                <span className="druck-titel">Dienstplan</span>
                <span className="druck-kw">KW {isoWeekNumber(monday)}</span>
                <span className="druck-zeitraum">
                  {formatDayMonth(monday)} – {formatDayMonth(days[6])}
                  {monday.getFullYear()}
                </span>
              </div>
              <TvMatrix
                employees={employees}
                days={days}
                todayIndex={todayIndex}
                weekOf={weekOf}
                woche=""
              />
            </div>
          </>
        ) : tab === 'team' ? (
          <TeamTab employees={employees} canEdit={canEdit} onChange={setEmployees} />
        ) : (
          <TeilenTab
            canEdit={canEdit}
            monday={monday}
            days={days}
            employees={employees}
            weekOf={weekOf}
            beispiel={showExample}
            onAction={flash}
          />
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

/**
 * Fremde Daten kommen als sieben Tage — oder eben nicht.
 *
 * Was aus der Datenbank kommt, ist erst einmal nur JSON: die Eingabe ist
 * deshalb bewusst unbestimmt getypt und wird hier Feld fuer Feld geprueft.
 * Alles Unbekannte wird zu „nicht eingeteilt", nichts wird geraten.
 */
export function normalizeWeek(list: readonly unknown[]): ShiftDay[] {
  const gueltig: ShiftStatus[] = ['dienst', 'frei', 'urlaub', 'krank', 'nein'];
  const week = emptyWeek();
  for (let i = 0; i < 7; i++) {
    const roh = list[i];
    if (roh && typeof roh === 'object') {
      const d = roh as { status?: unknown; b?: unknown; e?: unknown; bereich?: unknown };
      week[i] = {
        status: gueltig.includes(d.status as ShiftStatus) ? (d.status as ShiftStatus) : 'nein',
        b: typeof d.b === 'string' ? d.b : '',
        e: typeof d.e === 'string' ? d.e : '',
        ...(typeof d.bereich === 'number' && GROUPS.some((g) => g.no === d.bereich)
          ? { bereich: d.bereich }
          : {}),
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
      // Eine Aushilfe im fremden Bereich gehoert ins Beispiel — sonst sieht man
      // die Kennzeichnung nie. Sie steht vor der ueblichen Verteilung, damit
      // sie nicht zufaellig auf einen freien Tag faellt.
      if (emp.groupNo === 5 && day === 4) {
        week[day] = { status: 'dienst', b: '17:00', e: '23:00', bereich: 2 };
      } else if (slot === 0 || slot === 3) {
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
                    <span className="text-[13px] font-extrabold tracking-wide uppercase">
                      <span className="mr-1.5">{group.symbol}</span>
                      {group.name}
                    </span>
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
                          stammBereich={emp.groupNo}
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
  stammBereich,
  isToday,
  canEdit,
  onPick,
}: {
  day: ShiftDay;
  stammBereich: number;
  isToday: boolean;
  canEdit: boolean;
  onPick: (rect: DOMRect) => void;
}) {
  const bereich = gruppe(bereichDerSchicht(day, stammBereich));
  const fremd = bereich.no !== stammBereich;
  const color = bereich.color;
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
        style={{ boxShadow: `inset 0 0 0 ${fremd ? 2 : 1}px ${tint(color, fremd ? 70 : 30)}` }}
      >
        <div className="tabular text-sm leading-tight font-bold whitespace-nowrap">
          {fremd && (
            <span className="mr-1" title={bereich.name} aria-label={bereich.name}>
              {bereich.symbol}
            </span>
          )}
          {day.b || '—'}
          <span className="mx-px font-normal text-lw-text3">–</span>
          {day.e || '—'}
        </div>
        <div className="dauer text-[11px] leading-tight text-lw-text3">
          {fremd ? bereich.name : minutes > 0 ? `${formatMinutes(minutes)} h` : ' '}
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
  const [form, setForm] = useState<'tafel' | 'mosaik' | 'editor'>(
    () =>
      (localStorage.getItem('dienstplan-tv-form') as 'tafel' | 'mosaik' | 'editor') ?? 'tafel',
  );
  useEffect(() => {
    localStorage.setItem('dienstplan-tv-form', form);
  }, [form]);

  /**
   * Wie breit der Aufbau angelegt wird.
   *
   * Die Wandtafel ist eigens fuer die Wand gebaut — ihre Breite haengt an der
   * Zahl der Namen und ist damit gesetzt.
   *
   * Die Editor-Ansicht ist dagegen die Bildschirmtabelle, und die soll das
   * Bild fuellen statt klein in der Mitte zu stehen. Skalieren allein reicht
   * dafuer nicht: passt sie in der Hoehe, bleibt links und rechts Platz. Also
   * wird die Breite so gewaehlt, dass die anschliessende Skalierung beides
   * zugleich ausfuellt — Breite mal Hoehenverhaeltnis. Die Hoehe der Tabelle
   * haengt kaum von ihrer Breite ab, deshalb steht das Ergebnis nach einer
   * Nachmessung. Gestreckt wird nichts, nur gleichmaessig vergroessert.
   */
  const [editorBreite, setEditorBreite] = useState(1600);

  /**
   * Das Mosaik einpassen.
   *
   * Bewusst unmittelbar am Element statt ueber den Zustand: gemessen und
   * gesetzt wird dieselbe Eigenschaft, und ueber zwei Zustandsschritte geraet
   * das leicht in eine Schleife, in der die Messung nie fertig wird.
   *
   * Der Ablauf ist einfach: kurz in natuerlicher Groesse aufbauen, messen, und
   * dann den Rahmen auf Bildgroesse geteilt durch den Faktor setzen. Passt
   * alles, ist der Faktor groesser als eins und die Tabelle dehnt sich in den
   * uebrigen Platz. Passt es nicht, ist er kleiner und alles rueckt zusammen.
   * In beiden Faellen steht am Ende genau das Bild da.
   */
  const mosaikRahmenRef = useRef<HTMLDivElement>(null);
  const mosaikInhaltRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (form !== 'mosaik') return;
    const rahmen = mosaikRahmenRef.current;
    const inhalt = mosaikInhaltRef.current;
    if (!rahmen || !inhalt) return;

    const einpassen = () => {
      inhalt.style.width = 'max-content';
      inhalt.style.height = 'auto';
      inhalt.style.transform = 'none';

      const breiteNatur = Math.max(inhalt.offsetWidth, 1);
      const hoeheNatur = Math.max(inhalt.offsetHeight, 1);
      const scale = Math.min(
        rahmen.clientWidth / breiteNatur,
        rahmen.clientHeight / hoeheNatur,
        2.2,
      );

      inhalt.style.width = `${rahmen.clientWidth / scale}px`;
      inhalt.style.height = `${rahmen.clientHeight / scale}px`;
      inhalt.style.transform = `scale(${scale})`;
    };

    einpassen();
    const ro = new ResizeObserver(einpassen);
    ro.observe(rahmen);
    window.addEventListener('resize', einpassen);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', einpassen);
    };
  }, [form, employees, days, weekOf]);
  const aufbauBreite = form === 'editor' ? editorBreite : tafelBreite(employees.length);

  const fit = useCallback(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    // Gemessen wird, was der Inhalt wirklich braucht — nicht, was ihm zugewiesen
    // wurde. Eine Tabelle kann breiter werden als ihr Rahmen, wenn die Spalten
    // mehr Platz brauchen; nach der zugewiesenen Breite gerechnet, schnitte die
    // Skalierung dann die letzte Spalte ab.
    const inhaltBreite = Math.max(inner.offsetWidth, inner.scrollWidth);
    const inhaltHoehe = Math.max(inner.offsetHeight, inner.scrollHeight);

    if (form === 'editor') {
      const gewuenscht = Math.round((box.clientWidth * inhaltHoehe) / Math.max(box.clientHeight, 1));
      const begrenzt = Math.min(2600, Math.max(900, gewuenscht));
      // Nur bei nennenswertem Unterschied nachziehen, sonst pendelt die
      // Rechnung zwischen zwei Werten hin und her.
      if (Math.abs(begrenzt - inner.offsetWidth) > 12) {
        setEditorBreite(begrenzt);
        return;
      }
    }
    // Die Transformation aendert die Groesse des Elements nicht — gemessen wird
    // also immer der unskalierte Aufbau, egal wie oft wir nachrechnen.
    const byWidth = box.clientWidth / inhaltBreite;
    const byHeight = box.clientHeight / inhaltHoehe;
    const scale = Math.min(byWidth, byHeight, 2.2);
    // Der Block ist breiter als der Rahmen und liegt deshalb links an; eine
    // Skalierung aus der Mitte wuerde ihn rechts aus dem Bild schieben. Also
    // linke obere Ecke als Ursprung und die Mitte selbst ausrechnen — sonst
    // fehlen Sonntag und die Wochensumme.
    const dx = (box.clientWidth - inhaltBreite * scale) / 2;
    const dy = (box.clientHeight - inhaltHoehe * scale) / 2;
    setFitted({ scale, dx, dy });
  }, [form]);

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
  }, [fit, form, editorBreite]);

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
            ['mosaik', 'Mosaik'],
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

      {/* Zwei Wege, den Platz zu fuellen — je nachdem, was gezeigt wird.

          Die Wandtafel ist eigens fuer die Wand gebaut: fester Aufbau, der als
          Ganzes passend skaliert wird. Sie soll ihre Verhaeltnisse behalten.

          Die Editor-Ansicht ist die Bildschirmtabelle. Sie zu skalieren hiess,
          sie klein in die Mitte zu stellen — bei neunzehn Namen blieben rechts
          und links zusammen 560 Punkte leer. Eine Tabelle kann sich aber selbst
          strecken: volle Breite fuer die Spalten, volle Hoehe fuer die Zeilen,
          und der Browser verteilt den Platz. Nichts wird dabei verzerrt, es
          steht nur alles weiter auseinander. */}
      {/* Das Mosaik: erst messen, dann dehnen oder verkleinern.
          Dehnen allein reicht nicht — eine Tabelle kann Platz verteilen, aber
          keinen schaffen: bei voller Belegschaft lief sie unten aus dem Bild.
          Skalieren allein reicht auch nicht — die Kacheln haben ihre
          natuerliche Breite, und bei wenigen Leuten blieb die halbe Hoehe leer.
          Also beides: Der Rahmen wird auf Bildgroesse geteilt durch den
          Verkleinerungsfaktor aufgebaut. Passt alles, ist der Faktor groesser
          als eins und die Tabelle dehnt sich in den uebrigen Platz; passt es
          nicht, ist er kleiner und alles rueckt zusammen. In beiden Faellen
          steht am Ende genau das Bild da. */}
      {form === 'mosaik' ? (
        <div ref={mosaikRahmenRef} className="flex-1 overflow-hidden">
          <div ref={mosaikInhaltRef} className="plan-tv plan-tv-dehnen origin-top-left px-5 py-3">
            <TvMosaik
              employees={employees}
              days={days}
              todayIndex={todayIndex}
              weekOf={weekOf}
              woche={`KW ${isoWeekNumber(monday)}`}
            />
          </div>
        </div>
      ) : (
      <div ref={boxRef} className="flex-1 overflow-hidden">
        <div
          ref={innerRef}
          className="plan-tv origin-top-left px-4 py-2"
          style={{
            width: aufbauBreite,
            transform: `translate(${fitted.dx}px, ${fitted.dy}px) scale(${fitted.scale})`,
          }}
        >
          {/* Keine Kopfzeile: die Tagesspalten tragen das Datum bereits, und
              jede Zeile oben kostet Schriftgroesse in allen Feldern darunter.
              Die Kalenderwoche steht in der leeren Ecke ueber der Namensspalte. */}
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
      )}
    </div>
  );
}

/**
 * Wie breit die Tafel aufgebaut wird.
 *
 * Die Flaeche rechnet sich anschliessend selbst passend — sie nimmt den
 * kleineren der beiden Faktoren aus Breite und Hoehe. Damit bestimmt der
 * Aufbau, welcher der beiden bremst: Baut man immer 1820 Punkte breit, ist bei
 * wenigen Leuten die Breite der Engpass, und die Tafel bleibt klein, obwohl
 * unten das halbe Bild leer steht.
 *
 * Also schmaler bauen, wenn wenige arbeiten: dann darf die Hoehe entscheiden,
 * und die Felder werden groesser. Mit jedem zusaetzlichen Namen wird der Aufbau
 * breiter und damit dichter — bis bei etwa fuenfzehn Namen die volle Breite
 * erreicht ist.
 */
export function tafelBreite(zeilen: number): number {
  // Durch zwei Punkte gelegt: bei fuenf Namen rund 1050 Punkte, bei neunzehn
  // die volle Breite. Dazwischen waechst der Aufbau mit jedem Namen um 55.
  return Math.round(Math.min(1820, Math.max(1000, 775 + zeilen * 55)));
}

/**
 * Dritter Entwurf: das Mosaik.
 *
 * Derselbe Auftrag, anderer Grundgedanke. Die Wandtafel setzt eine weisse
 * Kapsel auf eine getoente Zeile — die Farbe liegt also *hinter* der Auskunft.
 * Hier ist die Zelle selbst die Farbe: jedes Feld ist eine geschlossene
 * Flaeche, und die Woche wird zum Muster, das man aus zehn Metern liest, bevor
 * man ueberhaupt eine Zahl erkennt. Weiss heisst Dienst, gruen frei, gelb
 * Urlaub, rot krank.
 *
 * Was aus den bisherigen Anforderungen uebernommen ist:
 *
 *   Eine Person bleibt eine Zeile, sonst kann man niemanden ueber die Woche
 *   verfolgen. Bereiche haben Farbe und Zeichen und stehen als Band ueber
 *   ihrer Gruppe. Die Zeit steht schwarz und ruhig, Beginn fett, Ende leichter,
 *   dazwischen der Pfeil. Freie Tage tragen ihr Wort leise. Der heutige Tag
 *   ist markiert. Eine fremde Schicht zeigt das Zeichen ihres Bereichs.
 *
 * Was neu ist:
 *
 *   Keine Raender, keine Rundungen, keine Toenung der Zeile — nur Flaechen mit
 *   schmaler weisser Fuge dazwischen. Der Bereich steht als kraeftiger Balken
 *   an der Namensspalte statt als Toenung ueber der ganzen Zeile.
 *
 *   Unter den Spalten steht, wie viele an dem Tag im Dienst sind. Auf einer
 *   Tafel, die aus der Ferne gelesen wird, ist das die zweite Frage nach
 *   „arbeite ich" — und die Zahl beantwortet sie, ohne dass jemand zaehlt.
 */
export function TvMosaik({
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
    <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
      <thead>
        <tr>
          <th className="w-[200px] px-2 text-left align-bottom">
            <span className="text-2xl font-extrabold text-lw-text3">{woche}</span>
          </th>
          {days.map((d, i) => {
            const heute = i === todayIndex;
            return (
              <th
                key={i}
                className="px-2 py-1.5 text-center"
                style={{
                  background: heute ? 'rgba(224,160,56,0.22)' : 'transparent',
                  color: heute ? '#8a5a10' : 'var(--color-lw-text2)',
                }}
              >
                <div className="text-2xl leading-none font-extrabold">{DAY_SHORT[i]}</div>
                <div className="mt-0.5 text-base leading-none">{formatDayMonth(d)}</div>
              </th>
            );
          })}
        </tr>
      </thead>

      {gruppen.map((group) => (
        <tbody key={group.no}>
          <tr>
            <td colSpan={8} className="pt-3">
              {/* Das Band traegt jetzt Flaeche: farbige Schrift allein
                  verschwand zwischen den vielen bunten Zellen darunter. */}
              <div
                className="flex items-center gap-2 rounded px-3 py-1 text-lg font-extrabold tracking-wide uppercase"
                style={{ background: tint(group.color, 22), color: group.color }}
              >
                <span>{group.symbol}</span>
                {group.name}
                <span className="ml-auto text-base font-bold opacity-70">
                  {employees.filter((e) => e.groupNo === group.no).length}
                </span>
              </div>
            </td>
          </tr>

          {employees
            .filter((e) => e.groupNo === group.no)
            .map((emp) => {
              const week = weekOf(emp.id);
              return (
                <tr key={emp.id}>
                  <th
                    scope="row"
                    className="px-3 py-1 text-left text-xl font-bold whitespace-nowrap"
                    style={{
                      // Die Namensspalte gehoert dem Bereich: leicht getoent und
                      // mit kraeftigem Balken davor. So laeuft die Zuordnung als
                      // durchgehendes Band links mit, ohne sich unter die
                      // Farbflaechen der Tage zu mischen.
                      background: tint(group.color, 12),
                      borderLeft: `8px solid ${group.color}`,
                    }}
                  >
                    {emp.name}
                  </th>

                  {week.map((day, i) => {
                    const b = gruppe(bereichDerSchicht(day, emp.groupNo));
                    const fremd = day.status === 'dienst' && b.no !== emp.groupNo;
                    const flaeche =
                      day.status === 'dienst' ? { background: '#ffffff' } : ABWESEND[day.status];

                    return (
                      <td
                        key={i}
                        className="px-2 py-1.5 text-center align-middle"
                        style={{
                          ...flaeche,
                          // Der heutige Tag bekommt einen Rahmen um die ganze
                          // Spalte statt einer eigenen Farbe — die ist hier
                          // schon vergeben.
                          boxShadow:
                            i === todayIndex ? 'inset 0 0 0 2px rgba(224,160,56,0.55)' : undefined,
                        }}
                        title={fremd ? b.name : undefined}
                      >
                        {day.status === 'dienst' ? (
                          <span className="tabular text-xl leading-tight whitespace-nowrap">
                            {fremd && (
                              <span className="mr-1" style={{ color: b.color }}>
                                {b.symbol}
                              </span>
                            )}
                            <span className="font-bold text-lw-text">{day.b}</span>
                            <span className="mx-1 font-normal text-lw-text3">→</span>
                            <span className="font-medium text-lw-text2">{day.e}</span>
                          </span>
                        ) : (
                          <span
                            className="text-base font-semibold"
                            style={{ color: (ABWESEND[day.status] ?? {}).color }}
                          >
                            {ABWESEND_WORT[day.status]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>
      ))}

      <tfoot>
        <tr>
          <th className="px-3 pt-2 text-left text-sm font-semibold tracking-wide text-lw-text3 uppercase">
            Im Dienst
          </th>
          {days.map((_, i) => {
            const anzahl = employees.filter((e) => weekOf(e.id)[i].status === 'dienst').length;
            return (
              <td key={i} className="pt-2 text-center">
                <span className="text-xl font-extrabold text-lw-text2">{anzahl}</span>
              </td>
            );
          })}
        </tr>
      </tfoot>
    </table>
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
export function TvMatrix({
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
                <span className="mr-2">{group.symbol}</span>
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
                        (() => {
                          const b = gruppe(bereichDerSchicht(day, emp.groupNo));
                          const fremd = b.no !== emp.groupNo;
                          return (
                            <div
                              className="rounded-lg bg-white px-3 py-2 text-center"
                              style={{
                                // Ein leichter Rand in der Bereichsfarbe fasst
                                // die Zeit ein und bindet sie an ihren Bereich.
                                // Die fremde Schicht bekommt ihn kraeftiger —
                                // sie soll auffallen, nicht nur dazugehoeren.
                                boxShadow: `inset 0 0 0 ${fremd ? 2 : 1}px ${tint(
                                  b.color,
                                  fremd ? 70 : 32,
                                )}`,
                              }}
                              title={fremd ? b.name : undefined}
                            >
                              {/* Schwarz statt Bereichsfarbe: die Farbe steht
                                  ohnehin ringsum — in der Zeile, im Band und im
                                  Rand der Kapsel. Auf der Zeit selbst hat sie
                                  nur Gewicht genommen, das die Lesbarkeit
                                  braucht. Der Pfeil und die leichtere zweite
                                  Zahl sagen ohne Worte, was Beginn und was Ende
                                  ist. */}
                              <span className="tabular text-[19px] leading-tight whitespace-nowrap">
                                {fremd && (
                                  <span className="mr-1" style={{ color: b.color }}>
                                    {b.symbol}
                                  </span>
                                )}
                                <span className="font-bold text-lw-text">{day.b}</span>
                                <span className="mx-1 font-normal text-lw-text3">→</span>
                                <span className="font-medium text-lw-text2">{day.e}</span>
                              </span>
                            </div>
                          );
                        })()
                      ) : (
                        // Wer nicht arbeitet, bekommt Flaeche statt Andeutung.
                        // Im Haus haengt der Plan seit jeher so: gruen heisst
                        // frei, gelb heisst Urlaub — daran liest die Mannschaft
                        // in einer Sekunde ab, wer da ist. Weiss bleibt der
                        // Arbeitstag, damit die Zeit darauf steht.
                        <div
                          className="rounded-lg px-3 py-2 text-center text-base font-semibold"
                          style={ABWESEND[day.status]}
                        >
                          {ABWESEND_WORT[day.status]}
                        </div>
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
    onChange({ ...value, status: 'dienst', b: pb, e: pe });
  }

  function setStatus(status: ShiftStatus) {
    onChange({
      ...value,
      status,
      b: status === 'dienst' ? value.b : '',
      e: status === 'dienst' ? value.e : '',
    });
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

        {/* Aushelfen in einem anderen Bereich ist der Grund, warum der Bereich
            an der Schicht haengt. Der Stammbereich steht vorn und ist der
            Normalfall — man waehlt nur, wenn es einmal anders ist. */}
        <div className="mb-1 text-[10px] font-bold tracking-wide text-lw-text3 uppercase">Bereich</div>
        <div className="mb-3 flex flex-wrap gap-1">
          {GROUPS.map((g) => {
            const aktiv = bereichDerSchicht(value, employee.groupNo) === g.no;
            return (
              <button
                key={g.no}
                title={g.name}
                onClick={() =>
                  onChange({
                    ...value,
                    status: 'dienst',
                    ...(g.no === employee.groupNo ? { bereich: undefined } : { bereich: g.no }),
                  })
                }
                className={`rounded-md px-2 py-1 text-sm ${aktiv ? 'text-white' : 'lw-btn-ghost'}`}
                style={aktiv ? { background: g.color } : undefined}
              >
                {g.symbol}
                {g.no === employee.groupNo && <span className="ml-1 text-[10px]">Stamm</span>}
              </button>
            );
          })}
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

/**
 * Reiter „Teilen & Drucken".
 *
 * Drei Wege aus dem Programm heraus, fuer drei verschiedene Gewohnheiten:
 *
 *   Der Link ist der einzige, der nicht veraltet — wer ihn in der Gruppe
 *   anpinnt, sieht nach jeder Aenderung den neuen Stand, ohne dass jemand
 *   etwas verschickt. Er zeigt ausschliesslich die laufende Woche, damit die
 *   Planung fuer spaeter nicht mitliest, und er ist einzeln zurueckziehbar.
 *
 *   Das Bild ist ein Stand von jetzt. Dafuer sieht man es im Chat sofort,
 *   ohne zu tippen — so, wie ihr die Plaene bisher verschickt habt.
 *
 *   Das Blatt ist fuer die Wand und den Ordner: A4 quer, eine Seite.
 */
function TeilenTab({
  canEdit,
  monday,
  days,
  employees,
  weekOf,
  beispiel,
  onAction,
}: {
  canEdit: boolean;
  monday: Date;
  days: Date[];
  employees: Employee[];
  weekOf: (id: string) => ShiftDay[];
  /** Laeuft gerade die erfundene Beispielwoche? Dann darf nichts hinausgehen. */
  beispiel: boolean;
  onAction: (text: string) => void;
}) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [label, setLabel] = useState('Signal-Gruppe');
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    repository
      .listShareLinks()
      .then((l) => aktiv && setLinks(l))
      .catch((e) => aktiv && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aktiv = false;
    };
  }, []);

  const adresse = (token: string) => `${window.location.origin}/plan/${token}`;

  async function anlegen() {
    try {
      const neu = await repository.createShareLink(label.trim() || 'Ohne Namen');
      setLinks((l) => [neu, ...(l ?? [])]);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function widerrufen(token: string) {
    try {
      await repository.revokeShareLink(token);
      setLinks((l) =>
        (l ?? []).map((x) => (x.token === token ? { ...x, revokedAt: new Date().toISOString() } : x)),
      );
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function teilen(token: string) {
    const url = adresse(token);
    if (navigator.share) {
      await navigator.share({ title: 'Dienstplan', url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url);
    onAction('Link kopiert.');
  }

  async function bild() {
    try {
      const canvas = zeichnePlan({
        monday,
        days,
        bereiche: GROUPS,
        personen: employees,
        weekOf,
      });
      const wie = await teileBild(canvas, `Dienstplan-KW${isoWeekNumber(monday)}.png`);
      onAction(wie === 'geteilt' ? 'Bild weitergegeben.' : 'Bild gespeichert — jetzt in Signal anhängen.');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  const aktive = (links ?? []).filter((l) => !l.revokedAt);
  const alte = (links ?? []).filter((l) => l.revokedAt);

  return (
    <div className="space-y-6">
      {fehler && (
        <p className="rounded-lg bg-lw-bad/10 px-4 py-2.5 text-sm text-lw-bad">■ {fehler}</p>
      )}

      {/* Ein Bild der erfundenen Beispielwoche in der Signal-Gruppe waere
          schlimmer als gar keines: es sieht aus wie ein echter Plan. */}
      {beispiel && (
        <p className="rounded-lg bg-lw-warn/10 px-4 py-2.5 text-sm text-lw-warn">
          ▲ Die Beispielwoche ist eingeschaltet — die Schichten sind erfunden. Zum Weitergeben oben
          im Reiter „Wochenplan" den Haken entfernen.
        </p>
      )}

      <section>
        <h2 className="text-sm font-bold tracking-wide text-lw-text3 uppercase">Als Bild in die Gruppe</h2>
        <p className="mt-1 mb-3 text-sm text-lw-text2">
          Erzeugt ein Bild der Woche. Am Handy öffnet sich das Teilen-Menü — dort steht Signal; am
          Rechner wird die Datei gespeichert und du hängst sie an.
        </p>
        <button
          onClick={bild}
          disabled={beispiel}
          className="lw-btn-primary px-4 py-2 text-sm disabled:opacity-40"
        >
          Bild erzeugen und teilen
        </button>
      </section>

      <section>
        <h2 className="text-sm font-bold tracking-wide text-lw-text3 uppercase">Link zum Anpinnen</h2>
        <p className="mt-1 mb-3 text-sm text-lw-text2">
          Anders als die Schichten im Entwurf sind diese Links <strong>echt</strong>: sie wirken
          sofort und zeigen den laufenden Plan aus der Datenbank. Nach einer Änderung musst du
          nichts erneut schicken. Ohne Anmeldung lesbar, deshalb nur weitergeben, wo es hingehört;
          jeder Link ist einzeln zurückziehbar.
        </p>

        {links === null ? (
          <p className="text-sm text-lw-text3">Wird geladen…</p>
        ) : (
          <div className="space-y-2">
            {aktive.map((l) => (
              <div key={l.token} className="lw-card flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className="font-semibold">{l.label}</span>
                <span className="text-xs text-lw-text3">{l.useCount}× geöffnet</span>
                <code className="w-full truncate text-xs text-lw-text2 sm:w-auto sm:flex-1">
                  {adresse(l.token)}
                </code>
                <button onClick={() => teilen(l.token)} className="lw-btn-ghost px-3 py-1.5 text-sm">
                  Teilen
                </button>
                {canEdit && (
                  <button
                    onClick={() => widerrufen(l.token)}
                    className="lw-btn-ghost px-3 py-1.5 text-sm"
                  >
                    Zurückziehen
                  </button>
                )}
              </div>
            ))}

            {aktive.length === 0 && (
              <p className="text-sm text-lw-text3">Noch kein Link vergeben.</p>
            )}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Wofür? z. B. Signal-Gruppe"
                  className="lw-input w-56"
                />
                <button onClick={anlegen} className="lw-btn-ghost px-4 py-2 text-sm">
                  Link erstellen
                </button>
              </div>
            )}

            {alte.length > 0 && (
              <p className="pt-2 text-xs text-lw-text3">
                {alte.length} zurückgezogene{alte.length === 1 ? 'r' : ''} Link
                {alte.length === 1 ? '' : 's'} — bleiben zur Nachvollziehbarkeit stehen und
                funktionieren nicht mehr.
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold tracking-wide text-lw-text3 uppercase">Auf Papier</h2>
        <p className="mt-1 mb-3 text-sm text-lw-text2">
          A4 quer, eine Seite. Im Druckfenster statt eines Druckers „Als PDF sichern" wählen, wenn du
          eine Datei brauchst.
        </p>
        <button
          onClick={() => window.print()}
          disabled={beispiel}
          className="lw-btn-ghost px-4 py-2 text-sm disabled:opacity-40"
        >
          Drucken
        </button>
      </section>
    </div>
  );
}

/**
 * Zweiter Reiter: Belegschaft und Bereiche.
 *
 * Anders als die Schichten wirkt hier alles sofort auf den echten Plan — ein
 * Name, den man entfernt, war sonst beim naechsten Laden wieder da, weil die
 * Liste aus der Datenbank kommt und nicht aus dem Entwurf.
 *
 * Entfernen heisst stilllegen, nicht loeschen: an einem Namen haengen die
 * Schichten vergangener Wochen. Wer ihn loescht, reisst Loecher in jede
 * Historie, in der die Person vorkommt.
 */
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
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  /** Nach jeder Aenderung frisch aus der Datenbank lesen — sonst zeigt die
      Liste, was jemand wollte, statt was tatsaechlich gespeichert ist. */
  async function neuLaden() {
    const rows = await repository.listRosterEmployees();
    onChange(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        groupNo: r.groupNo,
        targetHours: r.targetHours,
      })),
    );
  }

  async function fuehreAus(arbeit: () => Promise<void>) {
    setLaeuft(true);
    setFehler(null);
    try {
      await arbeit();
      await neuLaden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section>
        <h2 className="mb-2 text-sm font-bold tracking-wide text-lw-text3 uppercase">Mitarbeiter</h2>
        <p className="mb-3 text-sm text-lw-text2">
          Änderungen hier wirken <strong>sofort auf den echten Plan</strong> — anders als die
          Schichten im Entwurf. Wer entfernt wird, verschwindet aus dem Plan, bleibt aber in den
          vergangenen Wochen stehen.
        </p>

        {fehler && (
          <p className="mb-3 rounded-lg bg-lw-bad/10 px-4 py-2.5 text-sm text-lw-bad">■ {fehler}</p>
        )}

        <div className="lw-card divide-y divide-lw-line overflow-hidden">
          {employees.map((emp) => {
            const g = gruppe(emp.groupNo);
            return (
              <div key={emp.id} className="flex items-center gap-3 px-3 py-2">
                <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{emp.name}</span>

                {canEdit ? (
                  <select
                    value={emp.groupNo}
                    disabled={laeuft}
                    onChange={(e) =>
                      void fuehreAus(() =>
                        repository.rosterEmployeeSpeichern({
                          id: emp.id,
                          name: emp.name,
                          groupNo: Number(e.target.value),
                          targetHours: emp.targetHours,
                        }),
                      )
                    }
                    className="lw-input w-40 shrink-0 py-1 text-sm"
                  >
                    {GROUPS.map((x) => (
                      <option key={x.no} value={x.no}>
                        {x.symbol} {x.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-lw-text3">{g.name}</span>
                )}

                {canEdit && (
                  <button
                    disabled={laeuft}
                    onClick={() => {
                      if (confirm(`„${emp.name}" aus dem Plan nehmen?`)) {
                        void fuehreAus(() => repository.rosterEmployeeEntfernen(emp.id));
                      }
                    }}
                    className="shrink-0 px-1 text-lw-text3 hover:text-lw-bad disabled:opacity-40"
                    aria-label={`${emp.name} entfernen`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {employees.length === 0 && (
            <p className="px-3 py-4 text-sm text-lw-text3">Noch niemand im Plan.</p>
          )}
        </div>

        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="lw-input w-40"
            />
            <select
              value={group}
              onChange={(e) => setGroup(Number(e.target.value))}
              className="lw-input w-44"
            >
              {GROUPS.map((g) => (
                <option key={g.no} value={g.no}>
                  {g.symbol} {g.name}
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
            <button
              disabled={laeuft || !name.trim()}
              onClick={() =>
                void fuehreAus(async () => {
                  await repository.rosterEmployeeSpeichern({
                    name: name.trim(),
                    groupNo: group,
                    targetHours: Number(target) || 0,
                  });
                  setName('');
                  setTarget('');
                })
              }
              className="lw-btn-primary px-4 py-2 text-sm disabled:opacity-40"
            >
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
              <span>{g.symbol}</span>
              <span className="font-semibold">{g.name}</span>
              <span className="ml-auto text-xs text-lw-text3">
                {employees.filter((e) => e.groupNo === g.no).length} Personen
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-lw-text3">
          Umbenennen, Farbe und Reihenfolge kommen im fertigen Modul dazu — sie ändern nur
          Stammdaten und brauchen keine eigene Gestaltung.
        </p>
        <a href="/dienstplan/index.html" className="mt-4 inline-block text-sm underline underline-offset-2">
          Zum bisherigen Editor →
        </a>
      </section>
    </div>
  );
}
