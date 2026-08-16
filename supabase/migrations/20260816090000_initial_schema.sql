-- =============================================================================
--  Bowlingcenter – Wartungsplanung nach Frames
--  PostgreSQL / Supabase Schema, Version 1.0
--
--  Grundprinzipien:
--   1. Es wird ausschliesslich mit KUMULATIVEN Frames gerechnet. Der abgelesene
--      Rohwert wird zusaetzlich gespeichert, aber nie fuer Fristen verwendet.
--      Ein Zaehlerwechsel/-Reset erzeugt eine neue "Zaehler-Epoche".
--   2. APPEND-ONLY: Ablesungen und Wartungen werden nie geloescht oder
--      ueberschrieben. Korrektur = neue Zeile + Verweis auf die alte.
--   3. EINE Wahrheit: der aktuelle Frame-Stand und der letzte Wartungsstand
--      sind ABGELEITETE Werte (Views), keine redundanten Spalten.
--   4. Die Datenbank speichert FAKTEN. Die Faelligkeitsberechnung (faellig /
--      bald faellig / ueberfaellig / Prognose) liegt ausschliesslich in der
--      TypeScript-Domaenenlogik (/core), damit es nur EINE Implementierung gibt.
--      Views liefern daher nur Rohgroessen (Stand, Anker, Wochenrate).
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
--  1. ENUM-Typen
-- =============================================================================

-- 'counter' = Counter-/Servicemitarbeiter (fuer spaetere Module vorgesehen).
-- Weitere Rollen jederzeit per: alter type app_role add value '...';
create type app_role        as enum ('mechanic', 'counter', 'admin');
create type lane_status     as enum ('active', 'out_of_service', 'renovation');
create type counter_kind    as enum ('frames', 'balls', 'cycles');
create type task_scope      as enum ('lane', 'lane_pair', 'center');
create type task_result     as enum ('done', 'not_applicable', 'open');
create type record_source   as enum ('manual', 'cascade', 'initial_import');
create type reading_source  as enum ('weekly', 'correction', 'initial');
create type epoch_reason    as enum ('initial', 'counter_reset', 'counter_replaced',
                                     'pinsetter_replaced', 'correction');
create type issue_status    as enum ('open', 'in_progress', 'resolved');
create type issue_severity  as enum ('low', 'medium', 'high');

-- =============================================================================
--  2. Benutzer & Rollen
-- =============================================================================

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null check (length(btrim(display_name)) > 0),
  role         app_role    not null default 'mechanic',
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is 'Anwendungsprofil zu jedem Supabase-Auth-Benutzer.';

-- Hilfsfunktionen fuer RLS (security definer, damit RLS auf profiles nicht rekursiv greift)
create or replace function public.current_app_role()
returns app_role
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() and active $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.current_app_role() is not null $$;

-- Neue Auth-Benutzer bekommen automatisch ein Profil (Rolle: mechanic)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
--  2b. Module & Zugriffsrechte
-- -----------------------------------------------------------------------------
--  Vorbereitung fuer die spaetere interne Plattform: ein Login, danach sieht
--  jeder Mitarbeiter nur die Module seines Bereichs (Mechaniker: Wartung,
--  Counter: Counter-Werkzeuge, Admin: alles).
--  Die Wartungs-App ist zunaechst das einzige Modul ('maintenance'); weitere
--  Module benoetigen spaeter nur eine Zeile in app_modules und passende
--  RLS-Policies -- keine Migration des Bestehenden.
-- =============================================================================

create table app_modules (
  key        text primary key,                 -- 'maintenance', 'counter', ...
  name_de    text    not null,
  path       text    not null,                 -- '/wartung/'
  icon       text,
  sort_order int     not null default 100,
  active     boolean not null default true
);

-- Standardrechte je Rolle
create table role_module_access (
  role       app_role not null,
  module_key text     not null references app_modules(key) on delete cascade,
  can_write  boolean  not null default false,
  primary key (role, module_key)
);

