import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import {
  DEPARTMENT_LABEL,
  repository,
  type Department,
  type RosterEmployeeRow,
  type UserRow,
} from '../../data';
import { Mascot } from '../../ui/Mascot';

const DEPARTMENTS: Department[] = ['mechanik', 'counter', 'service', 'kueche'];

/**
 * Benutzerverwaltung.
 *
 * Bewusst Karten statt einer Tabelle: acht Angaben je Person passen in keine
 * Zeile, die auf einem Tablet noch lesbar wäre — die alte Tabelle war rechts
 * abgeschnitten, „Status" und „Passwort" waren gar nicht erreichbar. Eine Karte
 * je Mitarbeiter bleibt auf jeder Breite vollständig sichtbar.
 *
 * Administratoren verwalten alle Konten, eine Bereichsleitung nur die des
 * eigenen Bereichs. Durchgesetzt wird das in der Datenbank; die Oberfläche
 * blendet nur aus, was ohnehin abgelehnt würde.
 */
export function UsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [roster, setRoster] = useState<RosterEmployeeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const isAdmin = session?.isAdmin === true;
  const isLead = session?.isLead === true;

  const reload = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        repository.listUsers(),
        repository.listRosterEmployees().catch(() => []),
      ]);
      setUsers(u);
      setRoster(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!isAdmin && !isLead) {
    return (
      <p className="db-card px-4 py-6 text-db-text2">
        Die Benutzerverwaltung ist Administratoren und Bereichsleitungen vorbehalten.
      </p>
    );
  }

  const visible = (users ?? []).filter(
    (u) => isAdmin || (u.department === session?.department && !u.isAdmin),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Mitarbeiter</h1>
          <p className="text-sm text-db-text2">
            {isAdmin
              ? 'Alle Konten des Centers.'
              : `Konten im Bereich ${session?.department ? DEPARTMENT_LABEL[session.department] : ''}.`}
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="db-btn-gold px-4 py-2.5 text-sm">
          + Mitarbeiter anlegen
        </button>
      </div>

      {error && <p className="db-card border-db-bad px-4 py-3 text-sm text-db-bad">■ {error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            roster={roster}
            isAdmin={isAdmin}
            isSelf={u.id === session?.userId}
            onChanged={reload}
            onError={setError}
          />
        ))}
      </div>

      {users !== null && visible.length === 0 && (
        <p className="db-card px-4 py-6 text-db-text2">Noch keine Mitarbeiter angelegt.</p>
      )}

      <p className="text-sm text-db-text3">
        Mitarbeiter melden sich mit ihrem <strong className="text-db-text2">Benutzernamen</strong>{' '}
        an. Angezeigt wird überall der Klarname — auch im Dienstplan und in der Wartungshistorie.
        Wer eine E-Mail-Adresse hinterlegt hat, kann sein Passwort selbst zurücksetzen.
      </p>

      {showNew && (
        <NewUserDialog
          isAdmin={isAdmin}
          ownDepartment={session?.department ?? null}
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function UserCard({
  user,
  roster,
  isAdmin,
  isSelf,
  onChanged,
  onError,
}: {
  user: UserRow;
  roster: RosterEmployeeRow[];
  isAdmin: boolean;
  isSelf: boolean;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const linked = roster.find((r) => r.profileId === user.id);

  async function apply(patch: Partial<UserRow>) {
    setBusy(true);
    try {
      await repository.updateUser(user.id, patch);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`db-card p-4 ${user.active ? '' : 'opacity-60'}`}>
      <header className="flex items-center gap-3">
        <Mascot name="profil" size={40} variante="kopf" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold">
            {user.displayName}
            {isSelf && <span className="ml-2 text-xs font-normal text-db-text3">(du)</span>}
          </h2>
          <p className="truncate text-xs text-db-text3">
            {user.username ?? 'nur E-Mail'}
            {!user.active && ' · deaktiviert'}
          </p>
        </div>
        <button
          disabled={busy || isSelf}
          onClick={() => apply({ active: !user.active })}
          className="db-btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {user.active ? 'Deaktivieren' : 'Aktivieren'}
        </button>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Bereich">
          <select
            value={user.department ?? ''}
            disabled={busy || !isAdmin}
            onChange={(e) => apply({ department: (e.target.value || null) as Department | null })}
            className="db-input"
          >
            <option value="">kein Bereich</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Name im Dienstplan">
          {roster.length === 0 ? (
            <span className="block pt-2 text-sm text-db-text3">Dienstplan noch leer</span>
          ) : (
            <select
              value={linked?.id ?? ''}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  // Bestehende Verbindung zuerst lösen — ein Konto darf nur an
                  // einem Namen hängen, sonst ist „meine Schicht" nicht eindeutig.
                  if (linked && linked.id !== e.target.value) {
                    await repository.linkRosterEmployee(linked.id, null);
                  }
                  if (e.target.value) {
                    await repository.linkRosterEmployee(e.target.value, user.id);
                  }
                  await onChanged();
                } catch (err) {
                  onError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
              className="db-input"
            >
              <option value="">— nicht zugeordnet —</option>
              {roster.map((r) => {
                const takenByOther = r.profileId && r.profileId !== user.id;
                return (
                  <option key={r.id} value={r.id} disabled={!!takenByOther}>
                    {r.name}
                    {takenByOther ? ' (vergeben)' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </Field>

        <Field label="E-Mail">
          <EmailInput user={user} onError={onError} onSaved={onChanged} />
        </Field>

        <Field label="Rechte">
          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={user.isLead}
                disabled={busy}
                onChange={(e) => apply({ isLead: e.target.checked })}
                className="h-4 w-4"
              />
              Leitung
            </label>
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={user.isAdmin}
                  // Sich selbst die Rechte zu entziehen hiesse, sich aus der
                  // Verwaltung auszusperren.
                  disabled={busy || isSelf}
                  onChange={(e) => apply({ isAdmin: e.target.checked })}
                  className="h-4 w-4"
                />
                Administrator
              </label>
            )}
          </div>
        </Field>
      </div>

      <button
        disabled={busy}
        onClick={() => setResetting(true)}
        className="db-btn-ghost mt-4 px-3 py-2 text-xs"
      >
        Passwort zurücksetzen
      </button>

      {resetting && (
        <PasswordDialog user={user} onClose={() => setResetting(false)} onError={onError} />
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-db-text3 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Adresse ändern — erst beim Verlassen des Feldes, weil es die Anmeldung betrifft. */
function EmailInput({
  user,
  onError,
  onSaved,
}: {
  user: UserRow;
  onError: (m: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(user.email ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <input
      type="email"
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        const next = value.trim();
        if (next === (user.email ?? '')) return;
        setBusy(true);
        try {
          await repository.setUserEmail(user.id, next);
          await onSaved();
        } catch (e) {
          setValue(user.email ?? '');
          onError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
      placeholder="keine"
      className="db-input"
    />
  );
}

function NewUserDialog({
  isAdmin,
  ownDepartment,
  onClose,
  onCreated,
}: {
  isAdmin: boolean;
  ownDepartment: Department | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState<Department | ''>(ownDepartment ?? '');
  const [isLead, setIsLead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function suggest(name: string) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await repository.createUser({
        username: username || suggest(displayName),
        displayName,
        email: email.trim() || undefined,
        password,
        department: department || null,
        isLead,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <form onSubmit={submit}>
        <h2 className="text-lg font-bold">Mitarbeiter anlegen</h2>

        <div className="mt-4 space-y-3">
          <div>
            <Field label="Klarname">
              <input
                autoFocus
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => !username && setUsername(suggest(displayName))}
                placeholder="z. B. Marko Weber"
                className="db-input"
              />
            </Field>
            <p className="mt-1 text-xs text-db-text3">
              Erscheint überall — im Dienstplan, in der Historie, bei Meldungen.
            </p>
          </div>

          <Field label="Benutzername für die Anmeldung">
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder={suggest(displayName) || 'marko.weber'}
              autoCapitalize="none"
              autoCorrect="off"
              className="db-input"
            />
          </Field>

          <div>
            <Field label="E-Mail (optional)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="leer lassen, wenn keine vorhanden"
                autoCapitalize="none"
                className="db-input"
              />
            </Field>
            <p className="mt-1 text-xs text-db-text3">
              Mit Adresse kann die Person ihr Passwort selbst zurücksetzen.
            </p>
          </div>

          <div>
            <Field label="Passwort">
              <input
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="db-input"
              />
            </Field>
            <p className="mt-1 text-xs text-db-text3">
              Mindestens 8 Zeichen. Sag es der Person persönlich — es gibt keinen Zustellweg.
            </p>
          </div>

          <Field label="Bereich">
            <select
              value={department}
              disabled={!isAdmin}
              onChange={(e) => setDepartment(e.target.value as Department | '')}
              className="db-input"
            >
              <option value="">kein Bereich</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isLead} onChange={(e) => setIsLead(e.target.checked)} />
            Bereichsleitung — darf Mitarbeiter des eigenen Bereichs verwalten
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-db-bad px-3 py-2 text-sm text-db-bad">
            ■ {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="db-btn-ghost px-4 py-2 text-sm">
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={busy}
            className="db-btn-gold px-4 py-2 text-sm disabled:opacity-40"
          >
            {busy ? 'Wird angelegt…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Neues Passwort setzen. Es wird im Klartext angezeigt, weil es persönlich
 * übergeben wird — ein verstecktes Feld hülfe hier niemandem.
 */
function PasswordDialog({
  user,
  onClose,
  onError,
}: {
  user: UserRow;
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const [password, setPassword] = useState(() => suggestPassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <Dialog onClose={onClose}>
      <h2 className="text-lg font-bold">Passwort zurücksetzen</h2>
      <p className="mt-1 text-sm text-db-text2">
        Für <strong className="text-db-text">{user.displayName}</strong>
        {user.username && <> (Anmeldung: {user.username})</>}
      </p>

      {done ? (
        <>
          <div className="mt-4 rounded-xl border border-db-gold-dim bg-db-card2 p-4 text-center">
            <p className="text-sm text-db-text2">Neues Passwort:</p>
            <p className="db-num mt-2 text-2xl font-bold tracking-wide text-db-gold">{password}</p>
          </div>
          <p className="mt-3 text-sm text-db-text3">
            Gib es persönlich weiter. Nach dem Schließen wird es nicht noch einmal angezeigt.
          </p>
          <div className="mt-5 flex justify-end">
            <button onClick={onClose} className="db-btn-gold px-4 py-2 text-sm">
              Fertig
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4">
            <Field label="Neues Passwort">
              <input
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="db-input text-lg"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setPassword(suggestPassword())}
            className="mt-2 text-sm text-db-text2 hover:text-db-gold"
          >
            Anderen Vorschlag
          </button>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="db-btn-ghost px-4 py-2 text-sm">
              Abbrechen
            </button>
            <button
              disabled={busy || password.length < 8}
              onClick={async () => {
                setBusy(true);
                try {
                  await repository.setUserPassword(user.id, password);
                  setDone(true);
                } catch (err) {
                  onError(err instanceof Error ? err.message : String(err));
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="db-btn-gold px-4 py-2 text-sm disabled:opacity-40"
            >
              {busy ? 'Wird gesetzt…' : 'Passwort setzen'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="db-card max-h-[90vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** Vorschlag, der sich am Telefon vorlesen lässt. */
function suggestPassword(): string {
  const words = ['Bahn', 'Pin', 'Kugel', 'Strike', 'Spare', 'Gasse', 'Wurf', 'Kegel'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 9000) + 1000}`;
}
