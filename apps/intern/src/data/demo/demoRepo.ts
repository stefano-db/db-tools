import {
  toCumulative,
  weeklyRate,
  type CounterEpoch,
  type MaintenanceAnchor,
  type MaintenanceSettings,
} from '../../core';
import type {
  Schliessfach,
  Department,
  CompleteMaintenanceInput,
  IssuePhoto,
  IssueRow,
  Wunsch,
  WunschStatus,
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
import { buildDemoDb, DEMO_DB_VERSION, type DemoDb } from './seed';

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

  /**
   * Fotos der Demo — nur im Arbeitsspeicher, nicht im lokalen Speicher.
   *
   * Ein Handyfoto als Text kodiert sprengt die fuenf Megabyte, die ein Browser
   * je Adresse hergibt, und riss den ganzen Demo-Bestand mit. Nach einem
   * Neuladen der Seite sind die Bilder deshalb weg und die Zaehlung steht
   * wieder bei null — sichtbar und ehrlich, statt einer Meldung, die Fotos
   * verspricht, die niemand mehr anzeigen kann.
   */
  private fotos = new Map<string, IssuePhoto[]>();

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

  // Drei Werkzeuge statt einem: mit nur einer Kachel laesst sich der
  // Startbildschirm nicht beurteilen, und genau dafuer ist die Vorfuehrung da.
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
      {
        key: 'urkunden',
        nameDe: 'Urkunden',
        path: '/urkunden',
        externalUrl: 'https://kgb-e61.pages.dev/',
        icon: 'trophy',
        sortOrder: 20,
        canRead: true,
        canWrite: false,
      },
      {
        key: 'schliessfaecher',
        nameDe: 'Schließfächer',
        path: '/schliessfaecher',
        externalUrl: null,
        icon: 'lock',
        sortOrder: 25,
        canRead: true,
        canWrite: true,
      },
      {
        key: 'dokumente',
        nameDe: 'Dokumente',
        path: '/dokumente',
        externalUrl: null,
        icon: 'folder',
        sortOrder: 30,
        canRead: true,
        canWrite: true,
      },
    ];
  }

  async modulZuordnung() {
    return {
      maintenance: ['mechanik'] as Department[],
      urkunden: ['counter'] as Department[],
      schliessfaecher: ['counter'] as Department[],
      dokumente: ['mechanik', 'counter', 'service', 'kueche'] as Department[],
    };
  }

  // Ein Bestand zum Ansehen. Erfundene Namen — echte gehoeren nicht in ein
  // Verzeichnis, und zum Beurteilen der Anzeige taugen sie genauso.
  private faecher: Schliessfach[] = [
    { id: 'f1', nummer: 1, groesse: 'S', zustand: 'vermietet', mieter: 'M. Berger', kontakt: null, mieteVon: '2026-01-01', mieteBis: '2026-12-31', bezahlt: true, ueberzahlung: false, notiz: null },
    { id: 'f2', nummer: 2, groesse: 'S', zustand: 'frei', mieter: null, kontakt: null, mieteVon: null, mieteBis: null, bezahlt: false, ueberzahlung: false, notiz: null },
    { id: 'f3', nummer: 3, groesse: 'S', zustand: 'reserviert', mieter: 'T. Kühn', kontakt: null, mieteVon: null, mieteBis: null, bezahlt: false, ueberzahlung: false, notiz: 'hält bis Freitag' },
    { id: 'f4', nummer: 4, groesse: 'S', zustand: 'vermietet', mieter: 'A. Roth', kontakt: '0171 …', mieteVon: '2025-09-01', mieteBis: '2026-09-10', bezahlt: true, ueberzahlung: false, notiz: null },
    { id: 'f5', nummer: 5, groesse: 'M', zustand: 'vermietet', mieter: 'L. Schuster', kontakt: null, mieteVon: '2025-06-01', mieteBis: '2026-06-30', bezahlt: true, ueberzahlung: false, notiz: null },
    { id: 'f6', nummer: 6, groesse: 'S', zustand: 'vermietet', mieter: 'P. Winkler', kontakt: null, mieteVon: '2026-01-01', mieteBis: '2026-12-31', bezahlt: false, ueberzahlung: false, notiz: null },
    { id: 'f7', nummer: 7, groesse: 'S', zustand: 'vermietet', mieter: 'Lager', kontakt: null, mieteVon: '2026-01-01', mieteBis: '2027-12-31', bezahlt: true, ueberzahlung: true, notiz: 'für zwei Jahre gezahlt' },
    { id: 'f8', nummer: 8, groesse: 'M', zustand: 'defekt', mieter: null, kontakt: null, mieteVon: null, mieteBis: null, bezahlt: false, ueberzahlung: false, notiz: 'Schloss klemmt' },
    { id: 'f9', nummer: 9, groesse: 'S', zustand: 'lager', mieter: 'Lager', kontakt: null, mieteVon: null, mieteBis: null, bezahlt: false, ueberzahlung: false, notiz: null },
    { id: 'f10', nummer: 10, groesse: 'S', zustand: 'frei', mieter: null, kontakt: null, mieteVon: null, mieteBis: null, bezahlt: false, ueberzahlung: false, notiz: null },
  ];

  async schliessfaecher() {
    return this.faecher.map((f) => ({ ...f }));
  }

  async schliessfachSpeichern(fach: Omit<Schliessfach, 'id'> & { id?: string }) {
    if (fach.id) {
      this.faecher = this.faecher.map((f) => (f.id === fach.id ? { ...f, ...fach, id: f.id } : f));
    } else {
      this.faecher = [...this.faecher, { ...fach, id: `f${Date.now()}` }];
    }
  }

  async schliessfaecherAnlegen(von: number, bis: number, groesse: string) {
    let neue = 0;
    for (let n = von; n <= bis; n++) {
      if (this.faecher.some((f) => f.nummer === n)) continue;
      this.faecher.push({
        id: `f${n}-${Date.now()}`, nummer: n, groesse, zustand: 'frei',
        mieter: null, kontakt: null, mieteVon: null, mieteBis: null,
        bezahlt: false, ueberzahlung: false, notiz: null,
      });
      neue++;
    }
    return neue;
  }

  async schliessfachLoeschen(id: string) {
    this.faecher = this.faecher.filter((f) => f.id !== id);
  }

  async schliessfachFrist() {
    return 42;
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

  private letzterSchluessel: string | null = null;

  async pushGeraetSpeichern(geraet: { vapid: string }) {
    this.letzterSchluessel = geraet.vapid;
  }

  async pushGeraetEntfernen() {}

  // In der Vorfuehrung gibt es keinen Versanddienst. Damit die Anzeige trotzdem
  // ruhig bleibt statt endlos nachzutragen, merkt sie sich schlicht, was zuletzt
  // hereingereicht wurde.
  async pushGeraetStand() {
    return { bekannt: true, schluessel: this.letzterSchluessel };
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

  watchRosterWeek(
    _woche: string,
    _beiAenderung: unknown,
    beiVerbindung?: (steht: boolean, meldung?: string) => void,
  ) {
    beiVerbindung?.(false, 'Demo-Betrieb ohne Datenbank');
    return () => {};
  }

  async rosterWeek() {
    return { data: {}, version: 0 };
  }

  async rosterWeekSpeichern() {
    return { ok: true as const, version: 1 };
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
        // Aeltere Staende werden nicht migriert, sondern neu aufgebaut: der
        // Demo-Bestand ist erfunden, ein Umbau waere Aufwand ohne Gegenwert.
        if (parsed.version === DEMO_DB_VERSION) return parsed;
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
      photoCount: this.fotos.get(i.id)?.length ?? 0,
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
    photos?: File[];
  }): Promise<void> {
    const id = `i-${Date.now()}`;
    this.db.issues.unshift({
      id,
      laneId: input.laneId,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      status: 'open',
      reportedBy: input.reportedBy,
      reportedAt: new Date().toISOString(),
      resolutionNote: null,
    });
    if (input.photos?.length) await this.addIssuePhotos(id, input.photos);
    this.write();
  }

  async addIssuePhotos(issueId: string, photos: File[]): Promise<void> {
    const bisher = this.fotos.get(issueId) ?? [];
    this.fotos.set(issueId, [
      ...bisher,
      ...photos.map((foto, i) => ({
        id: `f-${issueId}-${bisher.length + i}`,
        url: URL.createObjectURL(foto),
        mimeType: foto.type || null,
        uploadedAt: new Date().toISOString(),
      })),
    ]);
  }

  async issuePhotos(issueId: string): Promise<IssuePhoto[]> {
    return this.fotos.get(issueId) ?? [];
  }

  // --- Wünsche --------------------------------------------------------------
  // Im Demo-Betrieb im Arbeitsspeicher, wie die Fotos: der Bestand ist zum
  // Vorführen da, nicht zum Sammeln. Zwei Beispiele stehen von Anfang an drin,
  // damit die Liste nicht leer erklärt werden muss.
  private wunschListe: Wunsch[] = [
    {
      id: 'w1',
      titel: 'Urlaubsantrag direkt in der App',
      beschreibung: 'Statt Zettel am Schwarzen Brett — mit Übersicht, wer wann schon Urlaub hat.',
      bereich: 'service',
      status: 'geplant',
      eingereichtVon: 'demo-2',
      eingereichtVonName: 'Kira',
      eingereichtAm: new Date(Date.now() - 9 * 864e5).toISOString(),
      antwort: 'Guter Einfall. Kommt, sobald der Dienstplan steht.',
      beantwortetVonName: 'Leitung',
      beantwortetAm: new Date(Date.now() - 6 * 864e5).toISOString(),
      stimmen: 7,
      ichHabeGestimmt: false,
      meiner: false,
    },
    {
      id: 'w2',
      titel: 'Ersatzteile: Bestand und Nachbestellung',
      beschreibung: 'Wenn ein Teil verbaut wird, soll es abgezogen werden. Unter einer Grenze eine Meldung.',
      bereich: 'mechanik',
      status: 'offen',
      eingereichtVon: 'demo',
      eingereichtVonName: 'Marco',
      eingereichtAm: new Date(Date.now() - 2 * 864e5).toISOString(),
      antwort: null,
      beantwortetVonName: null,
      beantwortetAm: null,
      stimmen: 2,
      ichHabeGestimmt: true,
      meiner: true,
    },
  ];

  async wuensche(): Promise<Wunsch[]> {
    return [...this.wunschListe];
  }

  async wunschEinreichen(titel: string, beschreibung?: string): Promise<void> {
    this.wunschListe.unshift({
      id: `w-${Date.now()}`,
      titel: titel.trim(),
      beschreibung: beschreibung?.trim() || null,
      bereich: 'mechanik',
      status: 'offen',
      eingereichtVon: 'demo',
      eingereichtVonName: 'Marco',
      eingereichtAm: new Date().toISOString(),
      antwort: null,
      beantwortetVonName: null,
      beantwortetAm: null,
      stimmen: 0,
      ichHabeGestimmt: false,
      meiner: true,
    });
  }

  async wunschAendern(id: string, titel: string, beschreibung?: string): Promise<void> {
    const w = this.wunschListe.find((x) => x.id === id);
    if (!w) return;
    w.titel = titel.trim();
    w.beschreibung = beschreibung?.trim() || null;
  }

  async wunschStimmen(id: string, dafuer: boolean): Promise<void> {
    const w = this.wunschListe.find((x) => x.id === id);
    if (!w || w.ichHabeGestimmt === dafuer) return;
    w.ichHabeGestimmt = dafuer;
    w.stimmen += dafuer ? 1 : -1;
  }

  async wunschBeantworten(id: string, status: WunschStatus, antwort?: string): Promise<void> {
    const w = this.wunschListe.find((x) => x.id === id);
    if (!w) return;
    w.status = status;
    w.antwort = antwort?.trim() || null;
    w.beantwortetVonName = w.antwort ? 'Marco' : null;
    w.beantwortetAm = w.antwort ? new Date().toISOString() : null;
    w.meiner = false;
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
