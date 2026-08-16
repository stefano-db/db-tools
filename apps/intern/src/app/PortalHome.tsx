import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { repository, type ModuleInfo } from '../data';
import { useAuth } from './AuthContext';
import { Header } from './Header';

const ICONS: Record<string, string> = {
  wrench: '🔧',
  monitor: '🖥️',
  trophy: '🏆',
};

const BESCHREIBUNG: Record<string, string> = {
  maintenance: 'Frame-Stände eintragen, fällige Wartungen sehen und dokumentieren',
  urkunden: 'Events anlegen, Ergebnisse auswerten und Urkunden drucken',
};

/**
 * Startseite der Plattform: der Mitarbeiter sieht ausschließlich die Werkzeuge
 * seines Bereichs. Gibt es nur eines, führt ein Klick direkt hinein.
 */
export function PortalHome() {
  const { session } = useAuth();
  const [modules, setModules] = useState<ModuleInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository
      .listModules()
      .then((m) => active && setModules(m))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <Header busy={modules === null && !error} />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">Hallo {session?.displayName ?? ''}</h1>
        <p className="mt-1 text-slate-600">
          Deine Werkzeuge. Was hier nicht steht, ist für deinen Bereich nicht freigeschaltet.
        </p>

        {error && (
          <p className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            ■ {error}
          </p>
        )}

        {modules !== null && modules.length === 0 && (
          <p className="mt-6 rounded border border-slate-300 bg-white px-4 py-6 text-slate-700">
            Für dein Konto ist noch kein Werkzeug freigeschaltet. Ein Administrator kann das
            unter <em>Benutzerverwaltung</em> ändern.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(modules ?? []).map((m) => (
            <ModuleTile key={m.key} module={m} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ModuleTile({ module: m }: { module: ModuleInfo }) {
  const inner = (
    <>
      <span className="text-3xl" aria-hidden="true">
        {ICONS[m.icon ?? ''] ?? '📋'}
      </span>
      <span>
        <span className="block text-lg font-semibold">
          {m.nameDe}
          {m.externalUrl && !m.externalUrl.startsWith('/') && (
            <span className="ml-2 align-middle text-xs font-normal text-slate-500">
              eigenes Werkzeug ↗
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-slate-600">
          {BESCHREIBUNG[m.key] ?? 'Öffnen'}
        </span>
        {!m.canWrite && (
          <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            nur ansehen
          </span>
        )}
      </span>
    </>
  );

  const cls =
    'flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-400 hover:shadow-sm';

  if (m.externalUrl) {
    // Eigenstaendige Seiten neben der React-Anwendung (z. B. das Urkundensystem)
    // liegen auf derselben Adresse und brauchen einen vollen Seitenwechsel —
    // der Router der Plattform kennt sie nicht. Fremde Adressen oeffnen dagegen
    // in einem neuen Tab, damit die eigene Sitzung sichtbar bleibt.
    const sameSite = m.externalUrl.startsWith('/');
    return (
      <a
        href={m.externalUrl}
        target={sameSite ? undefined : '_blank'}
        rel={sameSite ? undefined : 'noopener noreferrer'}
        className={cls}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link to={m.path.replace(/\/+$/, '') || '/'} className={cls}>
      {inner}
    </Link>
  );
}
