import { useState } from 'react';
import { formatFrames } from '../../core';
import { useAuth } from '../../app/AuthContext';
import { useData } from '../../app/DataContext';
import { DEPARTMENT_LABEL, DemoRepository } from '../../data';

export function SettingsPage() {
  const { snapshot, repo, reload, isAdmin } = useData();
  const [saving, setSaving] = useState(false);

  if (!snapshot) return <p className="text-db-text3">Wird geladen…</p>;
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

      {isAdmin && <BackupCard />}

      {!isAdmin && (
        <p className="db-card px-4 py-3 text-sm text-db-text2">
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
            className="w-20 db-input text-right"
          />
          <span className="ml-2 text-sm text-db-text2">Wochen</span>
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
            className="w-20 db-input text-right"
          />
          <span className="ml-2 text-sm text-db-text2">Prozent</span>
        </Field>

        <Field
          label="Bezeichnung der Zählereinheit"
          hint="Falls der Maschinenzähler tatsächlich Bälle statt Frames zählt, hier umbenennen — und die Intervalle entsprechend anpassen."
        >
          <input
            defaultValue={s.counterUnitLabel}
            onBlur={(e) => patch({ counterUnitLabel: e.target.value })}
            className="w-40 db-input"
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
            className="w-20 db-input text-right"
          />
          <span className="ml-2 text-sm text-db-text2">×</span>
        </Field>
        <Field label="Absolute Obergrenze je Woche" hint="Harte Tippfehler-Bremse, unabhängig von der Bahn.">
          <input
            type="number"
            min={1000}
            step={1000}
            defaultValue={s.plausibilityAbsMax}
            onBlur={(e) => patch({ plausibilityAbsMax: Number(e.target.value) })}
            className="w-32 db-input text-right"
          />
        </Field>
      </Card>

      <Card title="Wartungstypen">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-db-text3 uppercase">
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
              <tr key={t.id} className="border-t border-db-line">
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
        <p className="mt-3 text-sm text-db-text3">
          Intervalle und Aufgaben werden in der Datenbank gepflegt. Aufgaben werden nie gelöscht, sondern
          deaktiviert — sonst verlieren ältere Historieneinträge ihren Bezug.
        </p>
      </Card>

      {repo instanceof DemoRepository && (
        <Card title="Demo-Bestand">
          <p className="text-sm text-db-text2">
            Diese Installation läuft ohne Server auf lokal erzeugten Beispieldaten. Sobald
            <code className="mx-1 rounded bg-db-card2 px-1">VITE_SUPABASE_URL</code> und
            <code className="mx-1 rounded bg-db-card2 px-1">VITE_SUPABASE_ANON_KEY</code> gesetzt sind,
            arbeitet dieselbe Oberfläche gegen die echte Datenbank.
          </p>
          <button
            onClick={async () => {
              repo.reset();
              await reload();
            }}
            className="mt-3 rounded border border-db-line px-4 py-2 text-sm font-medium hover:bg-db-card2"
          >
            Beispieldaten zurücksetzen
          </button>
        </Card>
      )}
        </>
      )}

      {saving && <p className="text-sm text-db-text3">Wird gespeichert…</p>}
    </div>
  );
}

/**
 * Datensicherung.
 *
 * Der kostenlose Supabase-Tarif enthaelt keine automatischen Sicherungen. Diese
 * Datei ist die Rueckversicherung: sie enthaelt alle Tabellen im Rohformat und
 * laesst sich jederzeit wieder einspielen.
 */
function BackupCard() {
  const { repo, snapshot } = useData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  async function downloadJson() {
    setBusy(true);
    setError(null);
    try {
      const bundle = await repo.exportBackup();
      const rows = Object.values(bundle).reduce((n, list) => n + list.length, 0);
      download(
        JSON.stringify({ exportedAt: new Date().toISOString(), tables: bundle }, null, 2),
        `bahnwartung-sicherung-${stamp()}.json`,
        'application/json',
      );
      setMessage(`${rows} Datensätze gesichert.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!snapshot) return;
    const head = ['Datum', 'Bahn', 'Intervall', 'Frames', 'Mitarbeiter', 'Abweichung', 'Storniert', 'Notiz'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      head.join(';'),
      ...snapshot.records.map((r) =>
        [
          r.performedOn,
          r.laneNumber,
          r.typeCode,
          r.cumulativeFrames,
          r.employeeName,
          r.hasDeviation ? 'ja' : '',
          r.voidedAt ? 'ja' : '',
          r.notes ?? '',
        ]
          .map(esc)
          .join(';'),
      ),
    ];
    // BOM, damit Excel die Umlaute richtig anzeigt
    download('\uFEFF' + lines.join('\r\n'), `wartungshistorie-${stamp()}.csv`, 'text/csv');
  }

  return (
    <Card title="Datensicherung">
      <p className="text-sm text-db-text2">
        Der kostenlose Supabase-Tarif sichert <strong>nicht</strong> automatisch. Lade die Sicherung
        regelmäßig herunter — einmal im Monat genügt — und lege sie außerhalb von Supabase ab.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={downloadJson}
          disabled={busy}
          className="db-btn-gold px-4 py-2 text-sm disabled:opacity-40"
        >
          {busy ? 'Wird erstellt…' : 'Vollständige Sicherung (JSON)'}
        </button>
        <button
          onClick={downloadCsv}
          className="rounded border border-db-line px-4 py-2 text-sm font-medium hover:bg-db-card2"
        >
          Wartungshistorie (CSV für Excel)
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-db-ok">● {message}</p>}
      {error && <p className="mt-2 text-sm text-db-bad">■ {error}</p>}

      <p className="mt-3 text-xs text-db-text3">
        Die JSON-Datei enthält alle Tabellen im Rohformat und kann wieder eingespielt werden — die
        Anleitung dazu steht in <code className="rounded bg-db-card2 px-1">docs/backup.md</code>.
        Die CSV-Datei ist zum Nachlesen und Archivieren gedacht, nicht zum Wiedereinspielen.
      </p>
    </Card>
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
          className="w-56 db-input"
        />
        <button
          onClick={save}
          disabled={state === 'saving' || !name.trim() || name.trim() === session?.displayName}
          className="ml-2 db-btn-gold px-4 py-2 text-sm disabled:opacity-40"
        >
          {state === 'saving' ? 'Speichern…' : 'Speichern'}
        </button>
        {state === 'done' && <span className="ml-2 text-sm text-db-ok">● gespeichert</span>}
        {state === 'error' && <span className="ml-2 text-sm text-db-bad">■ {message}</span>}
      </Field>

      <div className="text-sm text-db-text2">
        Angemeldet als {session?.username ?? session?.email ?? 'Demo-Betrieb'}
        {session?.department && ` · ${DEPARTMENT_LABEL[session.department]}`}
        {session?.isLead && ' · Leitung'}
        {session?.isAdmin && ' · Administrator'}
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="db-card p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-db-text3 uppercase">{title}</h2>
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
      {hint && <p className="mt-1 max-w-2xl text-xs text-db-text3">{hint}</p>}
    </div>
  );
}
