import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useModule } from './ModuleContext';
import { bereicheFuer, type Bereich } from './bereiche';
import { DEPARTMENT_LABEL } from '../data';
import { Logo, Mascot } from '../ui/Mascot';
import { ChatBlase } from '../features/chat/ChatBlase';
import { Planwaechter } from '../features/plan/Planwaechter';

/**
 * Rahmen der Plattform: Seitenleiste am Rechner, Reiterleiste am Handy.
 *
 * Die Navigation zeigt nur, was der angemeldete Mitarbeiter auch benutzen darf.
 * Was hier fehlt, ist nicht bloß versteckt — die Datenbank lässt ihn ohnehin
 * nicht heran.
 */

/**
 * Die Navigation liest denselben Katalog wie der Startbildschirm.
 *
 * Vorher stand sie hier als eigene Liste, und die beiden liefen auseinander:
 * „Tools" und „Meine Schichten" fuehrten auf Adressen, die es gar nicht gab.
 * Wer darauf tippte, landete wortlos wieder auf der Uebersicht.
 */
interface NavEntry {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  extern?: string | null;
}

const UEBERSICHT: NavEntry = { to: '/', label: 'Übersicht', icon: '🏠', end: true };
const PROFIL: NavEntry = { to: '/profil', label: 'Profil', icon: '🙂' };

function alsEintrag(b: Bereich): NavEntry {
  return { to: b.ziel, label: b.titel, icon: b.symbol, extern: b.extern };
}

