import { useState } from 'react';
import { useData } from '../../app/DataContext';

export function IssueDialog({ onClose, laneId: initialLane }: { onClose: () => void; laneId?: string }) {
  const { repo, snapshot, reload, employee } = useData();
  const [laneId, setLaneId] = useState<string>(initialLane ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await repo.createIssue({
      laneId: laneId || null,
      title: title.trim(),
      description: description.trim() || undefined,
      severity,
      reportedBy: employee,
    });
    await reload();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Defekt melden</h2>
        <p className="mt-1 text-sm text-slate-600">
          Unabhängig von der regulären Wartung. Erscheint sofort auf dem Dashboard.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Bahn
            <select
              value={laneId}
              onChange={(e) => setLaneId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Keine bestimmte Bahn</option>
              {snapshot?.lanes.map((l) => (
                <option key={l.laneId} value={l.laneId}>
                  Bahn {l.laneNumber}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Was ist passiert?
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Ball Elevator macht Geräusche"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm font-medium">
            Details (optional)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">Dringlichkeit</legend>
            <div className="mt-1 flex gap-2">
              {(['low', 'medium', 'high'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
                    severity === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'
                  }`}
                >
                  {s === 'low' ? 'Gering' : s === 'medium' ? 'Mittel' : 'Hoch'}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm font-medium hover:bg-slate-100">
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || saving}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Melden
          </button>
        </div>
      </div>
    </div>
  );
}
