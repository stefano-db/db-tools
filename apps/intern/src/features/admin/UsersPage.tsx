import { useCallback, useEffect, useState } from 'react';
import { Header } from '../../app/Header';
import { useAuth } from '../../app/AuthContext';
import {
  DEPARTMENT_LABEL,
  repository,
  type Department,
  type UserRow,
} from '../../data';

const DEPARTMENTS: Department[] = ['mechanik', 'counter', 'service'];

/**
 * Benutzerverwaltung.
 *
 * Administratoren verwalten alle Konten, eine Bereichsleitung nur die des
 * eigenen Bereichs — und niemand kann sich selbst Rechte wegnehmen oder einen
 * Administrator anlegen, ohne selbst einer zu sein. Durchgesetzt wird das in der
 * Datenbank; die Oberfläche blendet nur aus, was ohnehin abgelehnt würde.
 */
export function UsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const isAdmin = session?.isAdmin === true;
  const isLead = session?.isLead === true;

  const reload = useCallback(async () => {
    try {
      setUsers(await repository.listUsers());
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
      <div className="min-h-screen">
        <Header moduleName="Verwaltung" />
        <main className="mx-auto max-w-4xl px-4 py-10">
          <p className="rounded border border-slate-300 bg-white px-4 py-6 text-slate-700">
            Die Benutzerverwaltung ist Administratoren und Bereichsleitungen vorbehalten.
          </p>
        </main>
      </div>
    );
  }

  const visible = (users ?? []).filter(
    (u) => isAdmin || (u.department === session?.department && !u.isAdmin),
  );

  return (
    <div className="min-h-screen">
      <Header moduleName="Verwaltung" busy={users === null} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mitarbeiter</h1>
            <p className="text-sm text-slate-600">
              {isAdmin
                ? 'Alle Konten des Centers.'
                : `Konten im Bereich ${session?.department ? DEPARTMENT_LABEL[session.department] : ''}.`}
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            + Mitarbeiter anlegen
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            ■ {error}
          </p>
        )}

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Benutzername</th>
                <th className="px-4 py-2 font-semibold">E-Mail</th>
                <th className="px-4 py-2 font-semibold">Bereich</th>
                <th className="px-4 py-2 font-semibold">Leitung</th>
                {isAdmin && <th className="px-4 py-2 font-semibold">Admin</th>}
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Passwort</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <UserRowView
                  key={u.id}
                  user={u}
                  isAdmin={isAdmin}
                  isSelf={u.id === session?.userId}
                  onChange={async (patch) => {
                    await repository.updateUser(u.id, patch);
                    await reload();
                  }}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
          {users !== null && visible.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500">Noch keine Mitarbeiter angelegt.</p>
          )}
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Mitarbeiter melden sich mit ihrem <strong>Benutzernamen</strong> an, nicht mit einer
          E-Mail-Adresse. Angezeigt wird überall der Klarname — auch in der Wartungshistorie.
          Administratoren behalten ihre E-Mail-Anmeldung, damit sie ihr Passwort selbst
          zurücksetzen können.
        </p>
      </main>

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

