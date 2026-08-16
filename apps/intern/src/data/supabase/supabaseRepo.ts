import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CounterEpoch, MaintenanceAnchor, MaintenanceSettings } from '../../core';
import type {
  CompleteMaintenanceInput,
  IssueRow,
  LaneRow,
  Repository,
  ResetCounterInput,
  SaveReadingsInput,
  SessionInfo,
  Snapshot,
  ModuleInfo,
  BackupBundle,
} from '../types';

/**
 * Supabase-Umsetzung der Datenschicht.
 *
 * Liest bewusst nur Fakten: aktueller Stand, Anker und Wochenrate kommen aus den
 * Views v_lane_current_state, v_lane_maintenance_anchor und v_lane_weekly_rate.
 * Die Bewertung (fällig / bald fällig / überfällig) passiert ausschließlich in
 * /core — es gibt keine zweite Implementierung der Regeln in SQL.
 *
 * Aktiviert wird diese Variante, sobald VITE_SUPABASE_URL und
 * VITE_SUPABASE_ANON_KEY gesetzt sind.
 */
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;
  readonly requiresLogin = true;
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  // --- Anmeldung -----------------------------------------------------------

  /**
   * Die Rechte kommen aus den Datenbankfunktionen has_module() und
   * can_write_module(). Damit gilt im Frontend exakt dieselbe Regel wie in den
   * RLS-Policies — es kann nicht auseinanderlaufen.
   */
  async getSession(): Promise<SessionInfo | null> {
    const { data: userData } = await this.client.auth.getUser();
    const user = userData.user;
    if (!user) return null;

    const [{ data: profile }, canRead, canWrite] = await Promise.all([
      this.client.from('profiles').select('display_name, role').eq('id', user.id).maybeSingle(),
      this.client.rpc('has_module', { p_module: 'maintenance' }),
      this.client.rpc('can_write_module', { p_module: 'maintenance' }),
    ]);

    return {
      userId: user.id,
      email: user.email ?? null,
      displayName: profile?.display_name ?? user.email ?? 'Unbekannt',
      role: profile?.role ?? 'mechanic',
      canRead: canRead.data === true,
      canWrite: canWrite.data === true,
    };
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase meldet aus Sicherheitsgründen bewusst unspezifisch; für den
      // Mechaniker am Tablet ist die englische Rohmeldung wertlos.
      throw new Error(
        error.message.toLowerCase().includes('invalid login')
          ? 'E-Mail-Adresse oder Passwort stimmt nicht.'
          : error.message,
      );
    }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  /**
   * Nur aktive Module, und je Modul die Rechte des angemeldeten Benutzers.
   * Die RLS lässt ihn ohnehin nicht an fremde Daten — die Übersicht zeigt also
   * nicht mehr, als er auch wirklich benutzen kann.
   */
  async listModules(): Promise<ModuleInfo[]> {
    const { data, error } = await this.client
      .from('app_modules')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    if (error) throw new Error(error.message);

    const modules = await Promise.all(
      (data ?? []).map(async (m: any) => {
        const [canRead, canWrite] = await Promise.all([
          this.client.rpc('has_module', { p_module: m.key }),
          this.client.rpc('can_write_module', { p_module: m.key }),
        ]);
        return {
          key: m.key,
          nameDe: m.name_de,
          path: m.path,
          icon: m.icon,
          sortOrder: m.sort_order,
          canRead: canRead.data === true,
          canWrite: canWrite.data === true,
        };
      }),
    );
    return modules.filter((m) => m.canRead);
  }

  /**
   * Vollstaendige Sicherung. Es wird gelesen, was der angemeldete Benutzer laut
   * RLS sehen darf — deshalb ist der Export Administratoren vorbehalten.
   */
  async exportBackup(): Promise<BackupBundle> {
    const tables = [
      'profiles', 'app_modules', 'role_module_access', 'user_module_access',
      'app_settings', 'maintenance_settings', 'lane_pairs', 'lanes',
      'lane_counter_epochs', 'frame_readings', 'maintenance_types',
      'maintenance_tasks', 'maintenance_records', 'maintenance_record_tasks',
      'lane_issues', 'lane_issue_attachments',
    ];
    const bundle: BackupBundle = {};
    for (const table of tables) {
      const { data, error } = await this.client.from(table).select('*');
      if (error) throw new Error(`${table}: ${error.message}`);
      bundle[table] = data ?? [];
    }
    return bundle;
  }

  async voidMaintenanceRecord(recordId: string, reason: string): Promise<void> {
    const userId = await this.userId();
    const patch = { voided_at: new Date().toISOString(), voided_by: userId, void_reason: reason };

    const { error } = await this.client.from('maintenance_records').update(patch).eq('id', recordId);
    if (error) throw new Error(error.message);

    // Mitkaskadierte Eintraege mit stornieren, sonst bliebe deren Anker stehen
    // und die Bahn gaelte faelschlich als gewartet.
    const { error: cascadeError } = await this.client
      .from('maintenance_records')
      .update(patch)
      .eq('derived_from_record_id', recordId)
      .is('voided_at', null);
    if (cascadeError) throw new Error(cascadeError.message);
  }

  async updateDisplayName(name: string): Promise<void> {
    const id = await this.userId();
    if (!id) throw new Error('Nicht angemeldet.');
    const { error } = await this.client
      .from('profiles')
      .update({ display_name: name, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  onAuthChange(callback: () => void): () => void {
    const { data } = this.client.auth.onAuthStateChange(() => callback());
    return () => data.subscription.unsubscribe();
  }

  private async userId(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    return data.user?.id ?? null;
  }

  private async userName(): Promise<string> {
    const session = await this.getSession();
    return session?.displayName ?? 'Unbekannt';
  }

  async load(): Promise<Snapshot> {
    const [
      settingsRes, typesRes, tasksRes, pairsRes,
      stateRes, rateRes, anchorRes, epochRes,
      recordsRes, recordTasksRes, readingsRes, issuesRes,
    ] = await Promise.all([
      this.client.from('maintenance_settings').select('*').single(),
      this.client.from('maintenance_types').select('*').eq('active', true).order('sort_order'),
      this.client.from('maintenance_tasks').select('*').eq('active', true).order('sort_order'),
      this.client.from('lane_pairs').select('*').order('sort_order'),
      this.client.from('v_lane_current_state').select('*'),
      this.client.from('v_lane_weekly_rate').select('*'),
      this.client.from('v_lane_maintenance_anchor').select('*'),
      this.client.from('lane_counter_epochs').select('*').order('effective_from'),
      this.client
        .from('maintenance_records')
        .select('*, lanes(lane_number), maintenance_types(code)')
        .order('performed_on', { ascending: false }),
      this.client.from('maintenance_record_tasks').select('*'),
      this.client
        .from('frame_readings')
        .select('*, lanes(lane_number)')
        .order('reading_date', { ascending: false })
        .order('recorded_at', { ascending: false }),
      this.client.from('lane_issues').select('*, lanes(lane_number)').order('reported_at', { ascending: false }),
    ]);

    const firstError = [
      settingsRes, typesRes, tasksRes, pairsRes, stateRes, rateRes,
      anchorRes, epochRes, recordsRes, recordTasksRes, readingsRes, issuesRes,
    ].find((r) => r.error);
    if (firstError?.error) throw new Error(firstError.error.message);

    const settings: MaintenanceSettings = {
      warningWeeks: settingsRes.data.warning_weeks,
      warningPercent: Number(settingsRes.data.warning_percent),
      plausibilityFactor: Number(settingsRes.data.plausibility_factor),
      plausibilityAbsMax: Number(settingsRes.data.plausibility_abs_max),
      counterUnitLabel: settingsRes.data.counter_unit_label,
    };

    const rateByLane = new Map<string, number | null>(
      (rateRes.data ?? []).map((r: any) => [r.lane_id, r.frames_per_week]),
    );

    const lanes: LaneRow[] = (stateRes.data ?? []).map((r: any) => ({
      laneId: r.lane_id,
      laneNumber: r.lane_number,
      status: r.status,
      pairId: r.pair_id ?? null,
      currentFrames: r.current_frames ?? null,
      lastRawValue: r.last_raw_value ?? null,
      lastReadingDate: r.last_reading_date ?? null,
      framesPerWeek: rateByLane.get(r.lane_id) ?? null,
    }));

    const anchors: Record<string, MaintenanceAnchor[]> = {};
    for (const row of anchorRes.data ?? ([] as any[])) {
      (anchors[row.lane_id] ??= []).push({
        maintenanceTypeId: row.maintenance_type_id,
        anchorFrames: row.anchor_frames ?? null,
        anchorDate: row.anchor_date ?? null,
      });
    }

    // Jüngste Epoche je Bahn gewinnt; die Liste kommt bereits sortiert.
    const currentEpoch: Record<string, CounterEpoch> = {};
    for (const e of epochRes.data ?? ([] as any[])) {
      currentEpoch[e.lane_id] = {
        id: e.id,
        laneId: e.lane_id,
        effectiveFrom: e.effective_from,
        counterStart: e.counter_start,
        cumulativeOffset: e.cumulative_offset,
        reason: e.reason,
      };
    }

    return {
      settings,
      types: (typesRes.data ?? []).map((t: any) => ({
        id: t.id,
        code: t.code,
        nameDe: t.name_de,
        intervalFrames: t.interval_frames,
        maxIntervalDays: t.max_interval_days,
        cascadesToSmaller: t.cascades_to_smaller,
        sortOrder: t.sort_order,
      })),
      tasks: (tasksRes.data ?? []).map((t: any) => ({
        id: t.id,
        maintenanceTypeId: t.maintenance_type_id,
        code: t.code,
        titleDe: t.title_de,
        scope: t.scope,
        sortOrder: t.sort_order,
      })),
      pairs: (pairsRes.data ?? []).map((p: any) => ({ id: p.id, label: p.label, sortOrder: p.sort_order })),
      lanes,
      anchors,
      currentEpoch,
      records: (recordsRes.data ?? []).map((r: any) => ({
        id: r.id,
        laneId: r.lane_id,
        laneNumber: r.lanes?.lane_number ?? 0,
        maintenanceTypeId: r.maintenance_type_id,
        typeCode: r.maintenance_types?.code ?? '',
        performedOn: r.performed_on,
        cumulativeFrames: r.cumulative_frames,
        employeeName: r.employee_name ?? '—',
        notes: r.notes,
        source: r.source,
        derivedFromRecordId: r.derived_from_record_id,
        hasDeviation: r.has_deviation,
        voidedAt: r.voided_at,
        voidReason: r.void_reason,
      })),
      recordTasks: (recordTasksRes.data ?? []).map((t: any) => ({
        recordId: t.record_id,
        taskId: t.task_id,
        result: t.result,
        taskTitleSnapshot: t.task_title_snapshot,
      })),
      readings: (readingsRes.data ?? []).map((r: any) => ({
        id: r.id,
        laneId: r.lane_id,
        laneNumber: r.lanes?.lane_number ?? 0,
        readingDate: r.reading_date,
        rawValue: r.raw_value,
        cumulativeFrames: r.cumulative_frames,
        source: r.source,
        supersededById: r.superseded_by_id,
        correctsReadingId: r.corrects_reading_id,
        correctionReason: r.correction_reason,
        recordedAt: r.recorded_at,
        recordedByName: null,
      })),
      issues: (issuesRes.data ?? []).map((i: any) => ({
        id: i.id,
        laneId: i.lane_id,
        laneNumber: i.lanes?.lane_number ?? null,
        title: i.title,
        description: i.description,
        severity: i.severity,
        status: i.status,
        reportedBy: i.reported_by ?? '—',
        reportedAt: i.reported_at,
        resolutionNote: i.resolution_note,
      })),
    };
  }

  /**
   * Läuft über die Datenbankfunktion record_frame_reading. Die kümmert sich um
   * drei Dinge, die der Client nicht zuverlässig könnte: Zähler-Epoche bei der
   * Ersteinrichtung anlegen, eine bereits vorhandene Ablesung desselben Tages
   * als ersetzt markieren, und beides in einer Transaktion.
   */
  async saveReadings(input: SaveReadingsInput): Promise<void> {
    const failed: string[] = [];

    for (const entry of input.entries) {
      const { error } = await this.client.rpc('record_frame_reading', {
        p_lane_id: entry.laneId,
        p_reading_date: input.readingDate,
        p_raw_value: entry.rawValue,
        // Idempotenzschlüssel: verhindert Doppelbuchungen aus der Offline-Warteschlange
        p_client_request_id: crypto.randomUUID(),
      });
      if (error) failed.push(`${error.message}`);
    }

    if (failed.length > 0) {
      throw new Error(
        failed.length === 1
          ? failed[0]
          : `${failed.length} Bahnen konnten nicht gespeichert werden: ${failed.join(' · ')}`,
      );
    }
  }

  async resetCounter(input: ResetCounterInput): Promise<void> {
    const snapshot = await this.load();
    const lane = snapshot.lanes.find((l) => l.laneId === input.laneId);
    const { error } = await this.client.from('lane_counter_epochs').insert({
      lane_id: input.laneId,
      effective_from: input.effectiveFrom,
      counter_start: input.newCounterValue,
      cumulative_offset: lane?.currentFrames ?? 0,
      reason: input.reason,
      note: input.note ?? null,
      created_by: await this.userId(),
    });
    if (error) throw new Error(error.message);
  }

  async completeMaintenance(input: CompleteMaintenanceInput): Promise<void> {
    const snapshot = await this.load();
    const lane = snapshot.lanes.find((l) => l.laneId === input.laneId);
    if (!lane || lane.currentFrames === null) {
      throw new Error('Für diese Bahn liegt noch keine Ablesung vor.');
    }
    const userId = await this.userId();
    const employeeName = input.employeeName || (await this.userName());
    const taskById = new Map(snapshot.tasks.map((t) => [t.id, t]));
    const typeById = new Map(snapshot.types.map((t) => [t.id, t]));

    let primaryId: string | null = null;

    for (const [index, block] of input.blocks.entries()) {
      // Vor dem Insert festhalten, damit der Rückgabetyp nicht auf sich selbst verweist.
      const derivedFrom: string | null = index === 0 ? null : primaryId;

      const { data, error }: { data: { id: string } | null; error: { message: string } | null } =
        await this.client
        .from('maintenance_records')
        .insert({
          lane_id: input.laneId,
          maintenance_type_id: block.maintenanceTypeId,
          performed_on: input.performedOn,
          cumulative_frames: lane.currentFrames,
          employee_profile_id: userId,
          employee_name: employeeName,
          notes: input.notes ?? null,
          source: index === 0 ? 'manual' : 'cascade',
          derived_from_record_id: derivedFrom,
          has_deviation: block.tasks.some((t) => t.result === 'open'),
          created_by: userId,
          client_request_id: crypto.randomUUID(),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Wartungseintrag konnte nicht angelegt werden.");
      if (index === 0) primaryId = data.id;

      const taskRows = block.tasks.map((t) => ({
        record_id: data.id,
        task_id: t.taskId,
        result: t.result,
        task_title_snapshot: taskById.get(t.taskId)?.titleDe ?? '',
        interval_frames_snapshot: typeById.get(block.maintenanceTypeId)?.intervalFrames ?? 0,
        scope_snapshot: taskById.get(t.taskId)?.scope ?? 'lane',
      }));
      if (taskRows.length) {
        const { error: taskError } = await this.client.from('maintenance_record_tasks').insert(taskRows);
        if (taskError) throw new Error(taskError.message);
      }
    }
  }

  async createIssue(input: {
    laneId: string | null;
    title: string;
    description?: string;
    severity: IssueRow['severity'];
  }): Promise<void> {
    const { error } = await this.client.from('lane_issues').insert({
      lane_id: input.laneId,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      reported_by: await this.userId(),
      client_request_id: crypto.randomUUID(),
    });
    if (error) throw new Error(error.message);
  }

  async updateIssueStatus(id: string, status: IssueRow['status'], resolutionNote?: string): Promise<void> {
    const { error } = await this.client
      .from('lane_issues')
      .update({
        status,
        resolution_note: resolutionNote ?? null,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        resolved_by: status === 'resolved' ? await this.userId() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Korrektur (nur Admin): alte Zeile bleibt stehen und wird nur markiert. */
  async correctReading(input: {
    laneId: string;
    readingDate: string;
    newRawValue: number;
    reason: string;
  }): Promise<void> {
    const { data: old, error: findError } = await this.client
      .from('frame_readings')
      .select('id, epoch_id')
      .eq('lane_id', input.laneId)
      .eq('reading_date', input.readingDate)
      .is('superseded_by_id', null)
      .single();
    if (findError) throw new Error(findError.message);

    const { data: created, error: insertError } = await this.client
      .from('frame_readings')
      .insert({
        lane_id: input.laneId,
        epoch_id: old.epoch_id,
        reading_date: input.readingDate,
        raw_value: input.newRawValue,
        source: 'correction',
        corrects_reading_id: old.id,
        correction_reason: input.reason,
        recorded_by: await this.userId(),
        client_request_id: crypto.randomUUID(),
      })
      .select('id')
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error: markError } = await this.client
      .from('frame_readings')
      .update({ superseded_by_id: created.id })
      .eq('id', old.id);
    if (markError) throw new Error(markError.message);
  }

  async updateSettings(settings: Partial<MaintenanceSettings>): Promise<void> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (settings.warningWeeks !== undefined) patch.warning_weeks = settings.warningWeeks;
    if (settings.warningPercent !== undefined) patch.warning_percent = settings.warningPercent;
    if (settings.plausibilityFactor !== undefined) patch.plausibility_factor = settings.plausibilityFactor;
    if (settings.plausibilityAbsMax !== undefined) patch.plausibility_abs_max = settings.plausibilityAbsMax;
    if (settings.counterUnitLabel !== undefined) patch.counter_unit_label = settings.counterUnitLabel;

    const { error } = await this.client.from('maintenance_settings').update(patch).eq('id', true);
    if (error) throw new Error(error.message);
  }
}
