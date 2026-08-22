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
export type Department = 'mechanik' | 'counter' | 'service' | 'kueche';

export const DEPARTMENT_LABEL: Record<Department, string> = {
  mechanik: 'Mechanik',
  counter: 'Counter',
  service: 'Service',
  kueche: 'Küche',
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
  /** Echte Adresse, falls hinterlegt. Technische Adressen erscheinen hier nicht. */
  email: string | null;
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
  /** Optional. Mit Adresse kann sich die Person selbst ein neues Passwort schicken. */
  email?: string;
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

/** Eine Druckvorlage im Modul Dokumente. */
export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  printCount: number;
  lastPrintedAt: string | null;
  createdAt: string;
  /** Zeitlich begrenzte Adresse für die Vorschau. Null bei Office-Dateien. */
  previewUrl: string | null;
}

/** Ein Name im Dienstplan. Nicht jeder hat ein Konto, nicht jedes Konto steht im Plan. */
export interface RosterEmployeeRow {
  id: string;
  name: string;
  groupNo: number;
  /** Sollstunden je Woche; 0 heisst ohne Vorgabe. */
  targetHours: number;
  /** Verbundenes Konto, falls zugeordnet. */
  profileId: string | null;
}

/** Ein Tag im Dienstplan, wie ihn der Editor speichert. */
export interface ShiftDay {
  /** 'dienst' | 'frei' | 'urlaub' | 'krank' | 'nein' */
  status: string;
  /** Beginn, z. B. "15:00". Leer, wenn kein Dienst. */
  b: string;
  /** Ende. */
  e: string;
  /** Dauer, z. B. "7:00". */
  std: string;
}

/** Ein Eintrag im Wissensspeicher des Chats. */
export interface WissenEintrag {
  id: string;
  titel: string;
  inhalt: string;
  bereich: Department | null;
  schlagworte: string[];
  aktiv: boolean;
}

/** Ein Treffer der Wissenssuche — Grundlage einer Antwort. */
export interface WissenTreffer {
  id: string;
  titel: string;
  inhalt: string;
  bereich: Department | null;
  rang: number;
}

/** Ein Freigabe-Link auf den Dienstplan. */
export interface ShareLink {
  token: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

/** Was ein Freigabe-Link ohne Anmeldung ausliefert: genau die laufende Woche. */
export interface PublicRoster {
  weekStart: ISODate;
  updatedAt: string | null;
  employees: { id: string; name: string; groupNo: number }[];
  data: Record<string, { d: ShiftDay[] }>;
}

/**
 * Eine ganze Woche, wie sie gespeichert liegt: Name im Plan -> seine Tage.
 *
 * Bewusst unbestimmt getypt. Was dort steht, ist JSON aus der Datenbank und
 * kann aus einer aelteren Fassung des Editors stammen; geprueft wird es beim
 * Lesen, nicht durch eine Zusage im Typ. `tot` ist die Wochensumme, die der
 * bisherige Editor mitschreibt und erwartet.
 */
export type RosterWeekData = Record<string, { d: unknown[]; tot?: string }>;

/** Die eigene Woche — Grundlage für „nächste Schicht" und den Wochenstreifen. */
export interface MyWeek {
  /** Der Name im Plan — noetig, um bei einer Aenderung zu erkennen, ob sie mich betrifft. */
  employeeId: string;
  employeeName: string;
  weekStart: ISODate;
  days: ShiftDay[];
  updatedAt: string | null;
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
  /** Anmeldeadresse setzen; leer heißt zurück auf den Benutzernamen. */
  setUserEmail(id: string, email: string): Promise<void>;
  /** Link zum Zurücksetzen an die hinterlegte Adresse schicken. */
  sendPasswordReset(email: string): Promise<void>;

  // --- Dokumente ---
  listDocuments(): Promise<DocumentRow[]>;
  uploadDocument(input: {
    file: File;
    title: string;
    description?: string;
    category?: string;
  }): Promise<void>;
  /** Zeitlich begrenzte Adresse zum Ansehen, Drucken oder Herunterladen. */
  documentUrl(id: string, forDownload?: boolean): Promise<string>;
  markDocumentPrinted(id: string): Promise<void>;
  /**
   * Alle Ablesungen, Wartungen und Zähler-Epochen einer Bahn entfernen.
   * Ausnahme für Probeeingaben aus der Einrichtungsphase; nur für Admins.
   */
  resetLane(laneId: string): Promise<{ readings: number; records: number; epochs: number }>;