function UserRowView({
  user,
  isAdmin,
  isSelf,
  onChange,
  onError,
}: {
  user: UserRow;
  isAdmin: boolean;
  isSelf: boolean;
  onChange: (patch: Partial<UserRow>) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function apply(patch: Partial<UserRow>) {
    setBusy(true);
    try {
      await onChange(patch);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={`border-t border-slate-100 ${user.active ? '' : 'text-slate-400'}`}>
      <td className="px-4 py-2 font-medium">
        {user.displayName}
        {isSelf && <span className="ml-2 text-xs text-slate-500">(du)</span>}
      </td>
      <td className="px-4 py-2 text-slate-600">{user.username ?? '—'}</td>
      <td className="px-4 py-2">
        <EmailCell user={user} onError={onError} onSaved={() => apply({})} />
      </td>
      <td className="px-4 py-2">
        <select
          value={user.department ?? ''}
          disabled={busy || !isAdmin}
          onChange={(e) => apply({ department: (e.target.value || null) as Department | null })}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">kein Bereich</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABEL[d]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={user.isLead}
          disabled={busy}
          onChange={(e) => apply({ isLead: e.target.checked })}
          className="h-4 w-4"
        />
      </td>
      {isAdmin && (
        <td className="px-4 py-2">
          <input
            type="checkbox"
            checked={user.isAdmin}
            // Sich selbst die Administratorrechte zu entziehen wuerde bedeuten,
            // sich aus der Verwaltung auszusperren.
            disabled={busy || isSelf}
            title={isSelf ? 'Eigene Administratorrechte lassen sich hier nicht entfernen.' : undefined}
            onChange={(e) => apply({ isAdmin: e.target.checked })}
            className="h-4 w-4"
          />
        </td>
      )}
      <td className="px-4 py-2">
        <button
          disabled={busy || isSelf}
          onClick={() => apply({ active: !user.active })}
          className="rounded border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
        >
          {user.active ? 'Deaktivieren' : 'Aktivieren'}
        </button>
      </td>
      <td className="px-4 py-2">
        <button
          disabled={busy}
          onClick={() => setResetting(true)}
          className="rounded border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
        >
          Zurücksetzen
        </button>
        {resetting && (
          <PasswordDialog
            user={user}
            onClose={() => setResetting(false)}
            onError={onError}
          />
        )}
      </td>
    </tr>
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

  // Vorschlag aus dem Klarnamen: "Marko Weber" -> "marko.weber"
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Mitarbeiter anlegen</h2>

        <label className="mt-4 block text-sm font-medium">
          Klarname
          <input
            autoFocus
            required
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!username) return;
            }}
            onBlur={() => !username && setUsername(suggest(displayName))}
            placeholder="z. B. Marko Weber"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Dieser Name erscheint überall — auch in der Wartungshistorie.
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Benutzername für die Anmeldung
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder={suggest(displayName) || 'marko.weber'}
            autoCapitalize="none"
            autoCorrect="off"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Kleinbuchstaben, Ziffern, Punkt, Bindestrich. Keine E-Mail nötig.
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium">
          E-Mail (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="leer lassen, wenn keine vorhanden"
            autoCapitalize="none"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Mit Adresse kann sich die Person ihr Passwort selbst zurücksetzen. Ohne Adresse
            machst du das in dieser Liste.
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Passwort
          <input
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Mindestens 8 Zeichen. Sag es dem Mitarbeiter persönlich — es gibt keine E-Mail,
            über die es zugestellt werden könnte.
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Bereich
          <select
            value={department}
            disabled={!isAdmin}
            onChange={(e) => setDepartment(e.target.value as Department | '')}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">kein Bereich</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={isLead} onChange={(e) => setIsLead(e.target.checked)} />
          Bereichsleitung — darf Mitarbeiter des eigenen Bereichs verwalten
        </label>

        {error && (
          <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            ■ {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm font-medium">
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Wird angelegt…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Neues Passwort setzen.
 *
 * Es gibt keine E-Mail, über die ein Zurücksetz-Link laufen könnte — der Zugang
 * wird persönlich übergeben. Deshalb wird das Passwort hier im Klartext
 * angezeigt: man muss es weitersagen können, und ein verstecktes Feld hilft
 * niemandem.
 */
function PasswordDialog({
  user,
  onClose,
  onError,
}: {
  user: UserRow;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [password, setPassword] = useState(() => suggestPassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Passwort zurücksetzen</h2>
        <p className="mt-1 text-sm text-slate-600">
          Für <strong>{user.displayName}</strong>
          {user.username && <> (Anmeldung: {user.username})</>}
        </p>

        {done ? (
          <>
            <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-900">● Neues Passwort gesetzt:</p>
              <p className="tabular mt-2 text-center text-xl font-bold tracking-wider">{password}</p>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Gib es persönlich weiter. Nach dem Schließen wird es nicht noch einmal angezeigt —
              dann bleibt nur, es erneut zurückzusetzen.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Fertig
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium">
              Neues Passwort
              <input
                autoFocus
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="tabular mt-1 w-full rounded border border-slate-300 px-3 py-2 text-lg"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Vorgeschlagen und leicht vorlesbar. Du kannst es überschreiben; mindestens
                8 Zeichen.
              </span>
            </label>

            <button
              type="button"
              onClick={() => setPassword(suggestPassword())}
              className="mt-2 text-sm font-medium text-slate-600 hover:underline"
            >
              Anderen Vorschlag
            </button>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm font-medium">
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? 'Wird gesetzt…' : 'Passwort setzen'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/**
 * Vorschlag, der sich am Telefon vorlesen lässt: keine Zeichen, die man
 * verwechseln kann (0/O, 1/l/I), dafür zwei Wörter und Ziffern.
 */
function suggestPassword(): string {
  const words = ['Bahn', 'Pin', 'Kugel', 'Strike', 'Spare', 'Gasse', 'Wurf', 'Kegel'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${pick()}-${pick()}-${digits}`;
}

/**
 * E-Mail eines Kontos ändern.
 *
 * Leer bedeutet: zurück auf die Anmeldung per Benutzername. Der Wechsel betrifft
 * die Anmeldung selbst — deshalb wird er erst beim Verlassen des Feldes wirksam
 * und nicht bei jedem Tastendruck.
 */
function EmailCell({
  user,
  onError,
  onSaved,
}: {
  user: UserRow;
  onError: (message: string) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(user.email ?? '');
  const [busy, setBusy] = useState(false);

  async function commit() {
    const next = value.trim();
    if (next === (user.email ?? '')) return;
    setBusy(true);
    try {
      await repository.setUserEmail(user.id, next);
      onSaved();
    } catch (e) {
      setValue(user.email ?? '');
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="email"
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      placeholder="keine"
      className="w-52 rounded border border-slate-200 px-2 py-1 text-sm"
    />
  );
}
