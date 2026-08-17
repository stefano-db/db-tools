import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { DEPARTMENT_LABEL } from '../data';
import { Logo, Mascot } from '../ui/Mascot';

/**
 * Rahmen der Plattform: Seitenleiste am Rechner, Reiterleiste am Handy.
 *
 * Die Navigation zeigt nur, was der angemeldete Mitarbeiter auch benutzen darf.
 * Was hier fehlt, ist nicht bloß versteckt — die Datenbank lässt ihn ohnehin
 * nicht heran.
 */

interface NavEntry {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /** Nur für Leitungen und Administratoren. */
  leadOnly?: boolean;
  adminOnly?: boolean;
}

const MAIN: NavEntry[] = [
  { to: '/', label: 'Übersicht', icon: '🏠', end: true },
  { to: '/dienstplan/index.html', label: 'Dienstplan', icon: '📅' },
  { to: '/meine-schichten', label: 'Meine Schichten', icon: '🗓' },
];

const AREA: NavEntry[] = [
  { to: '/werkzeuge', label: 'Tools', icon: '🧰' },
  { to: '/dokumente', label: 'Infos & Docs', icon: '📁' },
];

const ADMIN: NavEntry[] = [
  { to: '/verwaltung', label: 'Verwaltung', icon: '👥', leadOnly: true },
];

const ACCOUNT: NavEntry[] = [{ to: '/profil', label: 'Profil', icon: '🙂' }];

/** Am Handy nur die wichtigsten fünf — mehr passt nicht in eine Reiterleiste. */
const MOBILE: NavEntry[] = [
  { to: '/', label: 'Übersicht', icon: '🏠', end: true },
  { to: '/dienstplan/index.html', label: 'Plan', icon: '📅' },
  { to: '/werkzeuge', label: 'Tools', icon: '🧰' },
  { to: '/dokumente', label: 'Docs', icon: '📁' },
  { to: '/profil', label: 'Profil', icon: '🙂' },
];

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
  const visible = (list: NavEntry[]) =>
    list.filter((e) => (!e.leadOnly || mayLead) && (!e.adminOnly || session?.isAdmin));

  return (
    <div className="min-h-screen bg-db-bg text-db-text">
      {/* Seitenleiste — ab Tablet */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-db-line bg-db-card lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <Group items={visible(MAIN)} />
          <GroupTitle>Mein Bereich</GroupTitle>
          <Group items={visible(AREA)} />
          {mayLead && (
            <>
              <GroupTitle>Leitung</GroupTitle>
              <Group items={visible(ADMIN)} />
            </>
          )}
          <GroupTitle>Konto</GroupTitle>
          <Group items={visible(ACCOUNT)} />
        </nav>

        <NavLink
          to="/profil"
          className="m-3 flex items-center gap-3 rounded-xl border border-db-line p-3 hover:border-db-gold-dim"
        >
          <Mascot name="profil" size={38} className="rounded-full" />
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
        <header className="db-hero border-b border-db-line px-4 py-5 sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
            <div className="w-full lg:hidden">
              <Logo />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-db-text2">{greeting(now)},</div>
              <div className="truncate text-2xl font-extrabold sm:text-3xl">
                {session?.displayName ?? ''}
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-sm text-db-text2">{dateLabel(now)}</div>
              <div className="db-num text-2xl font-bold">{timeLabel(now)}</div>
            </div>
            <Mascot name="winken" size={64} className="hidden sm:block" />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-8 lg:pb-10" key={location.pathname}>
          {/* Auf jeder Unterseite ein sichtbarer Rueckweg — nicht jeder findet
              ihn in der Seitenleiste, und am Handy gibt es keine. */}
          {location.pathname !== '/' && (
            <Link
              to="/"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-db-text2 hover:text-db-gold"
            >
              ← Übersicht
            </Link>
          )}
          <Outlet />
        </main>
      </div>

      {/* Reiterleiste — nur am Handy */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-db-line bg-db-card lg:hidden">
        {visible(MOBILE).map((e) => (
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
 * Eigenständige Seiten wie der Dienstplan liegen neben der React-Anwendung und
 * brauchen einen vollen Seitenwechsel — der Router kennt sie nicht.
 */
function isStandalone(to: string) {
  return to.endsWith('.html');
}

function SideLink({ entry }: { entry: NavEntry }) {
  const cls =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-db-text2 hover:bg-db-card2 hover:text-db-text';

  if (isStandalone(entry.to)) {
    return (
      <a href={entry.to} className={cls}>
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

  if (isStandalone(entry.to)) {
    return (
      <a href={entry.to} className={cls}>
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
