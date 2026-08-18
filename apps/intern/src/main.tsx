import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom';
import './index.css';
import { MaintenanceShell, RequireAuth } from './app/AppShell';
import { AuthProvider } from './app/AuthContext';
import { DataProvider } from './app/DataContext';
import { AppLayout } from './app/AppLayout';
import { OverviewPage } from './features/portal/OverviewPage';
import { ProfilePage } from './features/portal/ProfilePage';
import { UsersPage } from './features/admin/UsersPage';
import { DocumentsPage } from './features/documents/DocumentsPage';
import { RosterDraftPage } from './features/roster/RosterDraftPage';
import { PublicPlanPage } from './features/roster/PublicPlanPage';
import { ChatPage } from './features/chat/ChatPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { FrameEntryPage } from './features/entry/FrameEntryPage';
import { HistoryPage } from './features/history/HistoryPage';
import { LanePage } from './features/lane/LanePage';
import { SettingsPage } from './features/settings/SettingsPage';

/**
 * Aufbau der Plattform:
 *   /            Modulübersicht — zeigt nur die freigeschalteten Werkzeuge
 *   /wartung/*   Modul Bahnwartung
 *
 * Weitere Module kommen als eigener Zweig daneben; Anmeldung, Kopfzeile und
 * Rechteprüfung bleiben gemeinsam.
 */
const router = createBrowserRouter([
  // Der Freigabe-Link steht bewusst vor der Anmeldeschranke: er ist fuer die
  // Signal-Gruppe und die Fernseher gedacht und zeigt nur die laufende Woche.
  { path: '/plan/:token', element: <PublicPlanPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        // Neuer Rahmen: Seitenleiste, Kopfzeile, Reiterleiste am Handy.
        element: <AppLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'profil', element: <ProfilePage /> },
          // Der Chat steht allen offen — er haengt nicht an einem Bereich.
          { path: 'chat', element: <ChatPage /> },
          { path: 'verwaltung', element: <UsersPage /> },
          { path: 'dokumente', element: <DocumentsPage /> },
          // Entwurf des kommenden Dienstplan-Moduls — liest den echten Plan,
          // schreibt nichts. Noch nicht in der Navigation.
          { path: 'dienstplan-entwurf', element: <RosterDraftPage /> },
          {
            path: 'wartung',
            element: <MaintenanceShell />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'eingabe', element: <FrameEntryPage /> },
              { path: 'bahn/:laneNumber', element: <LanePage /> },
              { path: 'historie', element: <HistoryPage /> },
              { path: 'einstellungen', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DataProvider>
        <RouterProvider router={router} />
      </DataProvider>
    </AuthProvider>
  </StrictMode>,
);
