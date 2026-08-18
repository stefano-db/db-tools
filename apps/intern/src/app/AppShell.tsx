import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  // Die Bahnansicht hängt am Dashboard — von dort kommt man hin, dorthin führt
  // "Zurück". Deshalb bleibt der Reiter dabei aktiv.
  { to: '/wartung', label: 'Dashboard', match: (p: string) => p === '/wartung' || p.startsWith('/wartung/bahn') },
  { to: '/wartung/eingabe', label: 'Frame-Stände', match: (p: string) => p === '/wartung/eingabe' },
  { to: '/wartung/historie', label: 'Historie', match: (p: string) => p === '/wartung/historie' },
  { to: '/wartung/einstellungen', label: 'Einstellungen', match: (p: string) => p === '/wartung/einstellungen' },
];

/**
 * Rahmen des Moduls Bahnwartung.
 *
 * Liegt innerhalb des Plattform-Rahmens: Seitenleiste und Kopfzeile kommen von
 * dort, hier steht nur, was zum Modul selbst gehört — seine eigene Navigation
 * und das Melden eines Defekts.
 *
 * Der Inhalt läuft auf hellem Grund. Hier wird lange gelesen und es werden viele
 * Zahlen verglichen; dafür trägt Dunkel zu wenig. Damit das kein Bruch ist,
 * bleibt der Rahmen dunkel und der helle Bereich sitzt als abgesetzte Fläche
 * darin — die aktive Reiterlasche geht in sie über, wie der Reiter einer Mappe.
 */
export function MaintenanceShell() {
  const { session, signOut } = useAuth();
  const { error } = useData();
  const { pathname } = useLocation();
  const [issueOpen, setIssueOpen] = useState(false);

  // Solange dieses Modul offen ist, laeuft die Seite eine Stufe heller — sonst
  // steht die weisse Arbeitsflaeche wie ein Loch im dunklen Bild. Beim
  // Verlassen faellt der Rahmen wieder auf den ruhigen Grundton zurueck.
  useEffect(() => {
    document.body.classList.add('db-hell');
    return () => document.body.classList.remove('db-hell');
  }, []);

  // Wer das Modul nicht freigeschaltet hat, sieht hier nichts — auch wenn er
  // die Adresse direkt aufruft.
  if (session && !session.canRead) {
    return <NoAccessPage name={session.displayName} onSignOut={() => void signOut()} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <h1 className="mr-auto text-2xl font-extrabold">Bahnwartung</h1>
        <button onClick={() => setIssueOpen(true)} className="db-btn-ghost px-3 py-2 text-sm">
          Defekt melden
        </button>
      </div>

      <nav className="db-scroll-x mt-5 flex gap-1 overflow-x-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
              item.match(pathname)
                ? 'bg-lw-bg text-lw-text'
                : 'text-db-text2 hover:bg-db-card2 hover:text-db-text'
            }`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="lw-sheet rounded-tl-none space-y-5">
        {error && (
          <div className="lw-card border-lw-bad bg-lw-bad/10 px-4 py-3 text-lw-bad">
            <strong className="font-semibold">Fehler beim Laden:</strong> {error}
          </div>
        )}

        <Outlet />
      </div>

      {issueOpen && <IssueDialog onClose={() => setIssueOpen(false)} />}
    </div>
  );
}
