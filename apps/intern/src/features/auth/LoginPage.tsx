import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        // Auf dem Werkstatt-Tablet soll nichts automatisch großgeschrieben oder
        // korrigiert werden.
        autoComplete="on"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded bg-slate-900 text-sm font-bold text-white">
            BW
          </span>
          <div>
            <h1 className="text-lg font-bold">Bahnwartung</h1>
            <p className="text-sm text-slate-500">Interne Anmeldung</p>
          </div>
        </div>

        <label className="block text-sm font-medium">
          E-Mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            autoFocus
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && (
          <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            ■ {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded bg-slate-900 py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Anmeldung läuft…' : 'Anmelden'}
        </button>

        <p className="mt-4 text-xs text-slate-500">
          Zugang vergessen? Melde dich bei der Centerleitung — Konten werden zentral vergeben.
        </p>
      </form>
    </div>
  );
}

/** Angemeldet, aber ohne Recht auf dieses Modul. */
export function NoAccessPage({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-xl">
        <h1 className="text-lg font-bold">Kein Zugriff auf die Bahnwartung</h1>
        <p className="mt-2 text-sm text-slate-600">
          Du bist als <strong>{name}</strong> angemeldet, hast für dieses Modul aber keine
          Berechtigung. Ein Administrator kann sie freischalten.
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}
