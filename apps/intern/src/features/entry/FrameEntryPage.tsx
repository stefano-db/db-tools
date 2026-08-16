import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateDe, formatFrames, validateReading, type ReadingIssue } from '../../core';
import { useData } from '../../app/DataContext';

/**
 * Wöchentliche Frame-Erfassung.
 *
 * Wichtigste Maske der App: 18 Zahlen, ein Speichervorgang, keine Maus nötig.
 * Eingetragen wird der ROHWERT vom Maschinenzähler; die Umrechnung auf den
 * kumulativen Stand passiert über die Zähler-Epoche der Bahn.
 */
export function FrameEntryPage() {
  const { snapshot, repo, reload, today } = useData();
  const navigate = useNavigate();
  const [readingDate, setReadingDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resetCandidates, setResetCandidates] = useState<{ laneId: string; laneNumber: number; rawValue: number }[] | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const lanes = useMemo(
    () => [...(snapshot?.lanes ?? [])].sort((a, b) => a.laneNumber - b.laneNumber),
    [snapshot],
  );

  if (!snapshot) return <p className="text-slate-500">Wird geladen…</p>;

  const checks: Record<string, { issues: ReadingIssue[]; delta: number | null }> = {};
  for (const lane of lanes) {
    const raw = values[lane.laneId];
    if (raw === undefined || raw === '') continue;
    const rawValue = Number(raw.replace(/[^\d]/g, ''));
    // Bei der Ersteinrichtung existiert noch keine Epoche; sie wird beim
    // Speichern angelegt. Für die Vorschau wird hier mit denselben Werten
    // gerechnet, die dann auch gespeichert werden.
    const epoch = snapshot.currentEpoch[lane.laneId] ?? {
      id: '',
      laneId: lane.laneId,
      effectiveFrom: readingDate,
      counterStart: 0,
      cumulativeOffset: 0,
      reason: 'initial' as const,
    };
    const issues = validateReading({
      rawValue,
      epoch,
      readingDate,
      today,
      previousCumulative: lane.currentFrames,
      previousDate: lane.lastReadingDate,
      framesPerWeek: lane.framesPerWeek,
      settings: snapshot.settings,
    });
    const cumulative =
      rawValue >= epoch.counterStart ? epoch.cumulativeOffset + (rawValue - epoch.counterStart) : null;
    checks[lane.laneId] = {
      issues,
      delta: cumulative !== null && lane.currentFrames !== null ? cumulative - lane.currentFrames : null,
    };
  }

  const filled = Object.entries(values).filter(([, v]) => v !== '');
  const conflicts = lanes
    .filter((l) => checks[l.laneId]?.issues.some((i) => i.code === 'below_previous'))
    .map((l) => ({
      laneId: l.laneId,
      laneNumber: l.laneNumber,
      rawValue: Number((values[l.laneId] ?? '0').replace(/[^\d]/g, '')),
    }));
  const otherErrors = lanes.some((l) =>
    checks[l.laneId]?.issues.some((i) => i.level === 'error' && i.code !== 'below_previous'),
  );

  function focusNext(index: number) {
    inputs.current[index + 1]?.focus();
    inputs.current[index + 1]?.select();
  }

  async function persist(skipReset = false) {
    setSaving(true);
    try {
      if (!skipReset && conflicts.length > 0) {
        setResetCandidates(conflicts);
        return;
      }
      const entries = filled
        .map(([laneId, v]) => ({ laneId, rawValue: Number(v.replace(/[^\d]/g, '')) }))
        .filter((e) => Number.isFinite(e.rawValue));
      await repo.saveReadings({ readingDate, entries });
      await reload();
      setValues({});
      navigate('/wartung');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReset(
    reason: 'counter_reset' | 'counter_replaced' | 'pinsetter_replaced',
    counterStartValues: Record<string, number>,
  ) {
    if (!resetCandidates) return;
    setSaving(true);
    try {
      for (const c of resetCandidates) {
        await repo.resetCounter({
          laneId: c.laneId,
          effectiveFrom: readingDate,
          // Stand des neuen Zählers im Moment des Wechsels — nicht der heutige
          // Ablesewert. Alles, was seither gelaufen ist, zählt normal weiter.
          newCounterValue: counterStartValues[c.laneId] ?? 0,
          reason,
        });
      }
      await reload();
      setResetCandidates(null);
      // Nach dem Epochenwechsel wird der Wert regulär gespeichert.
      const entries = filled.map(([laneId, v]) => ({ laneId, rawValue: Number(v.replace(/[^\d]/g, '')) }));
      await repo.saveReadings({ readingDate, entries });
      await reload();
      setValues({});
      navigate('/wartung');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wöchentliche Frame-Stände</h1>
          <p className="text-sm text-slate-600">
            Zählerstand eintragen — Enter springt zur nächsten Bahn. Leere Felder werden übersprungen.
          </p>
        </div>
        <label className="text-sm font-medium">
          Ablesedatum
          <input
            type="date"
            value={readingDate}
            max={today}
            onChange={(e) => setReadingDate(e.target.value)}
            className="ml-2 rounded border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {lanes.every((l) => l.currentFrames === null) && (
        <div className="rounded border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <strong className="font-semibold">Erste Eingabe.</strong> Trage für jede Bahn den Wert
          ein, den der Maschinenzähler jetzt anzeigt. Ab hier zählt die App weiter — auch wenn der
          Zähler später getauscht wird. Die Wartungsstände bleiben zunächst unbekannt und setzen
          sich von selbst, sobald du eine Wartung das erste Mal abschließt.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-2 font-semibold">Bahn</th>
              <th className="px-4 py-2 text-right font-semibold">Letzter Stand</th>
              <th className="px-4 py-2 font-semibold">Neuer Stand</th>
              <th className="px-4 py-2 font-semibold">Zuwachs</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane, index) => {
              const check = checks[lane.laneId];
              const error = check?.issues.find((i) => i.level === 'error');
              const warning = check?.issues.find((i) => i.level === 'warning');
              const info = check?.issues.find((i) => i.level === 'info');
              return (
                <tr key={lane.laneId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-semibold whitespace-nowrap">
                    Bahn {lane.laneNumber}
                    {lane.status !== 'active' && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {lane.status === 'renovation' ? 'Renovierung' : 'außer Betrieb'}
                      </span>
                    )}
                  </td>
                  <td className="tabular px-4 py-2 text-right text-slate-600">
                    {lane.lastRawValue === null ? '—' : formatFrames(lane.lastRawValue)}
                    <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
                      {lane.lastReadingDate ? formatDateDe(lane.lastReadingDate) : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      ref={(el) => {
                        inputs.current[index] = el;
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={values[lane.laneId] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [lane.laneId]: e.target.value.replace(/[^\d]/g, '') }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          focusNext(index);
                        }
                      }}
                      className={`tabular w-36 rounded border px-3 py-2 text-right text-lg ${
                        error ? 'border-red-400 bg-red-50' : warning ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                      }`}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {check?.delta !== null && check?.delta !== undefined && (
                      <span className="tabular font-semibold text-slate-800">
                        {check.delta >= 0 ? '+' : ''}
                        {formatFrames(check.delta)}
                      </span>
                    )}
                    {error && <div className="text-red-700">■ {error.message}</div>}
                    {!error && warning && <div className="text-amber-700">▲ {warning.message}</div>}
                    {!error && !warning && info && <div className="text-slate-500">– {info.message}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-100/95 py-3">
        <span className="text-sm text-slate-600">
          {filled.length} von {lanes.length} Bahnen ausgefüllt
        </span>
        <button
          onClick={() => persist()}
          disabled={filled.length === 0 || otherErrors || saving}
          className="ml-auto rounded bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'Wird gespeichert…' : `${filled.length} Stände speichern`}
        </button>
      </div>

      {resetCandidates && (
        <ResetDialog
          candidates={resetCandidates}
          lanes={lanes}
          onCancel={() => setResetCandidates(null)}
          onConfirm={confirmReset}
        />
      )}
    </div>
  );
}

function ResetDialog({
  candidates,
  lanes,
  onCancel,
  onConfirm,
}: {
  candidates: { laneId: string; laneNumber: number; rawValue: number }[];
  lanes: { laneId: string; currentFrames: number | null }[];
  onCancel: () => void;
  onConfirm: (
    reason: 'counter_reset' | 'counter_replaced' | 'pinsetter_replaced',
    counterStartValues: Record<string, number>,
  ) => void;
}) {
  const [reason, setReason] = useState<'counter_reset' | 'counter_replaced' | 'pinsetter_replaced'>('counter_reset');
  const [starts, setStarts] = useState<Record<string, string>>({});

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-red-800">■ Zählerstand niedriger als bisher</h2>

        <ul className="mt-3 space-y-2 text-sm">
          {candidates.map((c) => {
            const lane = lanes.find((l) => l.laneId === c.laneId);
            const start = Number((starts[c.laneId] ?? '0').replace(/[^\d]/g, ''));
            const gained = c.rawValue - start;
            return (
              <li key={c.laneId} className="rounded bg-slate-50 px-3 py-2">
                <div className="tabular">
                  <strong>Bahn {c.laneNumber}:</strong> abgelesen {formatFrames(c.rawValue)}, bisheriger
                  Gesamtstand{' '}
                  {lane?.currentFrames !== null && lane?.currentFrames !== undefined
                    ? formatFrames(lane.currentFrames)
                    : '—'}
                </div>
                <label className="mt-2 flex flex-wrap items-center gap-2">
                  Stand des neuen Zählers direkt nach dem Wechsel
                  <input
                    inputMode="numeric"
                    value={starts[c.laneId] ?? '0'}
                    onChange={(e) =>
                      setStarts((s) => ({ ...s, [c.laneId]: e.target.value.replace(/[^\d]/g, '') }))
                    }
                    className="tabular w-24 rounded border border-slate-300 px-2 py-1 text-right"
                  />
                </label>
                {gained >= 0 ? (
                  <div className="tabular mt-1 text-xs text-slate-600">
                    Seit dem Wechsel gelaufen: {formatFrames(gained)} — neuer Gesamtstand{' '}
                    {formatFrames((lane?.currentFrames ?? 0) + gained)}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-red-700">
                    ■ Der Startwert darf nicht über dem abgelesenen Wert liegen.
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-sm text-slate-700">
          Der neue Frame-Stand ist niedriger als der bisherige Stand. Wurde der Zähler zurückgesetzt oder
          ausgetauscht?
        </p>
        <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          ● Die Wartungshistorie bleibt dabei vollständig erhalten. Intern zählt die App auf einem
          fortlaufenden Gesamtwert weiter, der vom Zähler unabhängig ist.
        </p>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Was ist passiert?</legend>
          <div className="mt-2 space-y-1.5">
            {[
              ['counter_reset', 'Zähler wurde zurückgesetzt'],
              ['counter_replaced', 'Zähler wurde ausgetauscht'],
              ['pinsetter_replaced', 'Pinsetter wurde ausgetauscht'],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="reason"
                  checked={reason === value}
                  onChange={() => setReason(value as typeof reason)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onCancel} className="rounded px-4 py-2 text-sm font-medium hover:bg-slate-100">
            Abbrechen und korrigieren
          </button>
          <button
            onClick={() =>
              onConfirm(
                reason,
                Object.fromEntries(
                  candidates.map((c) => [c.laneId, Number((starts[c.laneId] ?? '0').replace(/[^\d]/g, ''))]),
                ),
              )
            }
            disabled={candidates.some(
              (c) => c.rawValue - Number((starts[c.laneId] ?? '0').replace(/[^\d]/g, '')) < 0,
            )}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Übernehmen und speichern
          </button>
        </div>
      </div>
    </div>
  );
}
