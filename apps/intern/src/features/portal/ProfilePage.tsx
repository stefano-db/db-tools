import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { DEPARTMENT_LABEL, repository } from '../../data';
import { Mascot } from '../../ui/Mascot';

/**
 * Eigenes Konto.
 *
 * Bewusst schlank: Anzeigename ändern, sehen was man darf, abmelden. Alles
 * Weitere — Bereich, Leitung, Rechte — vergibt die Leitung, nicht man selbst.
 */
export function ProfilePage() {
  const { session, refresh, signOut } = useAuth();
  const [name, setName] = useState(session?.displayName ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === session?.displayName) return;
    setState('saving');
    try {
      await repository.updateDisplayName(trimmed);
      await refresh();
      setState('done');
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <article className="db-card flex items-center gap-4 p-5">
        <Mascot name="profil" size={72} variante="kopf" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{session?.displayName}</h1>
          <p className="text-db-text2">
            {session?.department ? DEPARTMENT_LABEL[session.department] : 'Kein Bereich'}
            {session?.isLead && ' · Leitung'}
            {session?.isAdmin && ' · Administrator'}
          </p>
        </div>
      </article>

      <article className="db-card p-5">
        <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">Anzeigename</h2>
        <p className="mt-1 text-sm text-db-text2">
          Dieser Name erscheint überall — im Dienstplan, in der Wartungshistorie, bei Meldungen.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setState('idle');
            }}
            className="flex-1 rounded-lg border border-db-line bg-db-card2 px-3 py-2 text-db-text"
          />
          <button
            onClick={save}
            disabled={state === 'saving' || !name.trim() || name.trim() === session?.displayName}
            className="db-btn-gold px-5 py-2 text-sm disabled:opacity-40"
          >
            {state === 'saving' ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
        {state === 'done' && <p className="mt-2 text-sm text-db-ok">● Gespeichert</p>}
        {state === 'error' && <p className="mt-2 text-sm text-db-bad">■ {message}</p>}
      </article>

      <article className="db-card p-5">
        <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">Anmeldung</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-db-text3">Benutzername</dt>
            <dd className="db-num">{session?.username ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-db-text3">E-Mail</dt>
            <dd>{session?.email ?? 'keine hinterlegt'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-db-text3">
          {session?.email
            ? 'Passwort vergessen? Auf der Anmeldeseite kannst du dir selbst einen Link schicken.'
            : 'Ohne E-Mail-Adresse setzt deine Bereichsleitung das Passwort zurück.'}
        </p>
        <button onClick={() => void signOut()} className="db-btn-ghost mt-4 px-4 py-2 text-sm">
          Abmelden
        </button>
      </article>
    </div>
  );
}
