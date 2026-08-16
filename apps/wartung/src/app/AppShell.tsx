import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useData } from './DataContext';
import { IssueDialog } from '../features/issues/IssueDialog';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/eingabe', label: 'Frame-Stände' },
  { to: '/historie', label: 'Historie' },
  { to: '/einstellungen', label: 'Einstellungen' },
];

export function AppShell() {
  const { repo, loading, error, employee, setEmployee } = useData();
  const [issueOpen, setIssueOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded bg-slate-700 text-sm font-bold">BW</span>
            <div className="leading-tight">
              <div className="font-semibold">Bahnwartung</div>
              <div className="text-xs text-slate-400">
                {repo.kind === 'demo' ? 'Demo-Bestand (lokal)' : 'Supabase'}
              </div>
            </div>
          </div>

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {NAV.map((item) => (
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

          <div className="ml-auto flex items-center gap-3">
            <label className="hidden text-xs text-slate-400 sm:block">
              Mitarbeiter
              <input
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                className="ml-2 w-28 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <button
              onClick={() => setIssueOpen(true)}
              className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
            >
              Defekt melden
            </button>
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
