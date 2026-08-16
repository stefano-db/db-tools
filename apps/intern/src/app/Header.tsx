import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { DEPARTMENT_LABEL, type Department } from '../data';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/**
 * Kopfzeile der Plattform. Links immer der Weg zurück zur Modulübersicht,
 * rechts das eigene Konto — unabhängig davon, in welchem Modul man gerade ist.
 */
export function Header({
  moduleName,
  nav = [],
  actions,
  busy = false,
}: {
  moduleName?: string;
  nav?: NavItem[];
  actions?: ReactNode;
  busy?: boolean;
}) {
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = session?.displayName ?? 'Unbekannt';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-3 rounded hover:opacity-90">
          <span className="grid h-8 w-8 place-items-center rounded bg-slate-700 text-sm font-bold">
            DB
          </span>
          <div className="leading-tight">
            <div className="font-semibold">{moduleName ?? 'Interne Werkzeuge'}</div>
            <div className="text-xs text-slate-400">
              {moduleName ? '← Übersicht' : 'Bowlingcenter'}
            </div>
          </div>
        </Link>

        {nav.length > 0 && (
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
        )}

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-slate-800"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-600 text-xs font-bold">
                {initials(name)}
              </span>
              <span className="hidden sm:inline">{name}</span>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-slate-200 bg-white p-1 text-slate-900 shadow-lg">
                  <div className="px-3 py-2 text-xs text-slate-500">
                    {session?.email ?? 'Demo-Betrieb'}
                    <div className="font-semibold text-slate-700">{roleLabel(session)}</div>
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
      {busy && <div className="h-0.5 animate-pulse bg-sky-400" />}
    </header>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function roleLabel(session: { department?: string | null; isLead?: boolean; isAdmin?: boolean } | null): string {
  if (!session) return '';
  const parts: string[] = [];
  if (session.department) parts.push(DEPARTMENT_LABEL[session.department as Department]);
  if (session.isLead) parts.push('Leitung');
  if (session.isAdmin) parts.push('Administrator');
  return parts.join(' · ') || 'Kein Bereich';
}
