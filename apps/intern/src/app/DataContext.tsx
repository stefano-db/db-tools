import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  compareLanes,
  computeLaneOverview,
  summarize,
  type DashboardSummary,
  type ISODate,
  type LaneOverview,
} from '../core';
import { repository, type Repository, type Snapshot } from '../data';
import { useAuth } from './AuthContext';

export function todayISO(): ISODate {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

interface DataContextValue {
  repo: Repository;
  snapshot: Snapshot | null;
  overviews: LaneOverview[];
  summary: DashboardSummary;
  today: ISODate;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Name des angemeldeten Mitarbeiters — wird bei jeder Wartung mitgeschrieben. */
  employee: string;
  /** Darf dieser Benutzer Daten ändern, oder nur lesen? */
  canWrite: boolean;
  isAdmin: boolean;
}

const DataContext = createContext<DataContextValue | null>(null);

const EMPTY_SUMMARY: DashboardSummary = {
  total: 0, ok: 0, dueSoon: 0, due: 0, unclear: 0, outOfService: 0,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const reload = useCallback(async () => {
    // Ohne Sitzung wird gar nicht erst geladen — sonst liefert die Datenbank
    // wegen RLS nur leere Listen, und das sähe aus wie „alles in Ordnung".
    if (!session) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSnapshot(await repository.load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Die Bewertung läuft ausschließlich über /core und wird bei jeder Änderung
  // vollständig neu berechnet — es gibt keinen abgeleiteten Zustand in der DB,
  // der veralten könnte.
  const overviews = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.lanes
      .map((lane) =>
        computeLaneOverview(
          lane,
          snapshot.types,
          snapshot.anchors[lane.laneId] ?? [],
          snapshot.settings,
          today,
        ),
      )
      .sort(compareLanes);
  }, [snapshot, today]);

  const summary = useMemo(() => (overviews.length ? summarize(overviews) : EMPTY_SUMMARY), [overviews]);

  return (
    <DataContext.Provider
      value={{
        repo: repository,
        snapshot,
        overviews,
        summary,
        today,
        loading,
        error,
        reload,
        employee: session?.displayName ?? 'Unbekannt',
        canWrite: session?.canWrite ?? false,
        isAdmin: session?.role === 'admin',
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData muss innerhalb von DataProvider verwendet werden.');
  return ctx;
}
