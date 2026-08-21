import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { DEPARTMENT_LABEL, repository, type ModuleInfo, type MyWeek, type ShiftDay } from '../../data';
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
  const [week, setWeek] = useState<MyWeek | null>(null);
  // Welcher Tag in der Schnellansicht steht. Heute ist der Anfang: danach wird
  // am oeftesten gefragt, und von dort blaettert man weiter.
  const [tag, setTag] = useState(() => (new Date().getDay() + 6) % 7);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository
      .listModules()
      .then((m) => active && setModules(m))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    repository
      .myWeek()
      .then((w) => active && setWeek(w))
      .catch(() => {});
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
        <SchichtKarte week={week} tag={tag} setzeTag={setTag} />
        <WeekCard week={week} tag={tag} setzeTag={setTag} />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
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
 * Die eigene Schicht an einem gewählten Tag.
 *
 * Vorher stand hier nur die nächste. Das beantwortet „wann muss ich wieder
 * arbeiten" — aber nicht „wie sieht meine Woche aus". Beides ist dieselbe
 * Frage in verschiedenen Momenten, und die zweite stellt man abends auf dem
 * Sofa, wenn man die Woche einmal durchgeht.
 *
 * Also: heute als Anfang, und mit zwei Pfeilen durch die Woche. Die Tage
 * darunter im Streifen sind dieselbe Auswahl — antippen genügt.
 */
