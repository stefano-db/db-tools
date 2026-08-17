import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDateDe, formatFrames } from '../../core';
import { useData } from '../../app/DataContext';

const RESULT_LABEL: Record<string, string> = {
  done: '✓ erledigt',
  not_applicable: '– nicht zutreffend',
  open: '▲ offen',
};

export function HistoryPage() {
  const { snapshot, isAdmin, repo, reload } = useData();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);
  const tab = params.get('art') === 'ablesungen' ? 'ablesungen' : 'wartungen';

  const lane = params.get('bahn') ?? '';
  const type = params.get('intervall') ?? '';
  const employee = params.get('mitarbeiter') ?? '';
  const from = params.get('von') ?? '';
  const to = params.get('bis') ?? '';

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const rows = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.records.filter((r) => {
      if (lane && String(r.laneNumber) !== lane) return false;
      if (type && r.typeCode !== type) return false;
      if (employee && r.employeeName !== employee) return false;
      if (from && r.performedOn < from) return false;
      if (to && r.performedOn > to) return false;
      return true;
    });
  }, [snapshot, lane, type, employee, from, to]);

  if (!snapshot) return <p className="text-db-text3">Wird geladen…</p>;

  const readingRows = snapshot.readings.filter((r) => {
    if (lane && String(r.laneNumber) !== lane) return false;
    if (from && r.readingDate < from) return false;
    if (to && r.readingDate > to) return false;
    return true;
  });

  const employees = [...new Set(snapshot.records.map((r) => r.employeeName))].sort();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Historie</h1>

      <div className="flex gap-1 db-card p-1">
        {[
          { key: 'wartungen', label: 'Wartungen' },
          { key: 'ablesungen', label: 'Frame-Eingaben' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter('art', t.key === 'wartungen' ? '' : t.key)}
            className={`rounded px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'db-btn-gold' : 'text-db-text2 hover:bg-db-card2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 db-card p-3">
        <Select label="Bahn" value={lane} onChange={(v) => setFilter('bahn', v)}
          options={snapshot.lanes.map((l) => ({ value: String(l.laneNumber), label: `Bahn ${l.laneNumber}` }))} />
        {tab === 'wartungen' && (
          <>
            <Select label="Intervall" value={type} onChange={(v) => setFilter('intervall', v)}
              options={snapshot.types.map((t) => ({ value: t.code, label: t.code }))} />
            <Select label="Mitarbeiter" value={employee} onChange={(v) => setFilter('mitarbeiter', v)}
              options={employees.map((e) => ({ value: e, label: e }))} />
          </>
        )}
        <label className="text-sm font-medium">
          Von
          <input type="date" value={from} onChange={(e) => setFilter('von', e.target.value)}
            className="ml-2 rounded border border-db-line px-2 py-1.5" />
        </label>
        <label className="text-sm font-medium">
          Bis
          <input type="date" value={to} onChange={(e) => setFilter('bis', e.target.value)}
            className="ml-2 rounded border border-db-line px-2 py-1.5" />
        </label>
        {[...params.keys()].length > 0 && (
          <button onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="ml-auto text-sm font-medium text-db-text2 hover:underline">
            Filter zurücksetzen
          </button>
        )}
      </div>

      {tab === 'ablesungen' ? (
        <>
          <p className="text-sm text-db-text2">
            {readingRows.length} Eingaben · ersetzte Werte bleiben durchgestrichen stehen
          </p>
          <div className="overflow-hidden db-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-db-card2 text-xs tracking-wide text-db-text2 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Ablesedatum</th>
                  <th className="px-4 py-2 font-semibold">Bahn</th>
                  <th className="px-4 py-2 text-right font-semibold">Zählerstand</th>
                  <th className="px-4 py-2 text-right font-semibold">Gesamt</th>
                  <th className="px-4 py-2 font-semibold">Art</th>
                </tr>
              </thead>
              <tbody>
                {readingRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-db-line ${r.supersededById ? 'text-db-text3' : ''}`}
                  >
                    <td className="tabular px-4 py-2">{formatDateDe(r.readingDate)}</td>
                    <td className="px-4 py-2">Bahn {r.laneNumber}</td>
                    <td className={`tabular px-4 py-2 text-right ${r.supersededById ? 'line-through' : ''}`}>
                      {formatFrames(r.rawValue)}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{formatFrames(r.cumulativeFrames)}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.supersededById
                        ? 'ersetzt'
                        : r.source === 'correction'
                          ? 'Korrektur'
                          : r.source === 'initial'
                            ? 'Ersteinrichtung'
                            : 'Wocheneingabe'}
                      {r.correctionReason && <span className="ml-2 text-db-text3">{r.correctionReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
      <p className="text-sm text-db-text2">{rows.length} Einträge</p>

      <div className="overflow-hidden db-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-db-card2 text-xs tracking-wide text-db-text2 uppercase">
            <tr>
              <th className="px-4 py-2 font-semibold">Datum</th>
              <th className="px-4 py-2 font-semibold">Bahn</th>
              <th className="px-4 py-2 text-right font-semibold">Frames</th>
              <th className="px-4 py-2 font-semibold">Wartung</th>
              <th className="px-4 py-2 font-semibold">Mitarbeiter</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tasks = snapshot.recordTasks.filter((t) => t.recordId === r.id);
              const isOpen = expanded === r.id;
              return (
                <>
                  <tr
                    key={r.id}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className={`cursor-pointer border-t border-db-line hover:bg-db-card2 ${
                      r.voidedAt ? 'text-db-text3 line-through' : ''
                    }`}
                  >
                    <td className="tabular px-4 py-2">{formatDateDe(r.performedOn)}</td>
                    <td className={`px-4 py-2 ${r.source === 'cascade' ? 'pl-8 text-db-text3' : ''}`}>
                      {r.source === 'cascade' && <span className="mr-1">↳</span>}
                      Bahn {r.laneNumber}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{formatFrames(r.cumulativeFrames)}</td>
                    <td className="px-4 py-2 font-semibold">{r.typeCode}</td>
                    <td className="px-4 py-2">{r.employeeName}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      {r.source === 'initial_import' && <span className="text-db-text3">Erstaufnahme</span>}
                      {r.source === 'cascade' && <span className="text-db-text3">mitkaskadiert</span>}
                      {r.hasDeviation && <span className="font-semibold text-db-warn">▲ Abweichung</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.id}-detail`} className="border-t border-db-line bg-db-card2">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h3 className="text-xs font-semibold tracking-wide text-db-text3 uppercase">
                              Erledigte Aufgaben
                            </h3>
                            {tasks.length === 0 ? (
                              <p className="mt-1 text-db-text3">
                                Keine Aufgaben erfasst (Erstaufnahme des Wartungsstandes).
                              </p>
                            ) : (
                              <ul className="mt-1 space-y-0.5">
                                {tasks.map((t) => (
                                  <li key={t.taskId}>
                                    <span className="font-medium">{RESULT_LABEL[t.result]}</span>{' '}
                                    {t.taskTitleSnapshot}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold tracking-wide text-db-text3 uppercase">
                              Notiz
                            </h3>
                            <p className="mt-1 text-db-text2">{r.notes || '—'}</p>
                            {r.voidedAt && (
                              <p className="mt-2 text-db-bad">■ Storniert: {r.voidReason}</p>
                            )}
                            {isAdmin && !r.voidedAt && r.source !== 'cascade' && (
                              <VoidForm
                                onVoid={async (reason) => {
                                  await repo.voidMaintenanceRecord(r.id, reason);
                                  await reload();
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}

/**
 * Stornieren statt Löschen: der Eintrag bleibt sichtbar, wird durchgestrichen und
 * traegt den Grund. Der Wartungsanker faellt damit auf den vorherigen Stand
 * zurueck — die Bahn gilt also wieder als ungewartet, was der Wahrheit entspricht.
 */
function VoidForm({ onVoid }: { onVoid: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded border border-db-line px-3 py-1.5 text-sm font-medium hover:bg-db-card"
      >
        Eintrag stornieren
      </button>
    );
  }

  return (
    <div className="mt-3 rounded border border-db-bad bg-db-bad/10 p-3">
      <p className="text-sm text-db-bad">
        Der Eintrag bleibt in der Historie stehen und wird durchgestrichen. Der Wartungsstand faellt
        auf den vorherigen Wert zurueck — mitkaskadierte Eintraege werden ebenfalls storniert.
      </p>
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Grund, z. B. versehentlich abgeschlossen"
        className="mt-2 w-full db-input text-sm"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="rounded px-3 py-1.5 text-sm font-medium hover:bg-db-card"
        >
          Abbrechen
        </button>
        <button
          disabled={!reason.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onVoid(reason.trim());
            } finally {
              setBusy(false);
            }
          }}
          className="rounded bg-db-bad px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Wird storniert…' : 'Stornieren'}
        </button>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ml-2 rounded border border-db-line px-2 py-1.5"
      >
        <option value="">Alle</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
