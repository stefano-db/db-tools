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
  UserRow,
  CreateUserInput,
  DocumentRow,
  RosterEmployeeRow,
  MyWeek,
} from '../types';

/** Montag der laufenden Woche als YYYY-MM-DD. */
function mondayOfCurrentWeek(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
    monday.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Rohmeldungen der Anmeldung in Sätze übersetzen, die im Center weiterhelfen.
 *
 * „Failed to fetch" steht auf der Anmeldemaske, die jeder im Haus benutzt —
 * dort ist eine englische Fehlermeldung aus dem Netzwerkstapel keine Auskunft,
 * sondern eine Sackgasse. Unbekanntes wird durchgereicht: lieber eine fremde
 * Meldung als eine erfundene.
 */
function anmeldeFehlerText(roh: string): string {
  const m = roh.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Benutzername oder Passwort stimmt nicht.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return 'Keine Verbindung zum Server. Prüfe das WLAN und versuche es noch einmal.';
  }
  if (m.includes('email not confirmed')) {
    return 'Dieses Konto ist noch nicht bestätigt. Melde dich bei deiner Bereichsleitung.';
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Zu viele Versuche. Warte einen Moment und versuche es dann noch einmal.';
  }
  if (m.includes('unbekannt') || m.includes('not found')) {
    return 'Diesen Benutzernamen gibt es nicht.';
  }
  return roh;
}

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
  private readonly url: string;
  private readonly anonKey: string;

  constructor(url: string, anonKey: string) {
    this.url = url;
    this.anonKey = anonKey;
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  /**
   * Technische Adresse zu einem Benutzernamen. Mitarbeiter melden sich mit dem
   * Namen an; Supabase braucht intern eine E-Mail. Enthält die Eingabe ein @,
   * ist es bereits eine echte Adresse (Administratoren).
   */
  private async toEmail(login: string): Promise<string> {
    const value = login.trim();
    if (value.includes('@')) return value;

    // Zum Benutzernamen die hinterlegte Anmeldeadresse holen. Das kann die
    // technische sein oder eine echte — die Anwendung muss das nicht wissen.
    const { data } = await this.client.rpc('login_email_for_username', {
      p_username: value.toLowerCase(),
    });
    return (data as string | null) ?? `${value.toLowerCase()}@dreambowl.intern`;
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
      this.client
        .from('profiles')
        .select('display_name, username, department, is_lead, is_admin')
        .eq('id', user.id)
        .maybeSingle(),
      this.client.rpc('has_module', { p_module: 'maintenance' }),
      this.client.rpc('can_write_module', { p_module: 'maintenance' }),
    ]);

    const email = user.email ?? null;
    return {
      userId: user.id,
      // Technische Adressen nie anzeigen — sie sind ein Implementierungsdetail.
      email: email && email.endsWith('@dreambowl.intern') ? null : email,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? profile?.username ?? 'Unbekannt',
      department: profile?.department ?? null,
      isLead: profile?.is_lead === true,
      isAdmin: profile?.is_admin === true,
      canRead: canRead.data === true,
      canWrite: canWrite.data === true,
    };
  }

  async signIn(login: string, password: string): Promise<void> {
    // Ein Netzfehler beim Anmelden sieht fuer Supabase aus wie jeder andere;
    // fuer den Menschen davor ist es der Unterschied zwischen „falsch getippt"
    // und „das WLAN ist weg".
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Keine Verbindung. Prüfe das WLAN und versuche es noch einmal.');
    }
    let email: string;
    try {
      email = await this.toEmail(login);
    } catch (err) {
      throw new Error(anmeldeFehlerText(err instanceof Error ? err.message : String(err)));
    }

    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(anmeldeFehlerText(error.message));
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
          externalUrl: m.external_url ?? null,
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
    // Vollstaendig heisst vollstaendig. Der Dienstplan fehlte hier, solange er
    // eine eigenstaendige Seite war — laeuft der Betrieb darueber, waere eine
    // Sicherung ohne ihn keine.
    const tables = [
      // Plattform
      'profiles', 'app_modules', 'role_module_access', 'user_module_access',
      'department_module_access', 'app_settings',
      // Bahnwartung
      'maintenance_settings', 'lane_pairs', 'lanes', 'lane_counter_epochs',
      'frame_readings', 'maintenance_types', 'maintenance_tasks',
      'maintenance_records', 'maintenance_record_tasks',
      'lane_issues', 'lane_issue_attachments',
      // Dienstplan — samt Historie, damit auch zurueckliegende Staende erhalten bleiben
      'roster_employees', 'roster_weeks', 'roster_week_history', 'roster_settings',
      'roster_share_links', 'roster_seen',
      // Dokumente und Urkunden
      'documents', 'cert_settings', 'cert_documents',
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

  // --- Benutzerverwaltung ---------------------------------------------------

  async listUsers(): Promise<UserRow[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, username, display_name, email, department, is_lead, is_admin, active, created_at')
      .order('display_name');
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      id: p.id,
      username: p.username,
      email: p.email ?? null,
      displayName: p.display_name,
      department: p.department,
      isLead: p.is_lead === true,
      isAdmin: p.is_admin === true,
      active: p.active !== false,
      createdAt: p.created_at,
    }));
  }

  /**
   * Legt ein Mitarbeiterkonto an.
   *
   * Die Registrierung laeuft ueber einen zweiten, sitzungslosen Client — sonst
   * wuerde Supabase die Anmeldung des Administrators durch die des neuen
   * Kontos ersetzen und man waere plötzlich als der neue Mitarbeiter angemeldet.
   */
  async createUser(input: CreateUserInput): Promise<void> {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      throw new Error(
        'Benutzername: mindestens 3 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.',
      );
    }
    if (input.password.length < 8) {
      throw new Error('Das Passwort muss mindestens 8 Zeichen haben.');
    }

    const realEmail = input.email?.trim().toLowerCase() || null;

    const signupClient = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await signupClient.auth.signUp({
      email: realEmail || `${username}@dreambowl.intern`,
      password: input.password,
      options: { data: { username, display_name: input.displayName.trim() } },
    });
    if (error) {
      throw new Error(
        error.message.toLowerCase().includes('already registered')
          ? `Der Benutzername „${username}" ist bereits vergeben.`
          : error.message,
      );
    }
    if (!data.user) throw new Error('Konto wurde nicht angelegt.');

    // Bereich und Leitung setzt der Administrator, nicht die Registrierung.
    const { error: profileError } = await this.client
      .from('profiles')
      .update({
        display_name: input.displayName.trim(),
        username,
        department: input.department,
        is_lead: input.isLead,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.user.id);
    if (profileError) throw new Error(profileError.message);
  }

  async updateUser(
    id: string,
    patch: Partial<Pick<UserRow, 'displayName' | 'department' | 'isLead' | 'isAdmin' | 'active'>>,
  ): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.department !== undefined) row.department = patch.department;
    if (patch.isLead !== undefined) row.is_lead = patch.isLead;
    if (patch.isAdmin !== undefined) row.is_admin = patch.isAdmin;
    if (patch.active !== undefined) row.active = patch.active;

    const { error } = await this.client.from('profiles').update(row).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async setUserEmail(id: string, email: string): Promise<void> {
    const { error } = await this.client.rpc('admin_set_email', {
      p_user_id: id,
      p_email: email,
    });
    if (error) throw new Error(error.message);
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) throw new Error(error.message);
  }

  // --- Dokumente ------------------------------------------------------------

  async listDocuments(): Promise<DocumentRow[]> {
    const { data, error } = await this.client
      .from('documents')
      .select('*, storage_path')
      .is('archived_at', null)
      .order('category', { nullsFirst: true })
      .order('title');
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Vorschau gibt es für das, was der Browser darstellen kann: Bilder und PDF.
    // Alle Adressen in einem Aufruf signieren statt einzeln — sonst wären es bei
    // 40 Vorlagen 40 Anfragen allein für die Übersicht.
    const previewable = rows.filter(
      (d: any) => d.mime_type === 'application/pdf' || String(d.mime_type).startsWith('image/'),
    );
    const urls = new Map<string, string>();
    if (previewable.length > 0) {
      const { data: signed } = await this.client.storage
        .from('dokumente')
        .createSignedUrls(previewable.map((d: any) => d.storage_path), 60 * 30);
      for (const entry of signed ?? []) {
        if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
      }
    }

    return rows.map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      category: d.category,
      fileName: d.file_name,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      printCount: d.print_count ?? 0,
      lastPrintedAt: d.last_printed_at,
      createdAt: d.created_at,
      previewUrl: urls.get(d.storage_path) ?? null,
    }));
  }

  async uploadDocument(input: {
    file: File;
    title: string;
    description?: string;
    category?: string;
  }): Promise<void> {
    const safe = input.file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${crypto.randomUUID()}-${safe}`;

    const { error: uploadError } = await this.client.storage
      .from('dokumente')
      .upload(path, input.file, { contentType: input.file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { error } = await this.client.from('documents').insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      storage_path: path,
      file_name: input.file.name,
      mime_type: input.file.type || 'application/octet-stream',
      size_bytes: input.file.size,
      uploaded_by: await this.userId(),
    });
    if (error) {
      // Eintrag fehlgeschlagen: die Datei nicht verwaist liegen lassen.
      await this.client.storage.from('dokumente').remove([path]);
      throw new Error(error.message);
    }
  }

  async documentUrl(id: string, forDownload = false): Promise<string> {
    const { data: row, error: rowError } = await this.client
      .from('documents')
      .select('storage_path, file_name')
      .eq('id', id)
      .single();
    if (rowError) throw new Error(rowError.message);

    const { data, error } = await this.client.storage
      .from('dokumente')
      .createSignedUrl(row.storage_path, 60 * 30, forDownload ? { download: row.file_name } : {});
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async resetLane(laneId: string) {
    const { data, error } = await this.client.rpc('admin_reset_lane', { p_lane_id: laneId });
    if (error) throw new Error(error.message);
    return {
      readings: data?.readings ?? 0,
      records: data?.records ?? 0,
      epochs: data?.epochs ?? 0,
    };
  }

  async markDocumentPrinted(id: string): Promise<void> {
    const { error } = await this.client.rpc('document_printed', { p_id: id });
    if (error) throw new Error(error.message);
  }

  async archiveDocument(id: string): Promise<void> {
    const { error } = await this.client
      .from('documents')
      .update({ archived_at: new Date().toISOString(), archived_by: await this.userId() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  // --- Dienstplan -----------------------------------------------------------

  async listRosterEmployees(): Promise<RosterEmployeeRow[]> {
    const { data, error } = await this.client
      .from('roster_employees')
      .select('id, name, group_no, target_days, profile_id')
      .eq('active', true)
      .order('group_no')
      .order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      groupNo: r.group_no,
      // Ohne diesen Wert wuerde jede Aenderung am Bereich die Sollstunden auf
      // null zuruecksetzen — gelesen wird, was auch geschrieben wird.
      targetHours: Number(r.target_days ?? 0),
      profileId: r.profile_id,
    }));
  }

  /**
   * Ein Konto darf nur an einem Namen hängen. Deshalb wird eine bestehende
   * Verbindung desselben Kontos zuerst gelöst — sonst stünde jemand doppelt im
   * Plan und „meine Schicht" wäre nicht mehr eindeutig.
   */
  async rosterEmployeeSpeichern(eintrag: {
    id?: string;
    name: string;
    groupNo: number;
    targetHours: number;
  }): Promise<void> {
    const zeile = {
      name: eintrag.name,
      group_no: eintrag.groupNo,
      target_days: eintrag.targetHours,
    };

    if (eintrag.id) {
      const { error } = await this.client.from('roster_employees').update(zeile).eq('id', eintrag.id);
      if (error) throw new Error(error.message);
      return;
    }

    // Neue Namen ans Ende ihres Bereichs, nicht an den Anfang: die Reihenfolge
    // im Plan ist gewachsen und soll nicht bei jeder Einstellung durcheinander
    // geraten.
    const { data: letzte } = await this.client
      .from('roster_employees')
      .select('sort_order')
      .eq('group_no', eintrag.groupNo)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await this.client
      .from('roster_employees')
      .insert({ ...zeile, sort_order: (letzte?.sort_order ?? 0) + 1, active: true });
    if (error) throw new Error(error.message);
  }

  async rosterEmployeeEntfernen(id: string): Promise<void> {
    const { error } = await this.client
      .from('roster_employees')
      .update({ active: false })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async linkRosterEmployee(rosterEmployeeId: string, profileId: string | null): Promise<void> {
    if (profileId) {
      const { error: clearError } = await this.client
        .from('roster_employees')
        .update({ profile_id: null })
        .eq('profile_id', profileId);
      if (clearError) throw new Error(clearError.message);
    }

    const { error } = await this.client
      .from('roster_employees')
      .update({ profile_id: profileId })
      .eq('id', rosterEmployeeId);
    if (error) throw new Error(error.message);
  }

  async myWeek(): Promise<MyWeek | null> {
    const userId = await this.userId();
    if (!userId) return null;

    const { data: emp } = await this.client
      .from('roster_employees')
      .select('id, name')
      .eq('profile_id', userId)
      .eq('active', true)
      .maybeSingle();
    if (!emp) return null;

    const monday = mondayOfCurrentWeek();
    const { data: week } = await this.client
      .from('roster_weeks')
      .select('data, updated_at')
      .eq('week_start', monday)
      .maybeSingle();

    const entry = week?.data?.[emp.id];
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      weekStart: monday,
      days: entry?.d ?? [],
      updatedAt: week?.updated_at ?? null,
    };
  }

  /**
   * Auf Aenderungen einer Woche hoeren.
   *
   * Die Tabelle ist fuer die Echtzeit freigegeben, und die Zeilenrechte gelten
   * auch hier: geliefert wird nur, was der Angemeldete ohnehin lesen darf.
   */
  watchRosterWeek(weekStart: string, beiAenderung: (data: any) => void): () => void {
    const kanal = this.client
      .channel(`plan-${weekStart}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'roster_weeks',
          filter: `week_start=eq.${weekStart}`,
        },
        (nutzlast: any) => beiAenderung(nutzlast.new?.data ?? {}),
      )
      .subscribe();

    return () => {
      void this.client.removeChannel(kanal);
    };
  }

  async rosterWeek(weekStart: string): Promise<{ data: any; version: number }> {
    const { data, error } = await this.client
      .from('roster_weeks')
      .select('data, version')
      .eq('week_start', weekStart)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Fassung 0 heisst: die Woche gibt es noch nicht. Beim Speichern wird sie
    // dann angelegt statt geaendert.
    return { data: data?.data ?? {}, version: data?.version ?? 0 };
  }

  async rosterWeekSpeichern(weekStart: string, data: any, version: number): Promise<any> {
    const { data: antwort, error } = await this.client.rpc('roster_week_speichern', {
      p_week_start: weekStart,
      p_data: data,
      p_version: version,
    });
    if (error) throw new Error(error.message);
    if (!antwort) throw new Error('Keine Antwort vom Server.');

    if (antwort.ok) return { ok: true, version: antwort.version };
    if (antwort.grund === 'veraltet') {
      return { ok: false, grund: 'veraltet', version: antwort.version, data: antwort.data ?? {} };
    }
    return { ok: false, grund: 'keine_berechtigung' };
  }

  // --- Chat -----------------------------------------------------------------

  /**
   * Antwort auf eine Frage.
   *
   * Die Rangfolge macht die Datenbank, nicht die Oberflaeche — dort liegt der
   * Index. Kommt spaeter ein Sprachmodell dazu, tritt es genau hier dazwischen:
   * es bekommt die Frage und diese Treffer und formuliert daraus eine Antwort.
   * Die Oberflaeche merkt davon nichts.
   */
  async chatAntwort(frage: string): Promise<any[]> {
    const { data, error } = await this.client.rpc('chat_suche', {
      p_frage: frage,
      p_grenze: 4,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t: any) => ({
      id: t.id,
      titel: t.titel,
      inhalt: t.inhalt,
      bereich: t.bereich ?? null,
      rang: t.rang,
    }));
  }

  async chatFrageMerken(frage: string, treffer: number): Promise<string | null> {
    const userId = await this.userId();
    if (!userId) return null;
    const { data, error } = await this.client
      .from('chat_fragen')
      .insert({ user_id: userId, frage, treffer })
      .select('id')
      .single();
    // Eine nicht festgehaltene Frage darf den Chat nicht aufhalten: der
    // Mitarbeiter hat seine Antwort, das Mitschreiben ist unsere Sache.
    if (error) return null;
    return data.id;
  }

  async chatRueckmeldung(frageId: string, geholfen: boolean): Promise<void> {
    await this.client.from('chat_fragen').update({ geholfen }).eq('id', frageId);
  }

  async wissenListe(): Promise<any[]> {
    const { data, error } = await this.client
      .from('chat_wissen')
      .select('id, titel, inhalt, bereich, schlagworte, aktiv')
      .order('titel');
    if (error) throw new Error(error.message);
    return (data ?? []).map((w: any) => ({
      id: w.id,
      titel: w.titel,
      inhalt: w.inhalt,
      bereich: w.bereich ?? null,
      schlagworte: w.schlagworte ?? [],
      aktiv: w.aktiv,
    }));
  }

  async wissenSpeichern(eintrag: any): Promise<void> {
    const zeile = {
      titel: eintrag.titel,
      inhalt: eintrag.inhalt,
      bereich: eintrag.bereich,
      schlagworte: eintrag.schlagworte,
      aktiv: eintrag.aktiv,
      updated_at: new Date().toISOString(),
      updated_by: await this.userId(),
    };
    const { error } = eintrag.id
      ? await this.client.from('chat_wissen').update(zeile).eq('id', eintrag.id)
      : await this.client.from('chat_wissen').insert(zeile);
    if (error) throw new Error(error.message);
  }

  async wissenLoeschen(id: string): Promise<void> {
    const { error } = await this.client.from('chat_wissen').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async offeneFragen(): Promise<{ id: string; frage: string; wann: string }[]> {
    const { data, error } = await this.client
      .from('chat_fragen')
      .select('id, frage, created_at')
      .eq('treffer', 0)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((f: any) => ({ id: f.id, frage: f.frage, wann: f.created_at }));
  }

  async listShareLinks(): Promise<any[]> {
    const { data, error } = await this.client
      .from('roster_share_links')
      .select('token, label, created_at, revoked_at, last_used_at, use_count')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      token: r.token,
      label: r.label,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
      lastUsedAt: r.last_used_at,
      useCount: r.use_count,
    }));
  }

  async createShareLink(label: string): Promise<any> {
    const { data, error } = await this.client
      .from('roster_share_links')
      .insert({ label, created_by: await this.userId() })
      .select('token, label, created_at, revoked_at, last_used_at, use_count')
      .single();
    if (error) throw new Error(error.message);
    return {
      token: data.token,
      label: data.label,
      createdAt: data.created_at,
      revokedAt: data.revoked_at,
      lastUsedAt: data.last_used_at,
      useCount: data.use_count,
    };
  }

  /** Widerrufen, nicht loeschen — wer den Link benutzt hat, bleibt nachvollziehbar. */
  async revokeShareLink(token: string): Promise<void> {
    const { error } = await this.client
      .from('roster_share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token);
    if (error) throw new Error(error.message);
  }

  async publicRoster(token: string): Promise<any | null> {
    const { data, error } = await this.client.rpc('roster_public', { p_token: token });
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      weekStart: data.week_start,
      updatedAt: data.updated_at ?? null,
      employees: (data.employees ?? []).map((e: any) => ({
        id: e.id,
        name: e.name,
        groupNo: e.group_no,
      })),
      data: data.data ?? {},
    };
  }

  async setUserPassword(id: string, password: string): Promise<void> {
    const { error } = await this.client.rpc('admin_set_password', {
      p_user_id: id,
      p_password: password,
    });
    if (error) throw new Error(error.message);
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
