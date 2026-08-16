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

/** Eine Frame-Ablesung, inklusive der ersetzten — das Protokoll bleibt vollständig. */
export interface ReadingRow {
  id: string;
  laneId: string;
  laneNumber: number;
  readingDate: ISODate;
  rawValue: number;
  cumulativeFrames: number;
  source: 'weekly' | 'correction' | 'initial';
  /** Gesetzt, wenn diese Ablesung durch eine spätere ersetzt wurde. */
  supersededById: string | null;
  correctsReadingId: string | null;
  correctionReason: string | null;
  recordedAt: string | null;
  recordedByName: string | null;
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
  readings: ReadingRow[];
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
export type Department = 'mechanik' | 'counter' | 'service';

export const DEPARTMENT_LABEL: Record<Department, string> = {
  mechanik: 'Mechanik',
  counter: 'Counter',
  service: 'Service',
};

export interface SessionInfo {
  userId: string;
  email: string | null;
  /** Anmeldename der Mitarbeiter; Administratoren melden sich per E-Mail an. */
  username: string | null;
  /** Klarname — wird überall angezeigt. */
  displayName: string;
  department: Department | null;
  isLead: boolean;
  isAdmin: boolean;
  canRead: boolean;
  canWrite: boolean;
}

/** Ein Benutzerkonto, wie es die Verwaltung zeigt. */
export interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
  department: Department | null;
  isLead: boolean;
  isAdmin: boolean;
  active: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  department: Department | null;
  isLead: boolean;
}

/**
 * Ein Werkzeug der internen Plattform. Welche Module ein Mitarbeiter sieht,
 * ergibt sich aus seiner Rolle und aus individuellen Freigaben — beides wird
 * über die Datenbankfunktionen ermittelt, nicht im Frontend entschieden.
 */
export interface ModuleInfo {
  key: string;
  nameDe: string;
  /** Route innerhalb der Plattform, z. B. '/wartung'. */
  path: string;
  /** Gesetzt, wenn das Modul ausserhalb der Plattform liegt. */
  externalUrl: string | null;
  icon: string | null;
  sortOrder: number;
  canRead: boolean;
  canWrite: boolean;
}

/** Tabellenname -> Zeilen, wie sie in der Datenbank stehen. */
export type BackupBundle = Record<string, unknown[]>;

export interface Repository {
  readonly kind: 'demo' | 'supabase';
  /** false im Demo-Betrieb: dort gibt es keine Anmeldung. */
  readonly requiresLogin: boolean;

  getSession(): Promise<SessionInfo | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Anzeigename des eigenen Kontos ändern — er steht in jedem Wartungseintrag. */
  updateDisplayName(name: string): Promise<void>;
  /** Module, die dieser Mitarbeiter aufrufen darf. */
  listModules(): Promise<ModuleInfo[]>;
  /** Vollständige Sicherung aller Tabellen — Tabellenname -> Zeilen. */
  exportBackup(): Promise<BackupBundle>;

  // --- Benutzerverwaltung ---
  listUsers(): Promise<UserRow[]>;
  createUser(input: CreateUserInput): Promise<void>;
  updateUser(
    id: string,
    patch: Partial<Pick<UserRow, 'displayName' | 'department' | 'isLead' | 'isAdmin' | 'active'>>,
  ): Promise<void>;
  /** Passwort eines anderen Kontos setzen — für vergessene Zugänge. */
  setUserPassword(id: string, password: string): Promise<void>;
  /**
   * Eine abgeschlossene Wartung stornieren. Der Eintrag bleibt in der Historie
   * sichtbar und durchgestrichen — gelöscht wird nichts. Mitkaskadierte Einträge
   * werden mit storniert, sonst bliebe ein falscher Anker stehen.
   */
  voidMaintenanceRecord(recordId: string, reason: string): Promise<void>;
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
