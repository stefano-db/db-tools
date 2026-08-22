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

      <Benachrichtigungen />

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

/**
 * Benachrichtigungen einschalten.
 *
 * Gefragt wird hier und nicht beim ersten Aufruf: Ein Fenster, das ungefragt
 * nach Erlaubnis fragt, lehnen die meisten Menschen ab — und danach ist der
 * Weg zu, bis jemand die Einstellung des Geraets von Hand aendert. Wer den
 * Knopf hier drueckt, weiss dagegen, worum es geht.
 *
 * Was heute geht, steht offen dabei. Eine Meldung, die auch bei geschlossener
 * App ankommt, braucht einen Dienst, der sie verschickt; das ist der naechste
 * Schritt und nicht dieser.
 */
function Benachrichtigungen() {
  const moeglich = typeof Notification !== 'undefined';
  const [stand, setStand] = useState<NotificationPermission | 'nicht-moeglich'>(
    moeglich ? Notification.permission : 'nicht-moeglich',
  );

  return (
    <article className="db-card p-5">
      <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">
        Benachrichtigungen
      </h2>

      <p className="mt-3 text-sm text-db-text2">
        Wenn die Leitung den Dienstplan ändert, meldet sich die App — und sagt dazu, ob{' '}
        <strong className="text-db-text">deine</strong> Schichten betroffen sind oder nur die von
        anderen.
      </p>

      {stand === 'granted' ? (
        <p className="mt-3 text-sm text-db-ok">● Eingeschaltet.</p>
      ) : stand === 'denied' ? (
        <p className="mt-3 text-sm text-db-text3">
          Von diesem Gerät abgelehnt. Du kannst es in den Einstellungen des Browsers wieder
          erlauben — in der App allein geht es dann nicht mehr.
        </p>
      ) : stand === 'nicht-moeglich' ? (
        <p className="mt-3 text-sm text-db-text3">
          Dieses Gerät kennt keine Benachrichtigungen. Die Meldung erscheint dann in der App.
        </p>
      ) : (
        <button
          onClick={() => void Notification.requestPermission().then(setStand)}
          className="db-btn-gold mt-4 px-4 py-2 text-sm"
        >
          Benachrichtigungen einschalten
        </button>
      )}

      <p className="mt-4 text-xs text-db-text3">
        Solange die App geöffnet ist — auch im Hintergrund —, kommt die Meldung sofort. Damit sie
        dich auch bei geschlossener App erreicht, muss noch ein Versanddienst eingerichtet werden.
        Am iPhone geht das nur, wenn die App auf dem Startbildschirm liegt.
      </p>
    </article>
  );
}
