import {
  toCumulative,
  weeklyRate,
  type CounterEpoch,
  type MaintenanceAnchor,
  type MaintenanceSettings,
} from '../../core';
import type {
  CompleteMaintenanceInput,
  IssueRow,
  LaneRow,
  RecordRow,
  Repository,
  ResetCounterInput,
  SaveReadingsInput,
  SessionInfo,
  Snapshot,
  ModuleInfo,
  BackupBundle,
  UserRow,
  CreateUserInput,
} from '../types';
import { buildDemoDb, type DemoDb } from './seed';

const STORAGE_KEY = 'bowling-wartung.demo.v1';

/**
 * Lokale Umsetzung der Datenschicht — speichert im Browser, ohne Server.
 *
 * Sie bildet dieselben Ableitungen ab wie die SQL-Views: aktueller Stand aus der
 * jüngsten gültigen Ablesung, Anker aus dem jüngsten nicht stornierten
 * Wartungseintrag, Wochenrate aus dem gleitenden Mittel. Damit verhält sich die
 * Oberfläche identisch, egal welche Umsetzung aktiv ist.
 */
export class DemoRepository implements Repository {
  readonly kind = 'demo' as const;
  readonly requiresLogin = false;
  private db: DemoDb;

  constructor() {
    this.db = this.read();
  }

  // --- Anmeldung -----------------------------------------------------------
  // Im Demo-Betrieb gibt es keine echte Anmeldung: es wird eine feste Sitzung
  // mit allen Rechten vorgetäuscht, damit die Oberfläche vollständig bedienbar
  // bleibt, ohne dass eine Datenbank dahintersteht.

  async getSession(): Promise<SessionInfo> {
    return {
      userId: 'demo',
      email: null,
      username: 'demo',
      displayName: localStorage.getItem('bw.employee') || 'Marco',
      department: 'mechanik',
      isLead: true,
      isAdmin: true,
      canRead: true,
      canWrite: true,
    };
  }

  async signIn(): Promise<void> {
    /* keine Anmeldung nötig */
  }

  async signOut(): Promise<void> {
    /* keine Anmeldung nötig */
  }

  async updateDisplayName(name: string): Promise<void> {
    localStorage.setItem('bw.employee', name);
  }

  async listModules(): Promise<ModuleInfo[]> {
    return [
      {
        key: 'maintenance',
        nameDe: 'Bahnwartung',
        path: '/wartung',
        externalUrl: null,
        icon: 'wrench',
        sortOrder: 10,
        canRead: true,
        canWrite: true,
      },
    ];
  }

  onAuthChange(): () => void {
    return () => {};
  }

  async listUsers(): Promise<UserRow[]> {
    return [
      {
        id: 'demo',
        username: 'demo',
        email: null,
        displayName: localStorage.getItem('bw.employee') || 'Marco',
        department: 'mechanik',
        isLead: true,
        isAdmin: true,
        active: true,
        createdAt: new Date(0).toISOString(),
      },
    ];
  }

  async createUser(_input: CreateUserInput): Promise<void> {
    throw new Error('Im Demo-Betrieb können keine Konten angelegt werden.');
  }

  async updateUser(): Promise<void> {
    throw new Error('Im Demo-Betrieb können keine Konten geändert werden.');
  }

  async setUserPassword(): Promise<void> {
    throw new Error('Im Demo-Betrieb gibt es keine Passwörter.');
  }

  async listDocuments() {
    return [];
  }

  async uploadDocument(): Promise<void> {
    throw new Error('Im Demo-Betrieb gibt es keine Dateiablage.');
  }

  async documentUrl(): Promise<string> {
    throw new Error('Im Demo-Betrieb gibt es keine Dateiablage.');
  }

  async markDocumentPrinted(): Promise<void> {}

  async resetLane(): Promise<{ readings: number; records: number; epochs: number }> {
    throw new Error('Im Demo-Betrieb nicht möglich.');
  }

  async listRosterEmployees() {
    return [];
  }

  async rosterEmployeeSpeichern() {}

  async rosterEmployeeEntfernen() {}

  async linkRosterEmployee(): Promise<void> {
    throw new Error('Im Demo-Betrieb gibt es keinen Dienstplan.');
  }

  async chatAntwort() {
    return [];
  }

  async chatFrageMerken() {
    return null;
  }

  async chatRueckmeldung() {}

  async wissenListe() {
    return [];
  }

  async wissenSpeichern() {}

  async wissenLoeschen() {}

  async offeneFragen() {
    return [];
  }

  async listShareLinks() {
    return [];
  }

  async createShareLink(label: string) {
    return {
      token: 'demo',
      label,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      lastUsedAt: null,
      useCount: 0,
    };
  }

  async revokeShareLink() {}

  async publicRoster() {
    return null;
  }

  watchRosterWeek() {
    return () => {};
  }