  // --- Dienstplan ---
  listRosterEmployees(): Promise<RosterEmployeeRow[]>;
  /**
   * Einen Namen im Plan anlegen oder aendern. Ohne id wird angelegt.
   *
   * `targetHours` landet in der Spalte `target_days` — die heisst so aus der
   * ersten Fassung, gefuehrt werden dort aber Stunden je Woche. Umbenennen
   * hiesse, den bestehenden Editor mit umzustellen; der Kommentar ist billiger
   * als der Fehler, den ein halber Umbau kostet.
   */
  rosterEmployeeSpeichern(eintrag: {
    id?: string;
    name: string;
    groupNo: number;
    targetHours: number;
  }): Promise<void>;
  /**
   * Einen Namen aus dem Plan nehmen.
   *
   * Nicht loeschen, sondern stilllegen: an der id haengen die Schichten
   * vergangener Wochen. Ein geloeschter Datensatz risse Loecher in jede
   * Historie, in der die Person vorkommt.
   */
  rosterEmployeeEntfernen(id: string): Promise<void>;
  /** Namen im Plan mit einem Konto verbinden; null löst die Verbindung. */
  linkRosterEmployee(rosterEmployeeId: string, profileId: string | null): Promise<void>;
  /** Die eigene laufende Woche. null, wenn das Konto keinem Namen zugeordnet ist. */
  myWeek(): Promise<MyWeek | null>;
  /**
   * Aenderungen an einer Woche melden, solange die Seite offen ist.
   *
   * Gibt die Abmeldefunktion zurueck. Uebergeben wird der neue Stand der
   * ganzen Woche — wer davon betroffen ist, entscheidet die Oberflaeche, denn
   * nur sie weiss, wessen Plan gerade angezeigt wird.
   */
  watchRosterWeek(weekStart: ISODate, beiAenderung: (data: RosterWeekData) => void): () => void;
  /**
   * Eine ganze Woche lesen — samt Fassungsnummer.
   *
   * Ohne die Fassung liesse sich nicht speichern, ohne fremde Arbeit zu
   * ueberschreiben: sie sagt, auf welchem Stand man aufgesetzt hat.
   */
  rosterWeek(weekStart: ISODate): Promise<{ data: RosterWeekData; version: number }>;
  /**
   * Eine Woche speichern.
   *
   * Gibt zurueck, ob es geklappt hat. Bei „veraltet" kommt der fremde Stand
   * mit, damit die Oberflaeche ihn zeigen kann, statt ihn zu ueberschreiben.
   */
  rosterWeekSpeichern(
    weekStart: ISODate,
    data: RosterWeekData,
    version: number,
  ): Promise<
    | { ok: true; version: number }
    | { ok: false; grund: 'veraltet'; version: number; data: RosterWeekData }
    | { ok: false; grund: 'keine_berechtigung' }
  >;
  /**
   * Antwort auf eine Frage im Chat.
   *
   * Heute kommt sie unmittelbar aus dem Wissensspeicher. Sobald ein
   * Sprachmodell angeschlossen ist, bekommt es genau diese Treffer als
   * Grundlage — die Schnittstelle bleibt dieselbe, nur der Weg dahinter
   * aendert sich.
   */
  chatAntwort(frage: string): Promise<WissenTreffer[]>;
  /** Eine gestellte Frage festhalten — auch und gerade die unbeantwortete. */
  chatFrageMerken(frage: string, treffer: number): Promise<string | null>;
  /** Rueckmeldung des Fragenden zu einer Antwort. */
  chatRueckmeldung(frageId: string, geholfen: boolean): Promise<void>;
  /** Wissensspeicher pflegen — Leitungen und Administratoren. */
  wissenListe(): Promise<WissenEintrag[]>;
  wissenSpeichern(eintrag: Omit<WissenEintrag, 'id'> & { id?: string }): Promise<void>;
  wissenLoeschen(id: string): Promise<void>;
  /** Fragen ohne Treffer — daraus waechst der Speicher. */
  offeneFragen(): Promise<{ id: string; frage: string; wann: string }[]>;

  /** Freigabe-Links verwalten — nur Leitungen und Administratoren. */
  listShareLinks(): Promise<ShareLink[]>;
  createShareLink(label: string): Promise<ShareLink>;
  revokeShareLink(token: string): Promise<void>;
  /**
   * Den Plan zu einem Freigabe-Link holen — ohne Anmeldung. null, wenn der
   * Link unbekannt oder widerrufen ist; die Datenbank verraet nicht, welches
   * von beidem.
   */
  publicRoster(token: string): Promise<PublicRoster | null>;
  archiveDocument(id: string): Promise<void>;
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
