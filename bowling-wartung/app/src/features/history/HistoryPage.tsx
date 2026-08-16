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
  const { snapshot } = useData();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);

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

  if (!snapshot) return <p className="text-slate-500">Wird geladen…</p>;

  const employees = [...new Set(snapshot.records.map((r) => r.employeeName))].sort();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Wartungshistorie</h1>

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Select label="Bahn" value={lane} onChange={(v) => setFilter('bahn', v)}
          options={snapshot.lanes.map((l) => ({ value: String(l.laneNumber), label: `Bahn ${l.laneNumber}` }))} />
        <Select label="Intervall" value={type} onChange={(v) => setFilter('intervall', v)}
          options={snapshot.types.map((t) => ({ value: t.code, label: t.code }))} />
        <Select label="Mitarbeiter" value={employee} onChange={(v) => setFilter('mitarbeiter', v)}
          options={employees.map((e) => ({ value: e, label: e }))} />
        <label className="text-sm font-medium">
          Von
          <input type="date" value={from} onChange={(e) => setFilter('von', e.target.value)}
            className="ml-2 rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="text-sm font-medium">
          Bis
          <input type="date" value={to} onChange={(e) => setFilter('bis', e.target.value)}
            className="ml-2 rounded border border-slate-300 px-2 py-1.5" />
        </label>
        {[...params.keys()].length > 0 && (
          <button onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="ml-auto text-sm font-medium text-slate-600 hover:underline">
            Filter zurücksetzen
          </button>
        )}
      </div>

      <p className="text-sm text-slate-600">{rows.length} Einträge</p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase">
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
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                      r.voidedAt ? 'text-slate-400 line-through' : ''
                    }`}
                  >
                    <td className="tabular px-4 py-2">{formatDateDe(r.performedOn)}</td>
                    <td className={`px-4 py-2 ${r.source === 'cascade' ? 'pl-8 text-slate-500' : ''}`}>
                      {r.source === 'cascade' && <span className="mr-1">↳</span>}
                      Bahn {r.laneNumber}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{formatFrames(r.cumulativeFrames)}</td>
                    <td className="px-4 py-2 font-semibold">{r.typeCode}</td>
                    <td className="px-4 py-2">{r.employeeName}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      {r.source === 'initial_import' && <span className="text-slate-400">Erstaufnahme</span>}
                      {r.source === 'cascade' && <span className="text-slate-400">mitkaskadiert</span>}
                      {r.hasDeviation && <span className="font-semibold text-amber-700">▲ Abweichung</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.id}-detail`} className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                              Erledigte Aufgaben
                            </h3>
                            {tasks.length === 0 ? (
                              <p className="mt-1 text-slate-500">
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
                            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                              Notiz
                            </h3>
                            <p className="mt-1 text-slate-700">{r.notes || '—'}</p>
                            {r.voidedAt && (
                              <p className="mt-2 text-red-700">Storniert: {r.voidReason}</p>
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
        className="ml-2 rounded border border-slate-300 px-2 py-1.5"
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
