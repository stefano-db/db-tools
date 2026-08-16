import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { IssueDialog } from '../features/issues/IssueDialog';
import { LoginPage, NoAccessPage } from '../features/auth/LoginPage';

const NAV = [
  { to: '/', label: 'Dashboard', end: true, adminOnly: false },
  { to: '/eingabe', label: 'Frame-Stände', adminOnly: false },
  { to: '/historie', label: 'Historie', adminOnly: false },
  // Für Mechaniker sichtbar, weil dort der eigene Anzeigename gepflegt wird;
  // die Konfigurationsbereiche darin sind Administratoren vorbehalten.
  { to: '/einstellungen', label: 'Einstellungen', adminOnly: false },
];

export function AppShell() {
  const { session, loading: authLoading, requiresLogin, signOut } = useAuth();

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-900 text-slate-300">
        Anmeldung wird geprüft…
      </div>
    );
  }
  if (requiresLogin && !session) return <LoginPage />;
  if (session && !session.canRead) {
    return <NoAccessPage name={session.displayName} onSignOut={() => void signOut()} />;
  }

  return <Shell />;
}

function Shell() {
  const { repo, loading, error, employee, isAdmin } = useData();
  const { session, signOut } = useAuth();
  const [issueOpen, setIssueOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded bg-slate-700 text-sm font-bold">BW</span>
            <div className="leading-tight">
              <div className="font-semibold">Bahnwartung</div>
              <div className="text-xs text-slate-400">
                {repo.kind === 'demo' ? 'Demo-Bestand (lokal)' : 'Bowlingcenter'}
              </div>
            </div>
          </div>

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIssueOpen(true)}
              className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
            >
              Defekt melden
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-slate-800"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-600 text-xs font-bold">
                  {initials(employee)}
                </span>
                <span className="hidden sm:inline">{employee}</span>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-slate-200 bg-white p-1 text-slate-900 shadow-lg">
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {session?.email ?? 'Demo-Betrieb'}
                      <div className="font-semibold text-slate-700">{roleLabel(session?.role)}</div>
                    </div>
                    <hr className="my-1 border-slate-100" />
                    <button
                      onClick={() => void signOut()}
                      className="w-full rounded px-3 py-2 text-left text-sm font-medium hover:bg-slate-100"
                    >
                      Abmelden
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {loading && <div className="h-0.5 animate-pulse bg-sky-400" />}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            <strong className="font-semibold">Fehler beim Laden:</strong> {error}
          </div>
        )}
        <Outlet />
      </main>

      {issueOpen && <IssueDialog onClose={() => setIssueOpen(false)} />}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function roleLabel(role: string | undefined): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'counter') return 'Counter';
  return 'Mechaniker';
}
