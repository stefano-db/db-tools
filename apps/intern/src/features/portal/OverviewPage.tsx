import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { DEPARTMENT_LABEL, repository, type ModuleInfo } from '../../data';
import { Mascot, type MascotName } from '../../ui/Mascot';

/**
 * Übersicht — die Startseite nach der Anmeldung.
 *
 * Zeigt in dieser Reihenfolge: die eigene nächste Schicht, die laufende
 * Dienstplanwoche, die freigeschalteten Werkzeuge. Was jemand als Erstes
 * wissen will, steht oben; alles andere ist eine Bildschirmhöhe entfernt.
 */
export function OverviewPage() {
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
    <div className="space-y-5">
      {error && (
        <p className="db-card border-db-bad/50 px-4 py-3 text-sm text-db-bad">■ {error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <NextShiftCard />
        <WeekCard />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold">Deine Tools</h2>
          <span className="text-xs text-db-text3">
            {session?.isAdmin
              ? 'Als Administrator siehst du alle Bereiche'
              : `Bereich ${session?.department ? DEPARTMENT_LABEL[session.department] : '—'}`}
          </span>
        </div>

        {modules !== null && modules.length === 0 && (
          <p className="db-card px-4 py-6 text-db-text2">
            Für dein Konto ist noch kein Werkzeug freigeschaltet. Deine Bereichsleitung kann das
            ändern.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(modules ?? []).map((m) => (
            <ToolCard key={m.key} module={m} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Die eigene nächste Schicht.
 *
 * Solange das Konto keinem Namen im Dienstplan zugeordnet ist, kann hier nichts
 * stehen — und das wird gesagt, statt die Karte leer zu lassen.
 */
function NextShiftCard() {
  const { session } = useAuth();

  return (
    <article className="db-card p-5">
      <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">
        Nächste Schicht
      </h2>

      <div className="mt-4 rounded-xl border border-db-line bg-db-card2 p-4 text-center">
        <p className="text-db-text2">Noch keine Schicht hinterlegt.</p>
        <p className="mt-2 text-sm text-db-text3">
          Sobald dein Konto <strong className="text-db-text2">{session?.displayName}</strong> mit
          einem Namen im Dienstplan verbunden ist, steht hier deine nächste Schicht mit Datum,
          Uhrzeit und Bereich.
        </p>
      </div>

      <a
        href="/dienstplan/index.html"
        className="db-btn-ghost mt-4 block px-4 py-2.5 text-center text-sm font-semibold"
      >
        Zum Dienstplan
      </a>
    </article>
  );
}

/** Die laufende Woche als Streifen — sieben Tage auf einen Blick. */
function WeekCard() {
  const days = currentWeek();
  const today = new Date().toDateString();

  return (
    <article className="db-card p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">
          Dienstplan — diese Woche
        </h2>
        <a href="/dienstplan/index.html" className="db-btn-gold px-3 py-1.5 text-xs">
          Zum Dienstplan
        </a>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((d) => {
          const isToday = d.toDateString() === today;
          return (
            <div
              key={d.toISOString()}
              className={`rounded-xl border p-2 text-center ${
                isToday ? 'border-db-gold bg-db-card2' : 'border-db-line'
              }`}
            >
              <div className="text-[10px] tracking-wide text-db-text3 uppercase">
                {d.toLocaleDateString('de-DE', { weekday: 'short' })}
              </div>
              <div className={`db-num text-lg font-bold ${isToday ? 'text-db-gold' : ''}`}>
                {d.getDate()}
              </div>
              <div className="mt-2 h-1 rounded-full bg-db-line" />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-db-text3">
        Die farbigen Balken zeigen deine Schichten, sobald dein Konto im Dienstplan zugeordnet ist.
      </p>
    </article>
  );
}

const TOOL_MASCOT: Record<string, MascotName> = {
  maintenance: 'mechanik',
  urkunden: 'counter',
  dokumente: 'service',
  dienstplan: 'winken',
};

const TOOL_TEXT: Record<string, string> = {
  maintenance: 'Bahnwartung, Frame-Stände, Störungen und Reparaturen.',
  urkunden: 'Events anlegen, auswerten und Urkunden drucken.',
  dokumente: 'Formulare, Preislisten und Aushänge zum Ausdrucken.',
  dienstplan: 'Wochenplan ansehen und — als Leitung — bearbeiten.',
};

function ToolCard({ module: m }: { module: ModuleInfo }) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <Mascot name={TOOL_MASCOT[m.key] ?? 'profil'} size={56} />
        {!m.canWrite && (
          <span className="rounded-full bg-db-card2 px-2 py-0.5 text-[10px] text-db-text3">
            nur ansehen
          </span>
        )}
      </div>
      <h3 className="mt-3 font-bold">{m.nameDe}</h3>
      <p className="mt-1 flex-1 text-sm text-db-text2">{TOOL_TEXT[m.key] ?? 'Öffnen'}</p>
      <span className="db-btn-gold mt-4 block px-4 py-2 text-center text-sm">Öffnen</span>
    </>
  );

  const cls = 'db-card db-card-hover flex flex-col p-4 transition';
  const target = m.externalUrl ?? m.path;

  // Adressen außerhalb der Plattform öffnen in einem neuen Tab, eigenständige
  // Seiten daneben brauchen einen vollen Seitenwechsel.
  if (m.externalUrl) {
    const sameSite = m.externalUrl.startsWith('/');
    return (
      <a
        href={target}
        target={sameSite ? undefined : '_blank'}
        rel={sameSite ? undefined : 'noopener noreferrer'}
        className={cls}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link to={target} className={cls}>
      {inner}
    </Link>
  );
}

/** Montag bis Sonntag der laufenden Woche. */
function currentWeek(): Date[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