  async rosterWeek() {
    return {};
  }

  async myWeek() {
    return null;
  }

  async archiveDocument(): Promise<void> {
    throw new Error('Im Demo-Betrieb gibt es keine Dateiablage.');
  }

  async setUserEmail(): Promise<void> {
    throw new Error('Im Demo-Betrieb gibt es keine Konten.');
  }

  async sendPasswordReset(): Promise<void> {
    throw new Error('Im Demo-Betrieb gibt es keine E-Mail.');
  }

  async exportBackup(): Promise<BackupBundle> {
    return {
      lane_pairs: this.db.pairs,
      lanes: this.db.lanes,
      lane_counter_epochs: this.db.epochs,
      frame_readings: this.db.readings,
      maintenance_types: this.db.types,
      maintenance_tasks: this.db.tasks,
      maintenance_records: this.db.records,
      maintenance_record_tasks: this.db.recordTasks,
      lane_issues: this.db.issues,
      maintenance_settings: [this.db.settings],
    };
  }

  async voidMaintenanceRecord(recordId: string, reason: string): Promise<void> {
    const stamp = new Date().toISOString();
    for (const r of this.db.records) {
      if (r.id === recordId || r.derivedFromRecordId === recordId) {
        if (r.voidedAt === null) {
          r.voidedAt = stamp;
          r.voidReason = reason;
        }
      }
    }
    this.write();
  }

