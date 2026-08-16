import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom';
import './index.css';
import { AppShell } from './app/AppShell';
import { DataProvider } from './app/DataContext';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { FrameEntryPage } from './features/entry/FrameEntryPage';
import { HistoryPage } from './features/history/HistoryPage';
import { LanePage } from './features/lane/LanePage';
import { SettingsPage } from './features/settings/SettingsPage';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'eingabe', element: <FrameEntryPage /> },
        { path: 'bahn/:laneNumber', element: <LanePage /> },
        { path: 'historie', element: <HistoryPage /> },
        { path: 'einstellungen', element: <SettingsPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: '/wartung' },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  </StrictMode>,
);
