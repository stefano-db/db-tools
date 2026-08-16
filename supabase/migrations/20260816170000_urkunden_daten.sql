-- =============================================================================
--  Urkundensystem: Daten in die Datenbank holen
-- -----------------------------------------------------------------------------
--  Bisher lag alles im localStorage des jeweiligen Browsers. Folgen davon:
--  jeder Mitarbeiter sah nur seine eigenen Events, auf einem anderen Geraet war
--  nichts da, und alles aelter als sieben Tage wurde automatisch geloescht —
--  nicht aus fachlichen Gruenden, sondern weil der Browserspeicher volllief.
--
--  Mit diesen Tabellen sehen alle Counter-Mitarbeiter dieselben Events, von
--  jedem Geraet, und nichts verschwindet mehr von allein.
-- =============================================================================

create type cert_event_status as enum ('new', 'imported', 'ranked', 'done');

create table cert_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  event_date  date not null,
  status      cert_event_status not null default 'new',
  /** Wertungsart dieses Events: total, average, best oder g1..gN */
  ranking_mode text not null default 'total',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index cert_events_date_idx on cert_events (event_date desc);

create table cert_players (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references cert_events(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  -- Spielergebnisse in Reihenfolge, z. B. [142, 178, 165].
  -- Als Array, weil die Spielanzahl je Event unterschiedlich ist und die
  -- Auswertung immer die ganze Serie braucht.
  scores     int[] not null default '{}',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create index cert_players_event_idx on cert_players (event_id, sort_order);

-- Erzeugte Urkunden: welcher Spieler auf welchem Platz, wann gedruckt.
create table cert_documents (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references cert_events(id) on delete cascade,
  player_id  uuid references cert_players(id) on delete set null,
  player_name text not null,
  rank       int,
  score      numeric,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index cert_documents_event_idx on cert_documents (event_id, created_at desc);

-- Gestaltung der Urkunde: Hintergrundbild und Textfelder. Gilt fuer das ganze
-- Center, nicht pro Benutzer — sonst druckt jeder ein anderes Layout.
create table cert_settings (
  id             boolean primary key default true check (id),
  background_path text,
  -- Felder mit Position, Groesse, Farbe und Schrift, wie in der Anwendung.
  fields         jsonb not null default '[]'::jsonb,
  default_ranking_mode text not null default 'total',
  locked         boolean not null default false,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id)
);

insert into cert_settings (id) values (true);

-- --- Rechte ------------------------------------------------------------------
alter table cert_events    enable row level security;
alter table cert_players   enable row level security;
alter table cert_documents enable row level security;
alter table cert_settings  enable row level security;

create policy read_module on cert_events    for select to authenticated using (public.has_module('urkunden'));
create policy read_module on cert_players   for select to authenticated using (public.has_module('urkunden'));
create policy read_module on cert_documents for select to authenticated using (public.has_module('urkunden'));
create policy read_module on cert_settings  for select to authenticated using (public.has_module('urkunden'));

create policy write_module on cert_events    for all to authenticated
  using (public.can_write_module('urkunden')) with check (public.can_write_module('urkunden'));
create policy write_module on cert_players   for all to authenticated
  using (public.can_write_module('urkunden')) with check (public.can_write_module('urkunden'));
create policy write_module on cert_documents for all to authenticated
  using (public.can_write_module('urkunden')) with check (public.can_write_module('urkunden'));

-- Das Layout darf nur aendern, wer schreiben darf; geloescht wird es nie.
create policy update_module on cert_settings for update to authenticated
  using (public.can_write_module('urkunden')) with check (public.can_write_module('urkunden'));

-- Hintergrundbilder der Urkunden
insert into storage.buckets (id, name, public)
values ('cert-backgrounds', 'cert-backgrounds', false)
on conflict (id) do nothing;

create policy "read cert backgrounds" on storage.objects for select to authenticated
  using (bucket_id = 'cert-backgrounds' and public.has_module('urkunden'));
create policy "write cert backgrounds" on storage.objects for insert to authenticated
  with check (bucket_id = 'cert-backgrounds' and public.can_write_module('urkunden'));