  private read(): DemoDb {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDb;
        if (parsed.version === 1) return parsed;
      }
    } catch {
      // beschädigter Speicher -> neu aufbauen
    }
    const fresh = buildDemoDb();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  private write() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.db = this.read();
  }

  private activeReadings(laneId: string) {
    return this.db.readings
      .filter((r) => r.laneId === laneId && r.supersededById === null)
      .sort((a, b) => (a.readingDate < b.readingDate ? -1 : 1));
  }

  private currentEpochOf(laneId: string): CounterEpoch {
    const list = this.db.epochs
      .filter((e) => e.laneId === laneId)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    return list[list.length - 1];
  }

  async load(): Promise<Snapshot> {
    const settings: MaintenanceSettings = this.db.settings;
    const laneNumberOf = new Map(this.db.lanes.map((l) => [l.id, l.laneNumber]));

    const lanes: LaneRow[] = this.db.lanes.map((l) => {
      const readings = this.activeReadings(l.id);
      const last = readings[readings.length - 1];
      return {
        laneId: l.id,
        laneNumber: l.laneNumber,
        status: l.status,
        pairId: l.pairId,
        currentFrames: last ? last.cumulativeFrames : null,
        lastRawValue: last ? last.rawValue : null,
        lastReadingDate: last ? last.readingDate : null,
        framesPerWeek: weeklyRate(readings, 8),
      };
    });

    const anchors: Record<string, MaintenanceAnchor[]> = {};
    const currentEpoch: Record<string, CounterEpoch> = {};
    for (const lane of this.db.lanes) {
      currentEpoch[lane.id] = this.currentEpochOf(lane.id);
      anchors[lane.id] = this.db.types.map((type) => {
        const latest = this.db.records
          .filter(
            (r) => r.laneId === lane.id && r.maintenanceTypeId === type.id && r.voidedAt === null,
          )
          .sort((a, b) => b.cumulativeFrames - a.cumulativeFrames)[0];
        return {
          maintenanceTypeId: type.id,
          anchorFrames: latest ? latest.cumulativeFrames : null,
          anchorDate: latest ? latest.performedOn : null,
        };
      });
    }

    const typeCodeOf = new Map(this.db.types.map((t) => [t.id, t.code]));
    const records: RecordRow[] = this.db.records
      .map((r) => ({
        ...r,
        laneNumber: laneNumberOf.get(r.laneId) ?? 0,
        typeCode: typeCodeOf.get(r.maintenanceTypeId) ?? '',
      }))
      .sort((a, b) => (a.performedOn < b.performedOn ? 1 : -1));

    const issues: IssueRow[] = this.db.issues.map((i) => ({
      ...i,
      laneNumber: i.laneId ? (laneNumberOf.get(i.laneId) ?? null) : null,
    }));

    return {
      settings,
      types: this.db.types,
      tasks: this.db.tasks,
      pairs: this.db.pairs,
      lanes,
      anchors,
      currentEpoch,
      records,
      recordTasks: this.db.recordTasks,
      readings: [...this.db.readings]
        .sort((a, b) => (a.readingDate < b.readingDate ? 1 : -1))
        .map((r) => ({
          id: r.id,
          laneId: r.laneId,
          laneNumber: laneNumberOf.get(r.laneId) ?? 0,
          readingDate: r.readingDate,
          rawValue: r.rawValue,
          cumulativeFrames: r.cumulativeFrames,
          source: 'weekly' as const,
          supersededById: r.supersededById,
          correctsReadingId: null,
          correctionReason: r.correctionReason,
          recordedAt: null,
          recordedByName: null,
        })),
      issues,
    };
  }

  async saveReadings(input: SaveReadingsInput): Promise<void> {
    for (const entry of input.entries) {
      const epoch = this.currentEpochOf(entry.laneId);
      const cumulative = toCumulative(entry.rawValue, epoch);

      // Eine bereits erfasste Ablesung desselben Tages wird ersetzt, nicht doppelt angelegt.
      const existing = this.db.readings.find(
        (r) =>
          r.laneId === entry.laneId &&
          r.readingDate === input.readingDate &&
          r.supersededById === null,
      );
      const id = `${entry.laneId}-${input.readingDate}-${this.db.readings.length}`;
      if (existing) existing.supersededById = id;

      this.db.readings.push({
        id,
        laneId: entry.laneId,
        epochId: epoch.id,
        readingDate: input.readingDate,
        rawValue: entry.rawValue,
        cumulativeFrames: cumulative,
        supersededById: null,
        correctionReason: existing ? 'Erneute Eingabe am selben Tag' : null,
      });
    }
    this.write();
  }

  async resetCounter(input: ResetCounterInput): Promise<void> {
    const readings = this.activeReadings(input.laneId);
    const last = readings[readings.length - 1];
    this.db.epochs.push({
      id: `${input.laneId}-e${this.db.epochs.length + 1}`,
      laneId: input.laneId,
      effectiveFrom: input.effectiveFrom,
      counterStart: input.newCounterValue,
      cumulativeOffset: last ? last.cumulativeFrames : 0,
      reason: input.reason,
    });
    this.write();
  }

  async completeMaintenance(input: CompleteMaintenanceInput): Promise<void> {
    const readings = this.activeReadings(input.laneId);
    const last = readings[readings.length - 1];
    if (!last) throw new Error('Für diese Bahn liegt noch keine Ablesung vor.');

    const taskById = new Map(this.db.tasks.map((t) => [t.id, t]));
    let primaryId: string | null = null;

    input.blocks.forEach((block, index) => {
      const id = `rec-${Date.now()}-${index}`;
      if (index === 0) primaryId = id;
      const hasDeviation = block.tasks.some((t) => t.result === 'open');

      this.db.records.push({
        id,
        laneId: input.laneId,
        maintenanceTypeId: block.maintenanceTypeId,
        performedOn: input.performedOn,
        cumulativeFrames: last.cumulativeFrames,
        employeeName: input.employeeName,
        notes: input.notes ?? null,
        source: index === 0 ? 'manual' : 'cascade',
        derivedFromRecordId: index === 0 ? null : primaryId,
        hasDeviation,
        voidedAt: null,
        voidReason: null,
      });

      for (const t of block.tasks) {
        this.db.recordTasks.push({
          recordId: id,
          taskId: t.taskId,
          result: t.result,
          taskTitleSnapshot: taskById.get(t.taskId)?.titleDe ?? t.taskId,
        });
      }
    });

    this.write();
  }

  async createIssue(input: {
    laneId: string | null;
    title: string;
    description?: string;
    severity: IssueRow['severity'];
    reportedBy: string;
  }): Promise<void> {
    this.db.issues.unshift({
      id: `i-${Date.now()}`,
      laneId: input.laneId,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      status: 'open',
      reportedBy: input.reportedBy,
      reportedAt: new Date().toISOString(),
      resolutionNote: null,
    });
    this.write();
  }

  async updateIssueStatus(id: string, status: IssueRow['status'], resolutionNote?: string): Promise<void> {
    const issue = this.db.issues.find((i) => i.id === id);
    if (!issue) return;
    issue.status = status;
    if (resolutionNote !== undefined) issue.resolutionNote = resolutionNote;
    this.write();
  }

  async correctReading(input: {
    laneId: string;
    readingDate: string;
    newRawValue: number;
    reason: string;
  }): Promise<void> {
    const old = this.db.readings.find(
      (r) => r.laneId === input.laneId && r.readingDate === input.readingDate && r.supersededById === null,
    );
    if (!old) throw new Error('Zu diesem Datum existiert keine Ablesung.');

    const epoch = this.db.epochs.find((e) => e.id === old.epochId)!;
    const id = `${input.laneId}-${input.readingDate}-corr-${this.db.readings.length}`;
    old.supersededById = id;

    this.db.readings.push({
      id,
      laneId: input.laneId,
      epochId: epoch.id,
      readingDate: input.readingDate,
      rawValue: input.newRawValue,
      cumulativeFrames: toCumulative(input.newRawValue, epoch),
      supersededById: null,
      correctionReason: input.reason,
    });
    this.write();
  }

  async updateSettings(settings: Partial<MaintenanceSettings>): Promise<void> {
    this.db.settings = { ...this.db.settings, ...settings };
    this.write();
  }
}
