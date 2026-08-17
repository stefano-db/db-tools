-- =============================================================================
--  Modul "Dokumente" — Druckvorlagen für den Counter
-- -----------------------------------------------------------------------------
--  Zweck ist nicht das Ablegen von Dateien, sondern das wiederholte Ausdrucken
--  derselben Unterlagen. Deshalb:
--    - Kategorien, damit man das Gesuchte findet statt zu scrollen
--    - Zaehler, wann und wie oft zuletzt gedruckt wurde: was nie gedruckt wird,
--      ist veraltet und kann weg; was oft gebraucht wird, gehoert nach oben
--    - Archivieren statt Loeschen, damit nichts unabsichtlich verschwindet
-- =============================================================================

create table documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  description   text,
  /** Freier Ordnername, z. B. "Preislisten" oder "Formulare". */
  category      text,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0),

  -- Nutzung: zeigt, was wirklich gebraucht wird.
  print_count      int not null default 0,
  last_printed_at  timestamptz,

  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  -- Archiviert statt geloescht; die Datei bleibt im Speicher liegen.
  archived_at   timestamptz,
  archived_by   uuid references profiles(id)
);

create index documents_category_idx on documents (category, title) where archived_at is null;
create index documents_used_idx     on documents (last_printed_at desc nulls last) where archived_at is null;

alter table documents enable row level security;

create policy read_module on documents for select to authenticated
  using (public.has_module('dokumente'));
create policy write_module on documents for all to authenticated
  using (public.can_write_module('dokumente'))
  with check (public.can_write_module('dokumente'));

-- --- Dateiablage -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dokumente', 'dokumente', false,
  26214400, -- 25 MB; groessere Dateien sind zum Drucken ohnehin unhandlich
  array[
    'image/jpeg', 'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "read dokumente" on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and public.has_module('dokumente'));
create policy "write dokumente" on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumente' and public.can_write_module('dokumente'));
create policy "delete dokumente" on storage.objects for delete to authenticated
  using (bucket_id = 'dokumente' and public.can_write_module('dokumente'));

-- --- Druckzähler -------------------------------------------------------------
-- Eigene Funktion, damit auch jemand mit reinem Leserecht mitzaehlen kann:
-- Drucken ist kein Aendern der Unterlage.
create or replace function public.document_printed(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_module('dokumente') then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  update documents
     set print_count     = print_count + 1,
         last_printed_at = now()
   where id = p_id;
end $$;

revoke all on function public.document_printed(uuid) from public;
grant execute on function public.document_printed(uuid) to authenticated;

-- --- Modul eintragen ---------------------------------------------------------
insert into app_modules (key, name_de, path, icon, sort_order, active)
values ('dokumente', 'Dokumente', '/dokumente', 'folder', 30, true)
on conflict (key) do update
  set name_de = excluded.name_de, path = excluded.path,
      icon = excluded.icon, sort_order = excluded.sort_order, active = excluded.active;

insert into department_module_access (department, module_key, can_write) values
  ('counter',  'dokumente', true),
  ('service',  'dokumente', true),
  ('mechanik', 'dokumente', false)   -- ansehen und drucken, aber nichts hochladen
on conflict (department, module_key) do update set can_write = excluded.can_write;
