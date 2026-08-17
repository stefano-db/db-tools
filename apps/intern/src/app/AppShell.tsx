import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { IssueDialog } from '../features/issues/IssueDialog';
import { LoginPage, NoAccessPage } from '../features/auth/LoginPage';

/**
 * Anmeldeschranke der gesamten Plattform. Ohne Sitzung gibt es nur die
 * Anmeldemaske — kein Modul, keine Daten.
 */
export function RequireAuth() {
  const { session, loading, requiresLogin } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-db-bg text-db-text2">
        Anmeldung wird geprüft…
      </div>
    );
  }
  if (requiresLogin && !session) return <LoginPage />;
  return <Outlet />;
}

const NAV = [
  { to: '/wartung', label: 'Dashboard', end: true },
  { to: '/wartung/eingabe', label: 'Frame-Stände' },
  { to: '/wartung/historie', label: 'Historie' },
  { to: '/wartung/einstellungen', label: 'Einstellungen' },
];

/**
 * Rahmen des Moduls Bahnwartung.
 *
 * Liegt innerhalb des Plattform-Rahmens: Seitenleiste und Kopfzeile kommen von
 * dort, hier steht nur, was zum Modul selbst gehört — seine eigene Navigation
 * und das Melden eines Defekts.
 */
export function MaintenanceShell() {
  const { session, signOut } = useAuth();
  const { error } = useData();
  const [issueOpen, setIssueOpen] = useState(false);

  // Wer das Modul nicht freigeschaltet hat, sieht hier nichts — auch wenn er
  // die Adresse direkt aufruft.
  if (session && !session.canRead) {
    return <NoAccessPage name={session.displayName} onSignOut={() => void signOut()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <h1 className="mr-auto text-2xl font-extrabold">Bahnwartung</h1>
        <button onClick={() => setIssueOpen(true)} className="db-btn-ghost px-3 py-2 text-sm">
          Defekt melden
        </button>
      </div>

      <nav className="db-scroll-x -mx-1 flex gap-1 overflow-x-auto pb-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                isActive
                  ? 'bg-db-card2 text-db-gold'
                  : 'text-db-text2 hover:bg-db-card2 hover:text-db-text'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {error && (
        <div className="db-card border-db-bad px-4 py-3 text-db-bad">
          <strong className="font-semibold">Fehler beim Laden:</strong> {error}
        </div>
      )}

      <Outlet />

      {issueOpen && <IssueDialog onClose={() => setIssueOpen(false)} />}
    </div>
  );
}
