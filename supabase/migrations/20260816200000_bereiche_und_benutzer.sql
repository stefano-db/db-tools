-- =============================================================================
--  Bereiche, Leitung und Anmeldung per Benutzername
-- -----------------------------------------------------------------------------
--  Bisher gab es eine flache Rolle (mechanic / counter / admin). Gebraucht
--  werden drei voneinander unabhaengige Eigenschaften:
--
--    Bereich    mechanik | counter | service   -> steuert die Werkzeuge
--    Leitung    ja/nein                        -> darf den eigenen Bereich verwalten
--    Admin      ja/nein                        -> darf alles
--
--  Eine Bereichsleitung ist kein Admin, und ein Admin muss keinem Bereich
--  angehoeren. Deshalb drei Felder statt einer Rolle.
--
--  Anmeldung: Mitarbeiter melden sich mit einem Benutzernamen an, nicht mit
--  einer E-Mail-Adresse. Supabase braucht intern trotzdem eine — deshalb bekommt
--  jeder Benutzername eine feste technische Adresse
--  (<benutzername>@dreambowl.intern). Die sieht niemand; angezeigt wird immer
--  der Klarname. Administratoren melden sich weiterhin mit ihrer echten
--  E-Mail-Adresse an, damit sie ihr Passwort selbst zuruecksetzen koennen.
-- =============================================================================

create type department as enum ('mechanik', 'counter', 'service');

alter table profiles
  add column if not exists username   text unique,
  add column if not exists department department,
  add column if not exists is_lead    boolean not null default false,
  add column if not exists is_admin   boolean not null default false;

comment on column profiles.username is
  'Anmeldename der Mitarbeiter. Die technische E-Mail lautet '
  '<username>@dreambowl.intern und wird nie angezeigt.';
comment on column profiles.display_name is
  'Klarname. Wird ueberall angezeigt und in jede Wartung geschrieben.';
comment on column profiles.is_lead is
  'Bereichsleitung: darf Mitarbeiter des eigenen Bereichs anlegen und deren '
  'Rechte setzen — aber niemanden zum Administrator machen.';

create index profiles_department_idx on profiles (department) where active;

-- Bestehende Konten uebernehmen
update profiles set is_admin = true                where role = 'admin';
update profiles set department = 'mechanik'        where role = 'mechanic' and department is null;
update profiles set department = 'counter'         where role = 'counter'  and department is null;

-- =============================================================================
--  Werkzeuge je Bereich (loest role_module_access ab)
-- =============================================================================

create table department_module_access (
  department department not null,
  module_key text       not null references app_modules(key) on delete cascade,
  can_write  boolean    not null default true,
  primary key (department, module_key)
);

insert into department_module_access (department, module_key, can_write) values
  ('mechanik', 'maintenance', true),
  ('counter',  'urkunden',    true),
  ('service',  'urkunden',    true)
on conflict do nothing;

alter table department_module_access enable row level security;
create policy read_all  on department_module_access for select to authenticated using (public.is_staff());
create policy admin_all on department_module_access for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
--  Rechteprüfung neu: Bereich + persoenliche Ausnahmen
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_admin from profiles where id = auth.uid() and active), false) $$;

create or replace function public.is_lead()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_lead from profiles where id = auth.uid() and active), false) $$;

create or replace function public.my_department()
returns department
language sql stable security definer set search_path = public
as $$ select department from profiles where id = auth.uid() and active $$;

create or replace function public.has_module(p_module text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    -- Persoenliche Freigabe schlaegt den Bereich, in beide Richtungen
    when exists (select 1 from user_module_access u
                  where u.user_id = auth.uid() and u.module_key = p_module)
      then (select u.granted from user_module_access u
             where u.user_id = auth.uid() and u.module_key = p_module)
    else exists (select 1 from department_module_access d
                  where d.department = public.my_department() and d.module_key = p_module)
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
    else exists (select 1 from department_module_access d
                  where d.department = public.my_department()
                    and d.module_key = p_module and d.can_write)
  end
$$;

-- =============================================================================
--  Neue Konten bekommen KEINE Rechte
-- -----------------------------------------------------------------------------
--  Wichtig: Supabase erlaubt mit dem oeffentlichen Schluessel grundsaetzlich
--  Selbstregistrierung. Wuerde ein neues Profil automatisch einem Bereich
--  zugeordnet, koennte sich jeder Fremde Zugriff verschaffen. Neue Konten haben
--  deshalb keinen Bereich und sehen nichts, bis jemand sie zuweist.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_user text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  v_user := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');

  -- Technische Adressen (<name>@dreambowl.intern) liefern den Benutzernamen mit.
  if v_user is null and new.email like '%@dreambowl.intern' then
    v_user := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, display_name, username, department, is_lead, is_admin)
  values (new.id, coalesce(v_name, v_user, split_part(new.email, '@', 1)), v_user, null, false, false);
  return new;
end $$;

-- =============================================================================
--  Benutzerverwaltung: wer darf wen aendern
-- =============================================================================

drop policy if exists update_own_profile on profiles;
drop policy if exists admin_all on profiles;

-- Eigener Anzeigename bleibt aenderbar, Rechte nicht.
create policy update_own_profile on profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_admin   = (select p.is_admin   from profiles p where p.id = auth.uid())
    and is_lead    = (select p.is_lead    from profiles p where p.id = auth.uid())
    and department is not distinct from (select p.department from profiles p where p.id = auth.uid())
  );

create policy admin_manage on profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Bereichsleitung verwaltet den eigenen Bereich — darf aber niemanden zum
-- Administrator machen und niemanden aus einem fremden Bereich anfassen.
create policy lead_manage on profiles for update to authenticated
  using (public.is_lead() and department = public.my_department() and is_admin = false)
  with check (public.is_lead() and department = public.my_department() and is_admin = false);

-- Persoenliche Freigaben darf ebenfalls die Leitung des Bereichs setzen.
create policy lead_module_access on user_module_access for all to authenticated
  using (
    public.is_lead()
    and exists (select 1 from profiles p
                 where p.id = user_module_access.user_id
                   and p.department = public.my_department()
                   and p.is_admin = false)
  )
  with check (
    public.is_lead()
    and exists (select 1 from profiles p
                 where p.id = user_module_access.user_id
                   and p.department = public.my_department()
                   and p.is_admin = false)
  );

-- role wird nicht mehr ausgewertet; die Spalte bleibt vorerst stehen, damit
-- nichts bricht, und verschwindet in einer spaeteren Migration.
comment on column profiles.role is
  'Veraltet. Ersetzt durch department, is_lead und is_admin.';
