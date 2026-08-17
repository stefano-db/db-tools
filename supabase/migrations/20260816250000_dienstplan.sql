-- =============================================================================
--  Modul "Dienstplan"
-- -----------------------------------------------------------------------------
--  Bearbeiten dürfen ausschließlich Bereichsleitungen und Administratoren.
--  Ansehen dürfen alle angemeldeten Mitarbeiter — der Plan ist die Grundlage
--  ihrer Arbeitswoche, niemand darf davon ausgeschlossen sein.
--
--  Die Trennung liegt in der Datenbank, nicht in der Oberfläche: Ein Mitarbeiter
--  ohne Leitungsfunktion bekommt eine Änderung selbst dann nicht durch, wenn er
--  die Anwendung umgeht.
-- =============================================================================

-- --- Mitarbeiter des Plans ---------------------------------------------------
--  Bewusst eine eigene Tabelle und nicht profiles: im Plan stehen auch Personen
--  ohne Zugang zur Plattform (Aushilfen), und umgekehrt hat nicht jedes Konto
--  eine Schicht. Die Verbindung ist optional und wird von Hand gesetzt — nur so
--  ist sie bei gleichen Vornamen verlässlich.
create table roster_employees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  /** Abteilung im Plan: 1..5, Namen und Farben stehen in roster_settings. */
  group_no    int  not null default 1 check (group_no between 1 and 5),
  /** Vertragstage pro Woche, Grundlage für Soll-Ist. */
  target_days numeric(4,1) not null default 0,
  sort_order  int  not null default 0,
  /** Konto dieser Person, falls vorhanden — für „meine Schicht". */
  profile_id  uuid references profiles(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index roster_employees_order_idx on roster_employees (group_no, sort_order) where active;
create unique index roster_employees_profile_idx on roster_employees (profile_id)
  where profile_id is not null and active;

-- --- Wochen ------------------------------------------------------------------
--  Eine Zeile je Woche. Der Inhalt liegt als JSON: die Schichten sind ein
--  Geflecht aus sieben Tagen mit Beginn, Ende, Status und Minuten, das nur im
--  Ganzen Sinn ergibt und immer komplett gelesen und geschrieben wird.
create table roster_weeks (
  week_start  date primary key,
  /** { "<mitarbeiter-id>": { "d": [7 Tage], "tot": "38:30" } } */
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

comment on column roster_weeks.week_start is 'Montag der Woche.';

-- --- Einstellungen -----------------------------------------------------------
create table roster_settings (
  id           boolean primary key default true check (id),
  group_names  jsonb not null default '{}'::jsonb,
  group_colors jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id)
);

insert into roster_settings (id) values (true);

-- --- Gesehen-Markierung ------------------------------------------------------
--  Damit „Dein Plan wurde geändert" nur erscheint, wenn es für diese Person
--  wirklich neu ist.
create table roster_seen (
  user_id    uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  seen_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- =============================================================================
--  Rechte
-- =============================================================================

alter table roster_employees enable row level security;
alter table roster_weeks     enable row level security;
alter table roster_settings  enable row level security;
alter table roster_seen      enable row level security;

-- Ansehen: jeder angemeldete Mitarbeiter, unabhängig vom Bereich.
create policy read_all on roster_employees for select to authenticated using (public.is_staff());
create policy read_all on roster_weeks     for select to authenticated using (public.is_staff());
create policy read_all on roster_settings  for select to authenticated using (public.is_staff());

-- Bearbeiten: Leitung oder Administrator.
create policy edit_lead on roster_employees for all to authenticated
  using (public.is_lead() or public.is_admin())
  with check (public.is_lead() or public.is_admin());
create policy edit_lead on roster_weeks for all to authenticated
  using (public.is_lead() or public.is_admin())
  with check (public.is_lead() or public.is_admin());
create policy edit_lead on roster_settings for update to authenticated
  using (public.is_lead() or public.is_admin())
  with check (public.is_lead() or public.is_admin());

-- Die eigene Gesehen-Markierung pflegt jeder selbst.
create policy own_seen on roster_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
--  Live-Ansicht
-- -----------------------------------------------------------------------------
--  Ohne diese Freigabe erhalten die Fernseher und Handys keine Aktualisierung
--  und zeigen den Stand von vorhin — bei einem Dienstplan die schlechteste
--  Sorte Fehler.
-- =============================================================================
alter publication supabase_realtime add table roster_weeks;
alter publication supabase_realtime add table roster_employees;

-- =============================================================================
--  Modul eintragen
-- =============================================================================
insert into app_modules (key, name_de, path, icon, sort_order, active)
values ('dienstplan', 'Dienstplan', '/dienstplan', 'calendar', 5, true)
on conflict (key) do update
  set name_de = excluded.name_de, path = excluded.path,
      icon = excluded.icon, sort_order = excluded.sort_order, active = excluded.active;

-- Alle Bereiche duerfen ihn sehen. can_write bleibt hier ohne Wirkung: das
-- Bearbeiten haengt an der Leitungsfunktion, nicht am Bereich.
insert into department_module_access (department, module_key, can_write) values
  ('mechanik', 'dienstplan', false),
  ('counter',  'dienstplan', false),
  ('service',  'dienstplan', false)
on conflict (department, module_key) do update set can_write = excluded.can_write;