-- Individuelle Ausnahme fuer einzelne Benutzer (granted = false entzieht Zugriff)
create table user_module_access (
  user_id    uuid    not null references profiles(id) on delete cascade,
  module_key text    not null references app_modules(key) on delete cascade,
  granted    boolean not null default true,
  can_write  boolean not null default false,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

create or replace function public.has_module(p_module text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when exists (select 1 from user_module_access u
                  where u.user_id = auth.uid() and u.module_key = p_module)
      then (select u.granted from user_module_access u
             where u.user_id = auth.uid() and u.module_key = p_module)
    else exists (select 1 from role_module_access r
                  where r.role = public.current_app_role() and r.module_key = p_module)
  end
$$;

create or replace function public.can_write_module(p_module text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when exists (select 1 from user_module_access u
                  where u.user_id = auth.uid() and u.module_key = p_module)
      then (select u.granted and u.can_write from user_module_access u
             where u.user_id = auth.uid() and u.module_key = p_module)
    else exists (select 1 from role_module_access r
                  where r.role = public.current_app_role()
                    and r.module_key = p_module and r.can_write)
  end
$$;

-- =============================================================================
--  3. Einstellungen
-- -----------------------------------------------------------------------------
--  Bewusst getrennt: app_settings gilt fuer die gesamte interne Plattform,
--  maintenance_settings nur fuer dieses Modul.
-- =============================================================================

create table app_settings (
  id          boolean primary key default true check (id),
  center_name text    not null default 'Bowlingcenter',
  timezone    text    not null default 'Europe/Berlin',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

insert into app_settings (id) values (true);

create table maintenance_settings (
  id                   boolean primary key default true check (id),

  -- Was zaehlt der Maschinenzaehler tatsaechlich? Beeinflusst nur die
  -- Beschriftung; die Intervalle sind immer in derselben Einheit definiert.
  counter_kind         counter_kind not null default 'frames',
  counter_unit_label   text    not null default 'Frames',

  -- Vorwarnung: gelb, wenn die Wartung voraussichtlich innerhalb von
  -- warning_weeks Wochen faellig wird (Prognose aus der Wochenrate).
  warning_weeks        int     not null default 3  check (warning_weeks between 1 and 26),
  -- Fallback, solange keine Ratenhistorie existiert: Prozent des Intervalls.
  warning_percent      numeric(4,3) not null default 0.200 check (warning_percent > 0 and warning_percent < 1),
  -- Anzahl der letzten Ablesungen fuer den gleitenden Mittelwert der Wochenrate.
  rate_window_readings int     not null default 8  check (rate_window_readings between 2 and 52),

  -- Kaskadierung: groessere Wartung setzt kleinere Intervalle mit zurueck.
  cascade_default      boolean not null default true,

  -- Plausibilitaetspruefung der Wocheneingabe:
  -- Warnung, wenn Zuwachs > plausibility_factor * uebliche Wochenrate der Bahn
  plausibility_factor  numeric(4,1) not null default 3.0 check (plausibility_factor >= 1),
  -- Harte Obergrenze pro Woche und Bahn (Tippfehler-Bremse)
  plausibility_abs_max bigint  not null default 20000 check (plausibility_abs_max > 0),

  updated_at           timestamptz not null default now(),
  updated_by           uuid references profiles(id)
);

insert into maintenance_settings (id) values (true);

-- =============================================================================
--  4. Bahnen & Bahnpaare
-- =============================================================================

create table lane_pairs (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,         -- z.B. 'Bahn 1-2'
  sort_order int  not null,
  note       text
);

comment on table lane_pairs is
  'Bahnpaare mit gemeinsamem Ball Return / Ball Elevator. Aufgaben mit '
  'scope = lane_pair gelten fuer beide Bahnen des Paares.';

create table lanes (
  id          uuid primary key default gen_random_uuid(),
  lane_number int  not null unique check (lane_number between 1 and 999),
  pair_id     uuid references lane_pairs(id) on delete set null,
  status      lane_status not null default 'active',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Bewusst KEINE Spalte current_frames: der aktuelle Stand ist abgeleitet
-- (siehe v_lane_current_state) und kann damit nie auseinanderdriften.

create index lanes_pair_idx on lanes (pair_id);

-- =============================================================================
--  5. Zaehler-Epochen  (Kernstueck fuer zurueckgesetzte / getauschte Zaehler)
-- =============================================================================
--  kumulativ = cumulative_offset + (abgelesener_wert - counter_start)
--
--  Beispiel: Bahn 4 stand bei 412.500 kumulativ, der Zaehler wird getauscht,
--  der neue Zaehler startet bei 0:
--     counter_start = 0, cumulative_offset = 412500
--  Startet der Austauschzaehler bei 1.200 (kommt vor!):
--     counter_start = 1200, cumulative_offset = 412500
-- =============================================================================

create table lane_counter_epochs (
  id                uuid primary key default gen_random_uuid(),
  lane_id           uuid   not null references lanes(id) on delete cascade,
  effective_from    date   not null,
  counter_start     bigint not null default 0 check (counter_start >= 0),
  cumulative_offset bigint not null default 0 check (cumulative_offset >= 0),
  reason            epoch_reason not null,
  note              text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  unique (lane_id, effective_from)
);

create index lane_counter_epochs_lane_idx
  on lane_counter_epochs (lane_id, effective_from desc);

-- Jede Bahn braucht genau eine 'initial'-Epoche
create unique index lane_counter_epochs_one_initial
  on lane_counter_epochs (lane_id) where reason = 'initial';

-- =============================================================================
--  6. Frame-Ablesungen  (append-only)
-- =============================================================================

create table frame_readings (
  id                  uuid primary key default gen_random_uuid(),
  lane_id             uuid   not null references lanes(id) on delete cascade,
  epoch_id            uuid   not null references lane_counter_epochs(id) on delete restrict,
  reading_date        date   not null,
  raw_value           bigint not null check (raw_value >= 0),   -- so abgelesen
  cumulative_frames   bigint not null,                          -- vom Trigger gesetzt
  source              reading_source not null default 'weekly',

  -- Korrekturkette (Admin): alte Zeile bleibt stehen, wird nur markiert
  corrects_reading_id uuid references frame_readings(id) on delete set null,
  superseded_by_id    uuid references frame_readings(id) on delete set null,
  correction_reason   text,
  override_monotonic  boolean not null default false,  -- Admin-Notausgang

  note                text,
  -- Idempotenz fuer die Offline-Warteschlange (PWA): verhindert Doppelbuchungen
  client_request_id   uuid unique,

  recorded_by         uuid references profiles(id),
  recorded_at         timestamptz not null default now(),

  constraint reading_correction_complete check (
    source <> 'correction'
    or (corrects_reading_id is not null and length(btrim(correction_reason)) > 0)
  ),
  constraint reading_no_self_reference check (
    id <> corrects_reading_id and id <> superseded_by_id
  )
);

-- Pro Bahn und Tag genau eine gueltige Ablesung
create unique index frame_readings_one_active_per_day
  on frame_readings (lane_id, reading_date) where superseded_by_id is null;

create index frame_readings_lane_date_idx
  on frame_readings (lane_id, reading_date desc) where superseded_by_id is null;

create index frame_readings_epoch_idx on frame_readings (epoch_id);

-- --- Trigger: kumulativen Wert berechnen und Konsistenz erzwingen -----------
create or replace function public.frame_readings_prepare()
returns trigger language plpgsql as $$
declare
  ep        lane_counter_epochs%rowtype;
  prev_cum  bigint;
  next_cum  bigint;
begin
  select * into ep from lane_counter_epochs where id = new.epoch_id;
  if not found then
    raise exception 'Zaehler-Epoche % existiert nicht', new.epoch_id;
  end if;
  if ep.lane_id <> new.lane_id then
    raise exception 'Zaehler-Epoche gehoert zu einer anderen Bahn';
  end if;
  if new.reading_date < ep.effective_from then
    raise exception 'Ablesedatum % liegt vor Beginn der Zaehler-Epoche (%)',
      new.reading_date, ep.effective_from;
  end if;
  if new.raw_value < ep.counter_start then
    raise exception 'Abgelesener Wert % liegt unter dem Startwert der Epoche (%)',
      new.raw_value, ep.counter_start;
  end if;

  new.cumulative_frames := ep.cumulative_offset + (new.raw_value - ep.counter_start);

  -- Monotonie ueber alle gueltigen Ablesungen der Bahn (epochenuebergreifend!)
  if not new.override_monotonic and new.superseded_by_id is null then
    select fr.cumulative_frames into prev_cum
      from frame_readings fr
     where fr.lane_id = new.lane_id
       and fr.superseded_by_id is null
       and fr.id <> new.id
       and fr.reading_date < new.reading_date
     order by fr.reading_date desc limit 1;

    if prev_cum is not null and new.cumulative_frames < prev_cum then
      raise exception
        'Neuer Stand (% kumuliert) liegt unter dem vorherigen Stand (%). '
        'Bei Zaehlerwechsel bitte eine neue Zaehler-Epoche anlegen.',
        new.cumulative_frames, prev_cum;
    end if;

    select fr.cumulative_frames into next_cum
      from frame_readings fr
     where fr.lane_id = new.lane_id
       and fr.superseded_by_id is null
       and fr.id <> new.id
       and fr.reading_date > new.reading_date
     order by fr.reading_date asc limit 1;

    if next_cum is not null and new.cumulative_frames > next_cum then
      raise exception
        'Stand (% kumuliert) liegt ueber der spaeteren Ablesung (%).',
        new.cumulative_frames, next_cum;
    end if;
  end if;

  return new;
end $$;

create trigger trg_frame_readings_prepare
  before insert or update on frame_readings
  for each row execute function public.frame_readings_prepare();

-- =============================================================================
--  7. Wartungstypen & Aufgaben
-- =============================================================================

create table maintenance_types (
  id                  uuid primary key default gen_random_uuid(),
  code                text   not null unique,           -- '25k', '50k', ...
  name_de             text   not null,
  interval_frames     bigint not null check (interval_frames > 0),
  -- Zusaetzliches Kalenderintervall: faellig ist, was zuerst eintritt.
  -- NULL = keine zeitliche Begrenzung.
  max_interval_days   int    check (max_interval_days > 0),
  cascades_to_smaller boolean not null default true,
  sort_order          int    not null,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table maintenance_tasks (
  id                  uuid primary key default gen_random_uuid(),
  maintenance_type_id uuid not null references maintenance_types(id) on delete restrict,
  code                text not null,
  title_de            text not null,
  title_en            text,
  description         text,
  scope               task_scope not null default 'lane',
  sort_order          int  not null,
  active              boolean not null default true,   -- nie loeschen, nur deaktivieren
  valid_from          date not null default current_date,
  valid_to            date,
  created_at          timestamptz not null default now(),
  unique (maintenance_type_id, code)
);

create index maintenance_tasks_type_idx
  on maintenance_tasks (maintenance_type_id, sort_order) where active;

-- =============================================================================
--  8. Durchgefuehrte Wartungen  (Wahrheit fuer den "letzten Wartungsstand")
-- =============================================================================

create table maintenance_records (
  id                     uuid primary key default gen_random_uuid(),
  lane_id                uuid   not null references lanes(id) on delete cascade,
  maintenance_type_id    uuid   not null references maintenance_types(id) on delete restrict,

  performed_on           date   not null,           -- kann rueckdatiert sein
  cumulative_frames      bigint not null check (cumulative_frames >= 0),
  raw_value              bigint,                    -- Rohablesung zur Nachvollziehbarkeit
  epoch_id               uuid references lane_counter_epochs(id) on delete set null,

  employee_profile_id    uuid references profiles(id),
  employee_name          text,                      -- Fallback fuer Aushilfen
  notes                  text,

  source                 record_source not null default 'manual',
  -- bei source='cascade': aus welcher groesseren Wartung abgeleitet
  derived_from_record_id uuid references maintenance_records(id) on delete set null,
  -- true, wenn nicht alle Aufgaben erledigt wurden (dann ist notes Pflicht)
  has_deviation          boolean not null default false,

  -- Stornierung statt Loeschung
  voided_at              timestamptz,
  voided_by              uuid references profiles(id),
  void_reason            text,

  client_request_id      uuid unique,               -- Offline-Idempotenz
  created_by             uuid references profiles(id),
  created_at             timestamptz not null default now(),

  constraint record_employee_present check (
    employee_profile_id is not null or length(btrim(employee_name)) > 0
  ),
  constraint record_void_needs_reason check (
    voided_at is null or length(btrim(void_reason)) > 0
  ),
  constraint record_deviation_needs_note check (
    has_deviation = false or length(btrim(notes)) > 0
  ),
  constraint record_cascade_has_origin check (
    source <> 'cascade' or derived_from_record_id is not null
  )
);

-- Der Anker-Lookup (letzte gueltige Wartung je Bahn und Typ) laeuft hierueber:
create index maintenance_records_anchor_idx
  on maintenance_records (lane_id, maintenance_type_id, cumulative_frames desc, performed_on desc)
  where voided_at is null;

create index maintenance_records_history_idx
  on maintenance_records (performed_on desc) where voided_at is null;

create index maintenance_records_employee_idx on maintenance_records (employee_profile_id);

-- Aufgaben-Snapshot: friert Titel und Intervall zum Zeitpunkt der Durchfuehrung
-- ein, damit spaetere Aenderungen die Historie nicht rueckwirkend veraendern.
create table maintenance_record_tasks (
  record_id                uuid not null references maintenance_records(id) on delete cascade,
  task_id                  uuid not null references maintenance_tasks(id) on delete restrict,
  result                   task_result not null,
  task_title_snapshot      text   not null,
  interval_frames_snapshot bigint not null,
  scope_snapshot           task_scope not null default 'lane',
  note                     text,
  primary key (record_id, task_id)
);

create index maintenance_record_tasks_task_idx on maintenance_record_tasks (task_id);

-- =============================================================================
--  9. Defekte / Stoerungen
-- -----------------------------------------------------------------------------
--  Modeluebergreifend gedacht: spaeter soll auch ein Counter-Mitarbeiter einen
--  Defekt melden koennen ("Bahn 12 macht Geraeusche"), ohne Zugriff auf die
--  Wartungsplanung zu haben. Deshalb eigene Rechte, nicht an 'maintenance'
--  gekoppelt.
-- =============================================================================

create table lane_issues (
  id                uuid primary key default gen_random_uuid(),
  lane_id           uuid references lanes(id) on delete set null,  -- NULL = centerweit
  title             text not null check (length(btrim(title)) > 0),
  description       text,
  severity          issue_severity not null default 'medium',
  status            issue_status   not null default 'open',
  reported_by       uuid references profiles(id),
  reported_at       timestamptz not null default now(),
  cumulative_frames bigint,                                   -- Stand bei Meldung
  resolved_at       timestamptz,
  resolved_by       uuid references profiles(id),
  resolution_note   text,
  -- optionale Verknuepfung: im Rahmen dieser Wartung erledigt
  resolved_record_id uuid references maintenance_records(id) on delete set null,
  client_request_id uuid unique,
  updated_at        timestamptz not null default now(),
  constraint issue_resolved_consistent check (
    (status = 'resolved') = (resolved_at is not null)
  )
);

create index lane_issues_open_idx on lane_issues (status, severity desc, reported_at desc)
  where status <> 'resolved';
create index lane_issues_lane_idx on lane_issues (lane_id, reported_at desc);

create table lane_issue_attachments (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references lane_issues(id) on delete cascade,
  storage_path text not null,          -- Supabase Storage Bucket 'issue-photos'
  mime_type    text,
  uploaded_by  uuid references profiles(id),
  uploaded_at  timestamptz not null default now()
);

create index lane_issue_attachments_issue_idx on lane_issue_attachments (issue_id);

-- =============================================================================
-- 10. Audit-Log
-- =============================================================================

create table audit_log (
  id         bigserial primary key,
  table_name text        not null,
  row_id     uuid,
  action     text        not null,       -- INSERT | UPDATE | DELETE
  actor_id   uuid references profiles(id),
  at         timestamptz not null default now(),
  before     jsonb,
  after      jsonb
);

create index audit_log_row_idx   on audit_log (table_name, row_id, at desc);
create index audit_log_actor_idx on audit_log (actor_id, at desc);

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  rid := case tg_op when 'DELETE' then (to_jsonb(old)->>'id')::uuid
                    else (to_jsonb(new)->>'id')::uuid end;
  insert into audit_log (table_name, row_id, action, actor_id, before, after)
  values (
    tg_table_name, rid, tg_op, auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_frame_readings      after insert or update or delete on frame_readings
  for each row execute function public.write_audit_log();
create trigger audit_maintenance_records after insert or update or delete on maintenance_records
  for each row execute function public.write_audit_log();
create trigger audit_counter_epochs      after insert or update or delete on lane_counter_epochs
  for each row execute function public.write_audit_log();
create trigger audit_maintenance_types   after insert or update or delete on maintenance_types
  for each row execute function public.write_audit_log();
create trigger audit_maintenance_tasks   after insert or update or delete on maintenance_tasks
  for each row execute function public.write_audit_log();
create trigger audit_lanes               after insert or update or delete on lanes
  for each row execute function public.write_audit_log();

-- =============================================================================
-- 11. Views  (nur Fakten, keine Faelligkeitsbewertung)
-- -----------------------------------------------------------------------------
--  WICHTIG: alle Views mit security_invoker = true.
--  Ohne diese Angabe laufen Views mit den Rechten ihres Erstellers (postgres)
--  und umgehen damit die RLS-Policies der zugrunde liegenden Tabellen — ein
--  Benutzer ohne Recht auf das Modul 'maintenance' koennte ueber die View
--  trotzdem alles lesen. Mit security_invoker greifen die Policies des
--  aufrufenden Benutzers.
-- =============================================================================

-- Aktueller Stand je Bahn
create or replace view v_lane_current_state with (security_invoker = true) as
select
  l.id                as lane_id,
  l.lane_number,
  l.status,
  l.pair_id,
  e.id                as current_epoch_id,
  r.id                as last_reading_id,
  r.reading_date      as last_reading_date,
  r.raw_value         as last_raw_value,
  r.cumulative_frames as current_frames
from lanes l
left join lateral (
  select * from lane_counter_epochs ep
   where ep.lane_id = l.id
   order by ep.effective_from desc, ep.created_at desc
   limit 1
) e on true
left join lateral (
  select * from frame_readings fr
   where fr.lane_id = l.id and fr.superseded_by_id is null
   order by fr.reading_date desc
   limit 1
) r on true;

-- Letzter Wartungsstand je Bahn und Wartungstyp.
-- anchor_frames IS NULL  =>  Wartungsstand unbekannt (NICHT als 0 behandeln!)
create or replace view v_lane_maintenance_anchor with (security_invoker = true) as
select
  l.id  as lane_id,
  mt.id as maintenance_type_id,
  mt.code,
  mt.interval_frames,
  mt.max_interval_days,
  rec.id                as anchor_record_id,
  rec.cumulative_frames as anchor_frames,
  rec.performed_on      as anchor_date,
  rec.source            as anchor_source
from lanes l
cross join maintenance_types mt
left join lateral (
  select * from maintenance_records mr
   where mr.lane_id = l.id
     and mr.maintenance_type_id = mt.id
     and mr.voided_at is null
   order by mr.cumulative_frames desc, mr.performed_on desc
   limit 1
) rec on true
where mt.active;

-- Gleitende Wochenrate je Bahn (Basis fuer Prognose und Plausibilitaetspruefung)
create or replace view v_lane_weekly_rate with (security_invoker = true) as
with ranked as (
  select lane_id, reading_date, cumulative_frames,
         row_number() over (partition by lane_id order by reading_date desc) as rn
    from frame_readings
   where superseded_by_id is null
),
win as (
  select lane_id,
         count(*)                as readings_used,
         min(reading_date)       as from_date,
         max(reading_date)       as to_date,
         min(cumulative_frames)  as from_frames,
         max(cumulative_frames)  as to_frames
    from ranked
   where rn <= (select rate_window_readings from maintenance_settings)
   group by lane_id
)
select
  lane_id, readings_used, from_date, to_date,
  case when to_date > from_date
       then round((to_frames - from_frames)::numeric * 7.0 / (to_date - from_date))::bigint
  end as frames_per_week
from win;

-- =============================================================================
-- 12. Row Level Security
-- =============================================================================

-- Zugriff ist modulbasiert: wer kein Recht auf das Modul 'maintenance' hat
-- (z.B. spaetere Counter-Mitarbeiter), sieht von diesen Tabellen gar nichts.

alter table profiles                 enable row level security;
alter table app_settings             enable row level security;
alter table app_modules              enable row level security;
alter table role_module_access       enable row level security;
alter table user_module_access       enable row level security;
alter table maintenance_settings     enable row level security;
alter table lane_pairs               enable row level security;
alter table lanes                    enable row level security;
alter table lane_counter_epochs      enable row level security;
alter table frame_readings           enable row level security;
alter table maintenance_types        enable row level security;
alter table maintenance_tasks        enable row level security;
alter table maintenance_records      enable row level security;
alter table maintenance_record_tasks enable row level security;
alter table lane_issues              enable row level security;
alter table lane_issue_attachments   enable row level security;
alter table audit_log                enable row level security;

-- --- Plattformweit: jeder angemeldete Mitarbeiter ---------------------------
create policy read_all   on profiles     for select to authenticated using (public.is_staff());
create policy read_all   on app_settings for select to authenticated using (public.is_staff());
create policy read_all   on app_modules  for select to authenticated using (public.is_staff());
create policy read_own   on user_module_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy read_roles on role_module_access for select to authenticated using (public.is_staff());
create policy read_admin on audit_log    for select to authenticated using (public.is_admin());

-- Eigenen Anzeigenamen pflegen (Rollenwechsel nur durch Admin)
create policy update_own_profile on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_app_role());

-- --- Modul 'maintenance': Lesen ---------------------------------------------
create policy read_module on maintenance_settings     for select to authenticated using (public.has_module('maintenance'));
create policy read_module on lane_pairs               for select to authenticated using (public.has_module('maintenance'));
create policy read_module on lanes                    for select to authenticated using (public.has_module('maintenance'));
create policy read_module on lane_counter_epochs      for select to authenticated using (public.has_module('maintenance'));
create policy read_module on frame_readings           for select to authenticated using (public.has_module('maintenance'));
create policy read_module on maintenance_types        for select to authenticated using (public.has_module('maintenance'));
create policy read_module on maintenance_tasks        for select to authenticated using (public.has_module('maintenance'));
create policy read_module on maintenance_records      for select to authenticated using (public.has_module('maintenance'));
create policy read_module on maintenance_record_tasks for select to authenticated using (public.has_module('maintenance'));

-- --- Modul 'maintenance': Tagesgeschaeft des Mechanikers --------------------
-- Ablesungen anlegen (nur regulaere, keine Korrekturen)
create policy insert_reading on frame_readings for insert to authenticated
  with check (public.can_write_module('maintenance')
              and source in ('weekly','initial')
              and override_monotonic = false);

-- Zaehlerwechsel darf am Geraet gemeldet werden, aber nicht nachtraeglich veraendert
create policy insert_epoch on lane_counter_epochs for insert to authenticated
  with check (public.can_write_module('maintenance') and reason <> 'correction');

create policy insert_record on maintenance_records for insert to authenticated
  with check (public.can_write_module('maintenance') and voided_at is null);

create policy insert_record_tasks on maintenance_record_tasks for insert to authenticated
  with check (public.can_write_module('maintenance'));

-- --- Defekte: modeluebergreifend (Wartung ODER Counter) ---------------------
create policy read_issue on lane_issues for select to authenticated
  using (public.has_module('maintenance') or public.has_module('counter'));
create policy insert_issue on lane_issues for insert to authenticated
  with check (public.can_write_module('maintenance') or public.can_write_module('counter'));
create policy update_issue on lane_issues for update to authenticated
  using (public.can_write_module('maintenance') or public.can_write_module('counter'))
  with check (public.can_write_module('maintenance') or public.can_write_module('counter'));

create policy read_attachment on lane_issue_attachments for select to authenticated
  using (public.has_module('maintenance') or public.has_module('counter'));
create policy insert_attachment on lane_issue_attachments for insert to authenticated
  with check (public.can_write_module('maintenance') or public.can_write_module('counter'));

-- --- Admin: Korrekturen, Konfiguration, Benutzerverwaltung ------------------
create policy admin_all on lanes                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on lane_pairs           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on maintenance_types    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on maintenance_tasks    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on maintenance_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on app_settings         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on app_modules          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on role_module_access   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on user_module_access   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on profiles             for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Korrektur einer Ablesung: neue Zeile mit source='correction' + Markierung der alten
create policy admin_correct_reading on frame_readings for insert to authenticated
  with check (public.is_admin());
create policy admin_update_reading  on frame_readings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy admin_update_epoch on lane_counter_epochs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Wartung stornieren (nie loeschen)
create policy admin_update_record on maintenance_records for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Bewusst KEINE delete-Policies: nichts in diesem Datenbestand wird geloescht.

-- =============================================================================
-- 13. Storage-Bucket fuer Defekt-Fotos
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('issue-photos', 'issue-photos', false)
on conflict (id) do nothing;

create policy "read issue photos" on storage.objects for select to authenticated
  using (bucket_id = 'issue-photos'
         and (public.has_module('maintenance') or public.has_module('counter')));

create policy "upload issue photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-photos'
              and (public.can_write_module('maintenance') or public.can_write_module('counter')));
