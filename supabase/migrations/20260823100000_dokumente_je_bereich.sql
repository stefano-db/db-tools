-- =============================================================================
--  Dokumente je Bereich
-- -----------------------------------------------------------------------------
--  Bisher lagen alle Unterlagen auf einem Haufen. Das ging, solange es die
--  Druckvorlagen des Counters waren; mit drei Bereichen wird daraus eine Liste,
--  in der jeder an neunzig Prozent vorbeiscrollt, die ihn nichts angehen.
--
--  Jeder Bereich bekommt deshalb seinen eigenen Ablageort — getrennt bis in den
--  Dateispeicher hinein, nicht nur in der Anzeige. Getrennt heisst hier
--  wirklich getrennt: Wer in der Mechanik arbeitet, bekommt die Unterlagen des
--  Service nicht zu sehen und kann sie auch nicht herunterladen, wenn er die
--  Adresse kennt. Die Datenbank entscheidet das, nicht das Programm im Browser.
--
--  NULL bleibt erlaubt und heisst „geht alle an": Aushänge, Hausordnung,
--  Notrufnummern. Aendern darf die nur die Geschaeftsfuehrung — sonst traegt
--  jeder Bereich dort ein, was er fuer wichtig haelt, und der gemeinsame Teil
--  verkommt zum zweiten Haufen.
-- =============================================================================

alter table documents add column if not exists bereich department;

comment on column documents.bereich is
  'Bereich, dem die Unterlage gehoert. NULL heisst: geht alle an.';

-- Der Altbestand behaelt NULL und bleibt damit fuer alle sichtbar. Ihn
-- stillschweigend dem Counter zuzuschlagen hiesse, ihn den anderen wegzunehmen.

create index if not exists documents_bereich_idx
  on documents (bereich, category, title) where archived_at is null;

-- --- Wer was sieht -----------------------------------------------------------
drop policy if exists read_module on documents;
create policy read_module on documents for select to authenticated
  using (
    public.has_module('dokumente')
    and (
      bereich is null
      or public.is_admin()
      or bereich = public.my_department()
    )
  );

-- Schreiben nur im eigenen Bereich. Der gemeinsame Teil (NULL) gehoert der
-- Geschaeftsfuehrung; ohne diese Einschraenkung waere er in einem halben Jahr
-- der zweite Haufen.
drop policy if exists write_module on documents;
create policy write_module on documents for all to authenticated
  using (
    public.can_write_module('dokumente')
    and (public.is_admin() or (bereich is not null and bereich = public.my_department()))
  )
  with check (
    public.can_write_module('dokumente')
    and (public.is_admin() or (bereich is not null and bereich = public.my_department()))
  );

-- --- Dateiablage -------------------------------------------------------------
--  Der Bereich steht im Pfad: "mechanik/<zufall>-<name>". Damit traegt schon
--  der Speicher die Trennung, und eine unterschriebene Adresse laesst sich
--  nicht auf einen fremden Bereich umbiegen.
--
--  Der Altbestand liegt flach, ohne Ordner. Er zaehlt als gemeinsam — dasselbe,
--  was oben NULL bedeutet.
create or replace function public.dokument_bereich_passt(p_name text)
returns boolean
language sql stable security definer set search_path = public, storage
as $$
  select case
    when public.is_admin() then true
    -- Ohne Ordner: Altbestand, gehoert allen.
    when coalesce(array_length(storage.foldername(p_name), 1), 0) = 0 then true
    when (storage.foldername(p_name))[1] = 'alle' then true
    else (storage.foldername(p_name))[1] = public.my_department()::text
  end
$$;

comment on function public.dokument_bereich_passt(text) is
  'Darf der Angemeldete an diese Datei? Der erste Ordner im Pfad ist der '
  'Bereich; ohne Ordner gilt die Datei als gemeinsam.';

revoke all on function public.dokument_bereich_passt(text) from public;
grant execute on function public.dokument_bereich_passt(text) to authenticated;

drop policy if exists "read dokumente" on storage.objects;
create policy "read dokumente" on storage.objects for select to authenticated
  using (
    bucket_id = 'dokumente'
    and public.has_module('dokumente')
    and public.dokument_bereich_passt(name)
  );

-- Hochladen und Loeschen nur im eigenen Ordner. 'alle' bleibt der
-- Geschaeftsfuehrung vorbehalten, deshalb hier die engere Pruefung.
drop policy if exists "write dokumente" on storage.objects;
create policy "write dokumente" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dokumente'
    and public.can_write_module('dokumente')
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.my_department()::text
    )
  );

drop policy if exists "delete dokumente" on storage.objects;
create policy "delete dokumente" on storage.objects for delete to authenticated
  using (
    bucket_id = 'dokumente'
    and public.can_write_module('dokumente')
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.my_department()::text
    )
  );

-- --- Rechte der Bereiche -----------------------------------------------------
--  Die Mechanik durfte bisher nur ansehen und drucken. Das war richtig, solange
--  alle in denselben Ordner geschrieben haetten; mit eigenem Ablageort kann
--  niemand mehr die Unterlagen eines anderen Bereichs durcheinanderbringen.
insert into department_module_access (department, module_key, can_write) values
  ('counter',  'dokumente', true),
  ('service',  'dokumente', true),
  ('mechanik', 'dokumente', true),
  ('kueche',   'dokumente', true)
on conflict (department, module_key) do update set can_write = excluded.can_write;

-- Der Urkunden-Generator gehoert zum Counter. Der Service hatte ihn bisher mit;
-- das stammt aus der Zeit, als die Bereiche noch nicht scharf getrennt waren.
-- Wer ihn im Service doch braucht, bekommt ihn persoenlich freigeschaltet —
-- user_module_access schlaegt den Bereich, in beide Richtungen.
delete from department_module_access
 where department = 'service' and module_key = 'urkunden';

-- --- Zaehler -----------------------------------------------------------------
--  Der Druckzaehler lief bisher an den Zeilenrechten vorbei: er ist mit
--  Besitzerrechten geschrieben und prueft nur das Modul. Damit koennte jemand
--  fremde Unterlagen mitzaehlen lassen. Harmlos, aber unsauber — und in einer
--  Funktion mit Besitzerrechten hat Unsauberkeit die Angewohnheit zu wachsen.
create or replace function public.document_printed(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bereich department;
  v_gefunden boolean;
begin
  if not public.has_module('dokumente') then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;

  select bereich, true into v_bereich, v_gefunden from documents where id = p_id;
  if not coalesce(v_gefunden, false) then
    return;
  end if;

  if not (v_bereich is null or public.is_admin() or v_bereich = public.my_department()) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;

  update documents
     set print_count     = print_count + 1,
         last_printed_at = now()
   where id = p_id;
end $$;

notify pgrst, 'reload schema';