function SchichtKarte({
  week,
  tag,
  setzeTag,
}: {
  week: MyWeek | null;
  tag: number;
  setzeTag: (t: number) => void;
}) {
  const { session } = useAuth();
  const heute = (new Date().getDay() + 6) % 7;
  const daten = currentWeek();
  const datum = daten[tag];
  const eintrag = week?.days[tag];

  const bezeichnung =
    tag === heute ? 'Heute' : tag === heute + 1 ? 'Morgen' : WEEKDAYS[tag];

  return (
    <article className="db-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold tracking-wide text-db-text3 uppercase">
          Meine Schicht
        </h2>
        <button
          onClick={() => setzeTag((tag + 6) % 7)}
          aria-label="Tag zurück"
          className="db-btn-ghost h-8 w-8 text-lg leading-none"
        >
          ‹
        </button>
        <button
          onClick={() => setzeTag((tag + 1) % 7)}
          aria-label="Tag vor"
          className="db-btn-ghost h-8 w-8 text-lg leading-none"
        >
          ›
        </button>
      </div>

      <div className="mt-4">
        {/* „Heute" und „Morgen" sagen mehr als der Wochentag — der steht dann
            daneben. An allen anderen Tagen waere er doppelt. */}
        <div className="text-db-text2">
          {bezeichnung}
          <span className="text-db-text3">
            {' · '}
            {bezeichnung === WEEKDAYS[tag] ? '' : `${WEEKDAYS[tag]}, `}
            {datum.getDate()}.{datum.getMonth() + 1}.
          </span>
        </div>

        {eintrag && eintrag.status === 'dienst' && eintrag.b ? (
          <>
            <div className="db-num mt-1 text-3xl font-extrabold text-db-gold">
              {eintrag.b} – {eintrag.e}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-db-text2">
              <span aria-hidden="true">👤</span>
              {session?.department ? DEPARTMENT_LABEL[session.department] : 'Kein Bereich'}
              {eintrag.std && <span className="text-db-text3">· {eintrag.std} Std.</span>}
            </div>
          </>
        ) : (
          <div className="mt-1 text-3xl font-extrabold text-db-text3">
            {!week
              ? '—'
              : eintrag?.status === 'urlaub'
                ? 'Urlaub'
                : eintrag?.status === 'krank'
                  ? 'Krank'
                  : 'Frei'}
          </div>
        )}
      </div>

      {!week && (
        <p className="mt-3 text-sm text-db-text3">
          Dein Konto ist noch keinem Namen im Dienstplan zugeordnet. Deine Bereichsleitung kann das
          in der Verwaltung erledigen.
        </p>
      )}

      {tag !== heute && (
        <button
          onClick={() => setzeTag(heute)}
          className="mt-3 text-xs text-db-text3 hover:text-db-gold"
        >
          zurück zu heute
        </button>
      )}

      <a
        href="/dienstplan/index.html"
        className="db-btn-ghost mt-4 block px-4 py-2.5 text-center text-sm font-semibold"
      >
        Zum Dienstplan
      </a>
    </article>
  );
}

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/** Die laufende Woche als Streifen — sieben Tage auf einen Blick. */
function WeekCard({
  week,
  tag,
  setzeTag,
}: {
  week: MyWeek | null;
  tag: number;
  setzeTag: (t: number) => void;
}) {
  const days = currentWeek();
  const today = new Date().toDateString();

  return (
    <article className="db-card p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">
          Diese Woche
        </h2>
        <div className="flex items-center gap-2">
          {/* Solange ueber das neue Modul entschieden wird, steht der Entwurf
              daneben — auch am Handy, wo es keine Seitenleiste gibt. */}
          <Link to="/dienstplan-entwurf" className="db-btn-ghost px-3 py-1.5 text-xs whitespace-nowrap">
            Entwurf ansehen
          </Link>
          <a href="/dienstplan/index.html" className="db-btn-gold px-3 py-1.5 text-xs whitespace-nowrap">
            Zum Dienstplan
          </a>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d, i) => {
          const isToday = d.toDateString() === today;
          const gewaehlt = i === tag;
          return (
            <button
              key={d.toISOString()}
              onClick={() => setzeTag(i)}
              aria-pressed={gewaehlt}
              className={`rounded-lg border px-0.5 py-2 text-center transition sm:rounded-xl sm:px-2 ${
                gewaehlt
                  ? 'border-db-gold bg-db-gold/10 ring-1 ring-db-gold'
                  : 'border-db-line hover:border-db-gold/40'
              }`}
            >
              <div
                className={`text-[9px] tracking-wide uppercase sm:text-[10px] ${
                  isToday ? 'font-bold text-db-gold' : 'text-db-text3'
                }`}
              >
                {d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}
              </div>
              <div
                className={`db-num text-base font-bold sm:text-lg ${
                  gewaehlt || isToday ? 'text-db-gold' : ''
                }`}
              >
                {d.getDate()}
              </div>
              <DayBar day={week?.days[i]} />
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-db-text3">
        {week
          ? `Deine Woche als ${week.employeeName}.`
          : 'Die farbigen Balken zeigen deine Schichten, sobald dein Konto im Dienstplan zugeordnet ist.'}
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

/** Farbe und Zeiten eines Tages. Ohne Zuordnung bleibt der Balken grau. */
/**
 * Was an einem Tag ansteht, klein genug für sieben nebeneinander.
 *
 * Vorher stand hier nur ein Balken, und die Zeit erschien erst ab Tabletbreite
 * — am Handy war die Woche damit nicht zu lesen, sondern nur zu erahnen. Jetzt
 * steht auf jedem Tag, woran man ihn erkennt: die Anfangszeit bei Dienst, das
 * Wort bei Urlaub und Krank, ein stilles „frei" sonst. Der Balken bleibt als
 * Farbe darüber, damit die Woche auch im Vorbeischauen eine Form hat.
 */
function DayBar({ day }: { day?: ShiftDay }) {
  const dienst = day?.status === 'dienst' && day.b;

  const farbe =
    day?.status === 'dienst'
      ? 'bg-db-gold'
      : day?.status === 'urlaub'
        ? 'bg-db-ok'
        : day?.status === 'krank'
          ? 'bg-db-bad'
          : 'bg-db-line';

  const text = dienst
    ? { wort: day!.b, klasse: 'text-db-gold' }
    : day?.status === 'urlaub'
      ? { wort: 'Urlaub', klasse: 'text-db-ok' }
      : day?.status === 'krank'
        ? { wort: 'Krank', klasse: 'text-db-bad' }
        : day
          ? { wort: 'frei', klasse: 'text-db-text3' }
          : { wort: '·', klasse: 'text-db-text3' };

  return (
    <>
      <div className={`mt-1.5 h-1 rounded-full ${farbe}`} />
      <div className={`db-num mt-1 text-[10px] leading-tight font-semibold ${text.klasse}`}>
        {text.wort}
      </div>
      {/* Auf breiten Schirmen ist Platz für das Ende — am Handy nicht. */}
      {dienst && (
        <div className="db-num hidden text-[10px] leading-tight text-db-text3 sm:block">
          {day!.e}
        </div>
      )}
    </>
  );
}