export function AppLayout() {
  const { session } = useAuth();
  const location = useLocation();
  const [now, setNow] = useState(() => new Date());

  // Die Uhr im Kopf ist nicht Zierde: wer eine Schicht plant, will die aktuelle
  // Zeit sehen, ohne das Fenster zu wechseln.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const mayLead = session?.isLead === true || session?.isAdmin === true;
  const { module } = useModule();
  const gruppen = bereicheFuer(module ?? [], mayLead);

  // Das eigene Konto steht unten bei „Konto", nicht zwischen den Werkzeugen.
  const fuerAlle = gruppen.alle.filter((b) => b.schluessel !== 'profil').map(alsEintrag);
  const meine = gruppen.meine.map(alsEintrag);
  const leitung = gruppen.leitung.map(alsEintrag);
  const bereichName = session?.isAdmin
    ? 'Alle Bereiche'
    : session?.department
      ? DEPARTMENT_LABEL[session.department]
      : 'Mein Bereich';

  // Am Handy passen fuenf Reiter, nicht mehr. Der eigene Bereich steht dabei
  // vor allem Allgemeinen ausser dem Dienstplan: wer in der Mechanik arbeitet,
  // braucht die Bahnwartung oefter als die Dokumente. Das Konto haelt den
  // letzten Platz, damit der Abmelden-Weg nicht wandert.
  const plan = fuerAlle.filter((e) => e.to === '/dienstplan');
  const uebrig = fuerAlle.filter((e) => e.to !== '/dienstplan');
  const mobil = [UEBERSICHT, ...plan, ...meine, ...uebrig]
    .slice(0, 4)
    .concat(PROFIL)
    .filter((e, i, liste) => liste.findIndex((x) => x.to === e.to) === i);

  return (
    <div className="min-h-screen bg-db-bg text-db-text">
      {/* Seitenleiste — ab Tablet */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-db-line bg-db-card lg:flex">
        {/* Mittig in der 240 Punkte breiten Leiste: linksbuendig zog die
            Wortmarke das Auge an den Rand statt in die Seite. */}
        <div className="flex justify-center px-4 py-5">
          <Logo hoehe={78} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <Group items={[UEBERSICHT, ...fuerAlle]} />
          {meine.length > 0 && (
            <>
              <GroupTitle>{bereichName}</GroupTitle>
              <Group items={meine} />
            </>
          )}
          {leitung.length > 0 && (
            <>
              <GroupTitle>Leitung</GroupTitle>
              <Group items={leitung} />
            </>
          )}
          <GroupTitle>Konto</GroupTitle>
          <Group items={[PROFIL]} />
        </nav>

        <NavLink
          to="/profil"
          className="m-3 flex items-center gap-3 rounded-xl border border-db-line p-3 hover:border-db-gold-dim"
        >
          <Mascot name="profil" size={38} variante="kopf" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{session?.displayName}</span>
            <span className="block truncate text-xs text-db-text3">
              {session?.department ? DEPARTMENT_LABEL[session.department] : 'Kein Bereich'}
            </span>
          </span>
        </NavLink>
      </aside>

      {/* Inhalt */}
      <div className="lg:pl-60">
        <header
          className="db-hero border-b border-db-line px-4 py-3 sm:px-8 sm:py-5"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
        >
          <div className="db-kopfzeile mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
            {/* Am Handy neben dem Gruss statt darueber: eine eigene Zeile fuer
                das Logo kostet 50 Punkte, und die fehlen unten beim Sonntag. */}
            <div className="lg:hidden">
              <Logo hoehe={40} />
            </div>
            <div className="min-w-0 flex-1">
              {/* Am Handy in einer Zeile: drei Zeilen Kopf kosten den Sonntag
                  am unteren Rand. */}
              <div className="hidden text-sm text-db-text2 sm:block">{greeting(now)},</div>
              <div className="truncate text-xl font-extrabold sm:text-3xl">
                <span className="font-normal text-db-text2 sm:hidden">{greeting(now)}, </span>
                {session?.displayName ?? ''}
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-sm text-db-text2">{dateLabel(now)}</div>
              <div className="db-num text-2xl font-bold">{timeLabel(now)}</div>
            </div>
            <Mascot name="winken" size={88} className="hidden sm:block" />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-36 sm:px-8 lg:pb-10" key={location.pathname}>
          {/* Auf jeder Unterseite ein sichtbarer Rueckweg — nicht jeder findet
              ihn in der Seitenleiste, und am Handy gibt es keine. */}
          {location.pathname !== '/' && (
            <Link
              to="/"
              className="nicht-drucken mb-4 inline-flex items-center gap-2 text-sm font-medium text-db-text2 hover:text-db-gold"
            >
              ← Übersicht
            </Link>
          )}
          <Outlet />
        </main>

        {/* Pinny in Reichweite, auf jeder Seite. */}
        <ChatBlase />

        {/* Meldet Aenderungen am eigenen Plan, solange die Seite offen ist. */}
        <Planwaechter />
      </div>

      {/* Reiterleiste — nur am Handy */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-db-line bg-db-card lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobil.map((e) => (
          <TabLink key={e.to} entry={e} />
        ))}
      </nav>
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-wider text-db-text3 uppercase">
      {children}
    </div>
  );
}

function Group({ items }: { items: NavEntry[] }) {
  return (
    <div className="space-y-0.5">
      {items.map((e) => (
        <SideLink key={e.to} entry={e} />
      ))}
    </div>
  );
}

/**
 * Eigenständige Werkzeuge liegen neben der React-Anwendung — das Urkundensystem
 * etwa. Sie brauchen einen vollen Seitenwechsel, der Router kennt sie nicht.
 */
function eigenstaendig(entry: NavEntry) {
  return typeof entry.extern === 'string' && entry.extern !== '';
}

function SideLink({ entry }: { entry: NavEntry }) {
  const cls =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-db-text2 hover:bg-db-card2 hover:text-db-text';

  if (eigenstaendig(entry)) {
    const fremd = !entry.extern!.startsWith('/');
    return (
      <a
        href={entry.extern!}
        target={fremd ? '_blank' : undefined}
        rel={fremd ? 'noopener noreferrer' : undefined}
        className={cls}
      >
        <span aria-hidden="true">{entry.icon}</span>
        {entry.label}
      </a>
    );
  }

  return (
    <NavLink
      to={entry.to}
      end={entry.end}
      className={({ isActive }) =>
        `${cls} ${isActive ? 'bg-db-card2 !text-db-gold' : ''}`
      }
    >
      <span aria-hidden="true">{entry.icon}</span>
      {entry.label}
    </NavLink>
  );
}

function TabLink({ entry }: { entry: NavEntry }) {
  // min-w-0 und truncate: ohne sie schieben lange Wörter die Reiter ineinander.
  const cls =
    'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] text-db-text3';

  if (eigenstaendig(entry)) {
    const fremd = !entry.extern!.startsWith('/');
    return (
      <a
        href={entry.extern!}
        target={fremd ? '_blank' : undefined}
        rel={fremd ? 'noopener noreferrer' : undefined}
        className={cls}
      >
        <span className="text-lg" aria-hidden="true">
          {entry.icon}
        </span>
        <span className="w-full truncate text-center">{entry.label}</span>
      </a>
    );
  }

  return (
    <NavLink
      to={entry.to}
      end={entry.end}
      className={({ isActive }) => `${cls} ${isActive ? '!text-db-gold' : ''}`}
    >
      <span className="text-lg" aria-hidden="true">
        {entry.icon}
      </span>
      <span className="w-full truncate text-center">{entry.label}</span>
    </NavLink>
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

function dateLabel(now: Date): string {
  return now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function timeLabel(now: Date): string {
  return now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
