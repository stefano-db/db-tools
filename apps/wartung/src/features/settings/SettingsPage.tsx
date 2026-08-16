import { useState } from 'react';
import { formatFrames } from '../../core';
import { useAuth } from '../../app/AuthContext';
import { useData } from '../../app/DataContext';
import { DemoRepository } from '../../data';

export function SettingsPage() {
  const { snapshot, repo, reload, isAdmin } = useData();
  const [saving, setSaving] = useState(false);

  if (!snapshot) return <p className="text-slate-500">Wird geladen…</p>;
  const s = snapshot.settings;

  async function patch(partial: Parameters<typeof repo.updateSettings>[0]) {
    setSaving(true);
    try {
      await repo.updateSettings(partial);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      <AccountCard />

      {!isAdmin && (
        <p className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Weitere Einstellungen — Wartungsintervalle, Aufgaben, Vorwarnzeiten — können nur
          Administratoren ändern.
        </p>
      )}

      {isAdmin && (
        <>
      <Card title="Anzeige und Vorwarnung">
        <Field
          label="Vorwarnzeit"
          hint="Eine Wartung wird gelb, sobald sie voraussichtlich innerhalb dieser Zeit fällig wird. Die Prognose kommt aus der gemessenen Wochenrate der jeweiligen Bahn."
        >
          <input
            type="number"
            min={1}
            max={26}
            defaultValue={s.warningWeeks}
            onBlur={(e) => patch({ warningWeeks: Number(e.target.value) })}
            className="w-20 rounded border border-slate-300 px-3 py-2 text-right"
          />
          <span className="ml-2 text-sm text-slate-600">Wochen</span>
        </Field>

        <Field
          label="Ersatzregel ohne Ratenhistorie"
          hint="Solange für eine Bahn noch keine Wochenrate vorliegt, wird stattdessen dieser Anteil des Intervalls als Vorwarnung genutzt."
        >
          <input
            type="number"
            min={5}
            max={50}
            defaultValue={Math.round(s.warningPercent * 100)}
            onBlur={(e) => patch({ warningPercent: Number(e.target.value) / 100 })}
            className="w-20 rounded border border-slate-300 px-3 py-2 text-right"
          />
          <span className="ml-2 text-sm text-slate-600">Prozent</span>
        </Field>

        <Field
          label="Bezeichnung der Zählereinheit"
          hint="Falls der Maschinenzähler tatsächlich Bälle statt Frames zählt, hier umbenennen — und die Intervalle entsprechend anpassen."
        >
          <input
            defaultValue={s.counterUnitLabel}
            onBlur={(e) => patch({ counterUnitLabel: e.target.value })}
            className="w-40 rounded border border-slate-300 px-3 py-2"
          />
        </Field>
      </Card>

      <Card title="Plausibilitätsprüfung der Eingabe">
        <Field label="Warnfaktor" hint="Warnung, wenn der Zuwachs das Vielfache der üblichen Wochenrate überschreitet.">
          <input
            type="number"
            min={1}
            step={0.5}
            defaultValue={s.plausibilityFactor}
            onBlur={(e) => patch({ plausibilityFactor: Number(e.target.value) })}
            className="w-20 rounded border border-slate-300 px-3 py-2 text-right"
          />
          <span className="ml-2 text-sm text-slate-600">×</span>
        </Field>
        <Field label="Absolute Obergrenze je Woche" hint="Harte Tippfehler-Bremse, unabhängig von der Bahn.">
          <input
            type="number"
            min={1000}
            step={1000}
            defaultValue={s.plausibilityAbsMax}
            onBlur={(e) => patch({ plausibilityAbsMax: Number(e.target.value) })}
            className="w-32 rounded border border-slate-300 px-3 py-2 text-right"
          />
        </Field>
      </Card>

      <Card title="Wartungstypen">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="py-1 font-semibold">Code</th>
              <th className="py-1 text-right font-semibold">Intervall</th>
              <th className="py-1 text-right font-semibold">Zeitintervall</th>
              <th className="py-1 text-center font-semibold">Kaskade</th>
              <th className="py-1 text-right font-semibold">Aufgaben</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.types.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-2 font-semibold">{t.code}</td>
                <td className="tabular py-2 text-right">{formatFrames(t.intervalFrames)}</td>
                <td className="tabular py-2 text-right">
                  {t.maxIntervalDays ? `${t.maxIntervalDays} Tage` : '—'}
                </td>
                <td className="py-2 text-center">{t.cascadesToSmaller ? '✓' : '—'}</td>
                <td className="py-2 text-right">
                  {snapshot.tasks.filter((task) => task.maintenanceTypeId === t.id).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-slate-500">
          Intervalle und Aufgaben werden in der Datenbank gepflegt. Aufgaben werden nie gelöscht, sondern
          deaktiviert — sonst verlieren ältere Historieneinträge ihren Bezug.
        </p>
      </Card>

      {repo instanceof DemoRepository && (
        <Card title="Demo-Bestand">
          <p className="text-sm text-slate-600">
            Diese Installation läuft ohne Server auf lokal erzeugten Beispieldaten. Sobald
            <code className="mx-1 rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> und
            <code className="mx-1 rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> gesetzt sind,
            arbeitet dieselbe Oberfläche gegen die echte Datenbank.
          </p>
          <button
            onClick={async () => {
              repo.reset();
              await reload();
            }}
            className="mt-3 rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Beispieldaten zurücksetzen
          </button>
        </Card>
      )}
        </>
      )}

      {saving && <p className="text-sm text-slate-500">Wird gespeichert…</p>}
    </div>
  );
}

/** Eigenes Konto: der Anzeigename steht in jedem Wartungseintrag der Historie. */
function AccountCard() {
  const { session, refresh } = useAuth();
  const { repo } = useData();
  const [name, setName] = useState(session?.displayName ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === session?.displayName) return;
    setState('saving');
    try {
      await repo.updateDisplayName(trimmed);
      await refresh();
      setState('done');
      setMessage(null);
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title="Mein Konto">
      <Field
        label="Anzeigename"
        hint="Dieser Name wird bei jeder abgeschlossenen Wartung und jeder Defektmeldung mitgeschrieben."
      >
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setState('idle');
          }}
          className="w-56 rounded border border-slate-300 px-3 py-2"
        />
        <button
          onClick={save}
          disabled={state === 'saving' || !name.trim() || name.trim() === session?.displayName}
          className="ml-2 rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {state === 'saving' ? 'Speichern…' : 'Speichern'}
        </button>
        {state === 'done' && <span className="ml-2 text-sm text-emerald-700">● gespeichert</span>}
        {state === 'error' && <span className="ml-2 text-sm text-red-700">■ {message}</span>}
      </Field>

      <div className="text-sm text-slate-600">
        Angemeldet als {session?.email ?? 'Demo-Betrieb'} · Rolle{' '}
        {session?.role === 'admin' ? 'Administrator' : session?.role === 'counter' ? 'Counter' : 'Mechaniker'}
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-64 text-sm font-medium">{label}</span>
        <span>{children}</span>
      </div>
      {hint && <p className="mt-1 max-w-2xl text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
