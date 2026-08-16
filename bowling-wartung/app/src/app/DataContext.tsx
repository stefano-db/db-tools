import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  compareLanes,
  computeLaneOverview,
  summarize,
  type DashboardSummary,
  type ISODate,
  type LaneOverview,
} from '../core';
import { createRepository, type Repository, type Snapshot } from '../data';

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
  /** Angemeldeter Mitarbeiter. Im Demo-Betrieb frei wählbar. */
  employee: string;
  setEmployee: (name: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const EMPTY_SUMMARY: DashboardSummary = {
  total: 0, ok: 0, dueSoon: 0, due: 0, unclear: 0, outOfService: 0,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => createRepository(), []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employee, setEmployee] = useState(() => localStorage.getItem('bw.employee') ?? 'Marco');
  const today = todayISO();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await repo.load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    localStorage.setItem('bw.employee', employee);
  }, [employee]);

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
      value={{ repo, snapshot, overviews, summary, today, loading, error, reload, employee, setEmployee }}
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
