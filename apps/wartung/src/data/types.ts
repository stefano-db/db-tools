import type {
  CounterEpoch,
  ISODate,
  LaneReadingState,
  MaintenanceAnchor,
  MaintenanceSettings,
  MaintenanceTask,
  MaintenanceType,
  TaskResult,
} from '../core';

/**
 * Schnittstelle zwischen Oberfläche und Datenhaltung.
 *
 * Es gibt zwei Umsetzungen: eine lokale Demo-Variante (ohne Server, für
 * Einrichtung und Schulung) und die Supabase-Variante. Die Oberfläche kennt
 * nur dieses Interface und muss beim Wechsel nicht angefasst werden.
 */

export interface LanePair {
  id: string;
  label: string;
  sortOrder: number;
}

export interface LaneRow extends LaneReadingState {
  pairId: string | null;
  /** Zuletzt abgelesener Rohwert — das, was der Mechaniker an der Maschine sieht. */
  lastRawValue: number | null;
}

export interface RecordRow {
  id: string;
  laneId: string;
  laneNumber: number;
  maintenanceTypeId: string;
  typeCode: string;
  performedOn: ISODate;
  cumulativeFrames: number;
  employeeName: string;
  notes: string | null;
  source: 'manual' | 'cascade' | 'initial_import';
  derivedFromRecordId: string | null;
  hasDeviation: boolean;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface RecordTaskRow {
  recordId: string;
  taskId: string;
  result: TaskResult;
  taskTitleSnapshot: string;
}

export interface IssueRow {
  id: string;
  laneId: string | null;
  laneNumber: number | null;
  title: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved';
  reportedBy: string;
  reportedAt: string;
  resolutionNote: string | null;
}

export interface Snapshot {
  settings: MaintenanceSettings;
  types: MaintenanceType[];
  tasks: MaintenanceTask[];
  pairs: LanePair[];
  lanes: LaneRow[];
  /** laneId -> Anker je Wartungstyp */
  anchors: Record<string, MaintenanceAnchor[]>;
  /** laneId -> aktuell gültige Zähler-Epoche */
  currentEpoch: Record<string, CounterEpoch>;
  records: RecordRow[];
  recordTasks: RecordTaskRow[];
  issues: IssueRow[];
}

export interface SaveReadingsInput {
  readingDate: ISODate;
  entries: { laneId: string; rawValue: number }[];
}

export interface ResetCounterInput {
  laneId: string;
  effectiveFrom: ISODate;
  newCounterValue: number;
  reason: CounterEpoch['reason'];
  note?: string;
}

export interface CompleteMaintenanceInput {
  laneId: string;
  performedOn: ISODate;
  employeeName: string;
  notes?: string;
  /** Erster Block ist die eigentliche Wartung, weitere sind kaskadiert. */
  blocks: {
    maintenanceTypeId: string;
    tasks: { taskId: string; result: TaskResult }[];
  }[];
}

/**
 * Angemeldeter Benutzer samt seiner Rechte am Modul 'maintenance'.
 * canRead/canWrite kommen aus den Datenbankfunktionen has_module() und
 * can_write_module() — es gibt also keine zweite Rechtelogik im Frontend,
 * die von der RLS abweichen könnte.
 */
export interface SessionInfo {
  userId: string;
  email: string | null;
  displayName: string;
  role: 'mechanic' | 'counter' | 'admin';
  canRead: boolean;
  canWrite: boolean;
}

export interface Repository {
  readonly kind: 'demo' | 'supabase';
  /** false im Demo-Betrieb: dort gibt es keine Anmeldung. */
  readonly requiresLogin: boolean;

  getSession(): Promise<SessionInfo | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Meldet Anmeldung, Abmeldung und Ablauf der Sitzung. Gibt eine Abmeldefunktion zurück. */
  onAuthChange(callback: () => void): () => void;

  load(): Promise<Snapshot>;
  saveReadings(input: SaveReadingsInput): Promise<void>;
  resetCounter(input: ResetCounterInput): Promise<void>;
  completeMaintenance(input: CompleteMaintenanceInput): Promise<void>;
  createIssue(input: {
    laneId: string | null;
    title: string;
    description?: string;
    severity: IssueRow['severity'];
    reportedBy: string;
  }): Promise<void>;
  updateIssueStatus(id: string, status: IssueRow['status'], resolutionNote?: string): Promise<void>;
  correctReading(input: {
    laneId: string;
    readingDate: ISODate;
    newRawValue: number;
    reason: string;
  }): Promise<void>;
  updateSettings(settings: Partial<MaintenanceSettings>): Promise<void>;
}

export type { MaintenanceSettings, MaintenanceTask, MaintenanceType };
