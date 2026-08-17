import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  cascadeTargets,
  formatDateDe,
  formatFrames,
  formatWeeks,
  type MaintenanceStatus,
  type MaintenanceTask,
  type MaintenanceType,
  type TaskResult,
} from '../../core';
import { useData } from '../../app/DataContext';
import { StatusChip, StatusDot, STATUS_STYLE } from '../../ui/status';
import { IssueDialog } from '../issues/IssueDialog';

export function LanePage() {
  const { laneNumber } = useParams();
  const navigate = useNavigate();
  const { snapshot, overviews, repo, reload, employee, today, isAdmin } = useData();
  const [openTypeId, setOpenTypeId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<string[] | null>(null);

  const overview = overviews.find((o) => String(o.lane.laneNumber) === laneNumber);

  const pairLabel = useMemo(() => {
    if (!snapshot || !overview) return null;
    const laneRow = snapshot.lanes.find((l) => l.laneId === overview.lane.laneId);
    return snapshot.pairs.find((p) => p.id === laneRow?.pairId)?.label ?? null;
  }, [snapshot, overview]);

  if (!snapshot) return <p className="text-slate-500">Wird geladen…</p>;
  if (!overview) return <p className="text-slate-500">Bahn nicht gefunden.</p>;

  const { lane, statuses } = overview;
  const due = statuses.filter((s) => s.kind === 'due');
  const others = statuses.filter((s) => s.kind !== 'due');
  const issues = snapshot.issues.filter((i) => i.laneId === lane.laneId && i.status !== 'resolved');
  const history = snapshot.records
    .filter((r) => r.laneId === lane.laneId && r.source !== 'initial_import')
    .slice(0, 5);
  // Auch die ersetzten Eingaben: eine Korrektur muss nachvollziehbar bleiben.
  const readings = snapshot.readings.filter((r) => r.laneId === lane.laneId).slice(0, 10);

  const openType = snapshot.types.find((t) => t.id === openTypeId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate(-1)} className="text-sm font-medium text-slate-600 hover:underline">
          ← Zurück
        </button>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <StatusDot kind={overview.worst} />
              Bahn {lane.laneNumber}
            </h1>
            {pairLabel && <p className="text-sm text-slate-500">Bahnpaar {pairLabel}</p>}
          </div>
          <div className="text-right">
            <div className="tabular text-3xl font-bold">
              {lane.currentFrames === null ? '—' : formatFrames(lane.currentFrames)}
            </div>
            <div className="text-sm text-slate-500">
              {lane.lastReadingDate ? `abgelesen ${formatDateDe(lane.lastReadingDate)}` : 'keine Ablesung'}
              {lane.framesPerWeek ? ` · ca. ${formatFrames(lane.framesPerWeek)} Frames/Woche` : ''}
            </div>
          </div>
        </div>
      </div>

      {confirmation && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <div className="font-semibold">● Wartung gespeichert</div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {confirmation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {due.length > 0 && (
        <Section title="Fällige Wartung">
          {due.map((s) => (
            <StatusRow
              key={s.maintenanceTypeId}
              status={s}
              onOpen={() => setOpenTypeId(s.maintenanceTypeId)}
              open={openTypeId === s.maintenanceTypeId}
            />
          ))}
        </Section>
      )}

      {statuses.some((s) => s.kind === 'unknown') && (
        <div className="rounded border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong className="font-semibold">? Wartungsstand unbekannt.</strong> Für diese Intervalle
          ist nicht hinterlegt, bei welchem Frame-Stand zuletzt gewartet wurde. Die App rät bewusst
          nicht und meldet deshalb weder „fällig" noch „in Ordnung". Sobald du die Wartung einmal
          regulär abschließt, ist der Ausgangspunkt gesetzt und die Berechnung läuft von allein.
        </div>
      )}

      <Section title={due.length > 0 ? 'Nicht fällig' : 'Wartungsstand'}>
        {others.map((s) => (
          <StatusRow
            key={s.maintenanceTypeId}
            status={s}
            onOpen={() => setOpenTypeId(s.maintenanceTypeId)}
            open={openTypeId === s.maintenanceTypeId}
            early
          />
        ))}
      </Section>

      {openType && (
        <ChecklistForm
          key={openType.id}
          lane={overview.lane}
          type={openType}
          types={snapshot.types}
          tasks={snapshot.tasks}
          pairLabel={pairLabel}
          statuses={statuses}
          cascadeDefault
          onCancel={() => setOpenTypeId(null)}
          onSubmit={async (blocks, notes) => {
            await repo.completeMaintenance({
              laneId: lane.laneId,
              performedOn: today,
              employeeName: employee,
              notes,
              blocks,
            });
            const lines = blocks.map((b) => {
              const t = snapshot.types.find((x) => x.id === b.maintenanceTypeId)!;
              const next = (lane.currentFrames ?? 0) + t.intervalFrames;
              return `${t.code}-Wartung abgeschlossen bei ${formatFrames(lane.currentFrames ?? 0)} — nächste Wartung bei ca. ${formatFrames(next)} Frames`;
            });
            setConfirmation(lines);
            setOpenTypeId(null);
            await reload();
          }}
        />
      )}

      <Section
        title="Offene Defekte"
        action={
          <button onClick={() => setIssueOpen(true)} className="text-sm font-semibold text-slate-700 hover:underline">
            + Defekt melden
          </button>
        }
      >
        {issues.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">Keine offenen Meldungen.</p>
        ) : (
          issues.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="font-medium">🔧 {i.title}</span>
              <span className="text-sm text-slate-500">
                gemeldet {formatDateDe(i.reportedAt.slice(0, 10))} von {i.reportedBy}
              </span>
              <button
                onClick={async () => {
                  await repo.updateIssueStatus(i.id, 'resolved');
                  await reload();
                }}
                className="ml-auto rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50"
              >
                Erledigt
              </button>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Letzte Wartungen"
        action={
          <Link to={`/wartung/historie?bahn=${lane.laneNumber}`} className="text-sm font-semibold text-slate-700 hover:underline">
            Gesamte Historie →
          </Link>
        }
      >
        {history.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">Noch keine Wartung dokumentiert.</p>
        ) : (
          history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="tabular w-24 text-slate-600">{formatDateDe(r.performedOn)}</span>
              <span className="font-semibold">{r.typeCode}</span>
              <span className="tabular text-slate-600">{formatFrames(r.cumulativeFrames)}</span>
              <span className="text-slate-500">{r.employeeName}</span>
              {r.source === 'cascade' && <span className="text-xs text-slate-400">↳ mitkaskadiert</span>}
              {r.hasDeviation && <span className="text-xs font-semibold text-amber-700">▲ Abweichung</span>}
            </div>
          ))
        )}
      </Section>

      <Section title="Frame-Eingaben">
        {readings.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">Noch keine Ablesung erfasst.</p>
        ) : (
          readings.map((r) => (
            <div
              key={r.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm ${
                r.supersededById ? 'text-slate-400' : ''
              }`}
            >
              <span className="tabular w-24">{formatDateDe(r.readingDate)}</span>
              <span className={`tabular w-28 text-right font-semibold ${r.supersededById ? 'line-through' : ''}`}>
                {formatFrames(r.rawValue)}
              </span>
              <span className="tabular text-slate-500">
                = {formatFrames(r.cumulativeFrames)} gesamt
              </span>
              {r.supersededById && <span className="text-xs">ersetzt</span>}
              {r.correctionReason && <span className="text-xs text-slate-500">{r.correctionReason}</span>}
            </div>
          ))
        )}
      </Section>

      {isAdmin && (
        <ResetLaneSection
          laneNumber={lane.laneNumber}
          hasData={
            lane.currentFrames !== null ||
            snapshot.records.some((r) => r.laneId === lane.laneId)
          }
          onReset={async () => {
            const result = await repo.resetLane(lane.laneId);
            await reload();
            return result;
          }}
        />
      )}

      {issueOpen && <IssueDialog laneId={lane.laneId} onClose={() => setIssueOpen(false)} />}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {children}
      </div>
    </section>
  );
}

function StatusRow({
  status,
  onOpen,
  open,
  early = false,
}: {
  status: MaintenanceStatus;
  onOpen: () => void;
  open: boolean;
  early?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <StatusChip kind={status.kind} label={status.code} />
      <span className={`font-semibold ${STATUS_STYLE[status.kind].text}`}>{status.label}</span>
      <span className="text-sm text-slate-600">{status.detail}</span>
      {status.kind === 'due_soon' && status.estimatedDueDate && (
        <span className="text-sm text-slate-400">voraussichtlich {formatDateDe(status.estimatedDueDate)}</span>
      )}
      <button
        onClick={onOpen}
        disabled={status.kind === 'no_data'}
        title={
          status.kind === 'no_data'
            ? 'Erst einen Frame-Stand eintragen, dann lässt sich die Wartung dokumentieren.'
            : undefined
        }
        className={`ml-auto rounded px-3 py-2 text-sm font-semibold disabled:opacity-40 ${
          open
            ? 'bg-slate-200 text-slate-700'
            : early && status.kind !== 'unknown'
              ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              : 'bg-slate-900 text-white'
        }`}
      >
        {open
          ? 'Geöffnet'
          : status.kind === 'unknown'
            ? 'Wartung durchführen und Stand setzen'
            : status.kind === 'no_data'
              ? 'Kein Frame-Stand'
              : early
                ? 'Vorzeitig durchführen'
                : 'Wartung öffnen'}
      </button>
    </div>
  );
}

interface Block {
  maintenanceTypeId: string;
  tasks: { taskId: string; result: TaskResult }[];
}

function ChecklistForm({
  lane,
  type,
  types,
  tasks,
  pairLabel,
  statuses,
  cascadeDefault,
  onCancel,
  onSubmit,
}: {
  lane: { laneId: string; laneNumber: number; currentFrames: number | null };
  type: MaintenanceType;
  types: MaintenanceType[];
  tasks: MaintenanceTask[];
  pairLabel: string | null;
  statuses: MaintenanceStatus[];
  cascadeDefault: boolean;
  onCancel: () => void;
  onSubmit: (blocks: Block[], notes?: string) => Promise<void>;
}) {
  const cascade = cascadeTargets(type, types);
  const [cascadeOn, setCascadeOn] = useState(cascadeDefault && cascade.length > 0);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(cascade.map((t) => t.id)));
  const [results, setResults] = useState<Record<string, TaskResult>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const tasksOf = (typeId: string) =>
    tasks.filter((t) => t.maintenanceTypeId === typeId).sort((a, b) => a.sortOrder - b.sortOrder);

  const activeTypes = [type, ...(cascadeOn ? cascade.filter((c) => enabledTypes.has(c.id)) : [])];
  const activeTasks = activeTypes.flatMap((t) => tasksOf(t.id));
  const openTasks = activeTasks.filter((t) => (results[t.id] ?? 'open') === 'open');
  const hasDeviation = openTasks.length > 0;
  const canSubmit = !hasDeviation || notes.trim().length > 0;

  function setResult(taskId: string, result: TaskResult) {
    setResults((r) => ({ ...r, [taskId]: result }));
  }

  async function submit() {
    setSaving(true);
    try {
      const blocks: Block[] = activeTypes.map((t) => ({
        maintenanceTypeId: t.id,
        tasks: tasksOf(t.id).map((task) => ({ taskId: task.id, result: results[task.id] ?? 'open' })),
      }));
      await onSubmit(blocks, notes.trim() || undefined);
    } finally {
      setSaving(false);
    }
  }

  const status = statuses.find((s) => s.maintenanceTypeId === type.id);
  const early = status?.kind !== 'due';

  return (
    <section className="rounded-lg border-2 border-slate-900 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{type.nameDe} — Wartung durchführen</h2>
        <button onClick={onCancel} className="text-sm text-slate-600 hover:underline">
          Abbrechen
        </button>
      </div>

      {early && (
        <p className="mt-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Diese Wartung ist noch nicht fällig. Beim Abschluss wird der aktuelle Stand
          {lane.currentFrames !== null && <> ({formatFrames(lane.currentFrames)})</>} als neuer Ausgangspunkt
          gesetzt.
        </p>
      )}

      <TaskList
        title="Aufgaben dieses Intervalls"
        tasks={tasksOf(type.id)}
        results={results}
        setResult={setResult}
        pairLabel={pairLabel}
      />

      {cascade.length > 0 && (
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={cascadeOn}
              onChange={(e) => setCascadeOn(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              Kleinere Intervalle mit erledigen
              <span className="block font-normal text-slate-600">
                Wird üblicherweise mitgemacht, weil du ohnehin an der Maschine bist. Einzeln abwählbar.
              </span>
            </span>
          </label>

          {cascadeOn &&
            cascade.map((c) => (
              <div key={c.id} className="mt-3 border-t border-slate-200 pt-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={enabledTypes.has(c.id)}
                    onChange={(e) =>
                      setEnabledTypes((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                    className="h-4 w-4"
                  />
                  {c.nameDe}
                </label>
                {enabledTypes.has(c.id) && (
                  <TaskList
                    tasks={tasksOf(c.id)}
                    results={results}
                    setResult={setResult}
                    pairLabel={pairLabel}
                    compact
                  />
                )}
              </div>
            ))}
        </div>
      )}

      <label className="mt-4 block text-sm font-medium">
        Notiz {hasDeviation && <span className="text-amber-700">(Pflicht bei offenen Aufgaben)</span>}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="z. B. String an Pin 7 beschädigt – nächste Woche tauschen."
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">
          {activeTasks.length - openTasks.length} von {activeTasks.length} Aufgaben erledigt
          {openTasks.length > 0 && ` · ${openTasks.length} offen`}
        </span>
        <button
          onClick={submit}
          disabled={!canSubmit || saving}
          className={`ml-auto rounded px-5 py-3 font-semibold text-white disabled:opacity-40 ${
            hasDeviation ? 'bg-amber-600' : 'bg-slate-900'
          }`}
        >
          {saving ? 'Wird gespeichert…' : hasDeviation ? 'Mit Abweichung abschließen' : 'Wartung abschließen'}
        </button>
      </div>
    </section>
  );
}

function TaskList({
  title,
  tasks,
  results,
  setResult,
  pairLabel,
  compact = false,
}: {
  title?: string;
  tasks: MaintenanceTask[];
  results: Record<string, TaskResult>;
  setResult: (taskId: string, result: TaskResult) => void;
  pairLabel: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'mt-2' : 'mt-3'}>
      {title && <h3 className="mb-1 text-sm font-semibold text-slate-600">{title}</h3>}
      <ul className="divide-y divide-slate-100 rounded border border-slate-200">
        {tasks.map((task) => {
          const result = results[task.id] ?? 'open';
          return (
            <li key={task.id} className="flex items-center gap-3 bg-white px-3 py-2.5">
              <input
                type="checkbox"
                checked={result === 'done'}
                onChange={(e) => setResult(task.id, e.target.checked ? 'done' : 'open')}
                className="h-5 w-5 shrink-0"
                id={`task-${task.id}`}
              />
              <label
                htmlFor={`task-${task.id}`}
                className={`flex-1 text-sm ${result === 'not_applicable' ? 'text-slate-400 line-through' : ''}`}
              >
                {task.titleDe}
                {task.scope === 'lane_pair' && pairLabel && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    ⟨ {pairLabel} ⟩
                  </span>
                )}
              </label>
              <button
                onClick={() => setResult(task.id, result === 'not_applicable' ? 'open' : 'not_applicable')}
                className={`shrink-0 rounded border px-2 py-1 text-xs font-medium ${
                  result === 'not_applicable'
                    ? 'border-slate-400 bg-slate-200 text-slate-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                title="Nicht zutreffend"
              >
                n. z.
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { formatWeeks };

/**
 * Zurücksetzen einer Bahn — bewusst am Ende der Seite, hinter einer Tippbestätigung.
 *
 * Das System löscht sonst nichts: Ablesungen werden ersetzt, Wartungen storniert.
 * Für Probeeingaben aus der Einrichtungsphase braucht es trotzdem einen Weg,
 * sonst verfälschen sie die Anzeige dauerhaft. Der vorherige Stand bleibt im
 * Protokoll der Datenbank erhalten.
 */
function ResetLaneSection({
  laneNumber,
  hasData,
  onReset,
}: {
  laneNumber: number;
  hasData: boolean;
  onReset: () => Promise<{ readings: number; records: number; epochs: number }>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ readings: number; records: number } | null>(null);

  const expected = `Bahn ${laneNumber}`;

  if (done) {
    return (
      <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        ● Zurückgesetzt: {done.readings} Ablesungen und {done.records} Wartungseinträge entfernt.
        Die Bahn steht wieder auf „keine Ablesung".
      </div>
    );
  }

  if (!hasData) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-slate-500 hover:text-red-700 hover:underline"
        >
          Bahn zurücksetzen (Probeeingaben entfernen)
        </button>
      ) : (
        <>
          <h2 className="font-semibold text-red-800">■ Bahn {laneNumber} zurücksetzen</h2>
          <p className="mt-1 text-sm text-slate-700">
            Entfernt <strong>alle</strong> Ablesungen, Wartungseinträge und Zähler-Epochen dieser
            Bahn. Danach steht sie wieder auf „keine Ablesung", als wäre sie nie benutzt worden.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Gedacht für Probeeingaben aus der Einrichtung. Für einen einzelnen Fehler ist die
            Korrektur der Ablesung oder das Stornieren der Wartung der richtige Weg — dabei bleibt
            nachvollziehbar, was passiert ist.
          </p>

          <label className="mt-3 block text-sm font-medium">
            Zum Bestätigen <strong>{expected}</strong> eintippen
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-48 rounded border border-slate-300 px-3 py-2"
            />
          </label>

          {error && <p className="mt-2 text-sm text-red-700">■ {error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setOpen(false);
                setConfirmText('');
              }}
              className="rounded px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Abbrechen
            </button>
            <button
              disabled={busy || confirmText.trim() !== expected}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  setDone(await onReset());
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Wird zurückgesetzt…' : 'Endgültig zurücksetzen'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
