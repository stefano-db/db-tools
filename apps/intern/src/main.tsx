import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom';
import './index.css';
import { MaintenanceShell, RequireAuth } from './app/AppShell';
import { AuthProvider } from './app/AuthContext';
import { DataProvider } from './app/DataContext';
import { PortalHome } from './app/PortalHome';
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
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { index: true, element: <PortalHome /> },
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
