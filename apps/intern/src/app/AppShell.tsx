import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { Header, type NavItem } from './Header';
import { IssueDialog } from '../features/issues/IssueDialog';
import { LoginPage, NoAccessPage } from '../features/auth/LoginPage';

/**
 * Anmeldeschranke der gesamten Plattform. Ohne Sitzung gibt es nur die
 * Anmeldemaske — kein Modul, keine Daten.
 */
export function RequireAuth() {
  const { session, loading, requiresLogin, signOut } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-900 text-slate-300">
        Anmeldung wird geprüft…
      </div>
    );
  }
  if (requiresLogin && !session) return <LoginPage />;
  return <Outlet />;
}

const NAV: NavItem[] = [
  { to: '/wartung', label: 'Dashboard', end: true },
  { to: '/wartung/eingabe', label: 'Frame-Stände' },
  { to: '/wartung/historie', label: 'Historie' },
  { to: '/wartung/einstellungen', label: 'Einstellungen' },
];

/** Rahmen des Moduls Bahnwartung. */
export function MaintenanceShell() {
  const { session, signOut } = useAuth();
  const { loading, error } = useData();
  const [issueOpen, setIssueOpen] = useState(false);

  // Wer das Modul nicht freigeschaltet hat, sieht hier nichts — auch wenn er
  // die Adresse direkt aufruft.
  if (session && !session.canRead) {
    return <NoAccessPage name={session.displayName} onSignOut={() => void signOut()} />;
  }

  return (
    <div className="min-h-screen">
      <Header
        moduleName="Bahnwartung"
        nav={NAV}
        busy={loading}
        actions={
          <button
            onClick={() => setIssueOpen(true)}
            className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Defekt melden
          </button>
        }
      />

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
