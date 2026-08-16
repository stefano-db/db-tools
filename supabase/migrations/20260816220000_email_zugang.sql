-- =============================================================================
--  E-Mail-Zugang zusätzlich zum Benutzernamen
-- -----------------------------------------------------------------------------
--  Wer eine echte E-Mail-Adresse hinterlegt, kann sich damit anmelden und sein
--  Passwort selbst zurücksetzen. Wer keine hat, meldet sich weiter mit dem
--  Benutzernamen an — beides funktioniert nebeneinander.
--
--  Technisch kennt Supabase pro Konto genau eine Adresse. Ist eine echte
--  hinterlegt, ist sie es; sonst bleibt die technische <name>@dreambowl.intern.
--  Damit die Anmeldung per Benutzername in beiden Fällen klappt, gibt es eine
--  Funktion, die zum Benutzernamen die zugehörige Adresse liefert.
-- =============================================================================

alter table profiles
  add column if not exists email text;

comment on column profiles.email is
  'Echte E-Mail-Adresse, falls vorhanden. Technische Adressen '
  '(<name>@dreambowl.intern) stehen hier nicht — sie sind keine erreichbare Post.';

-- Bestehende Konten übernehmen, technische Adressen ausgenommen.
update profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and u.email not like '%@dreambowl.intern'
   and p.email is null;

-- =============================================================================
--  Anmeldung per Benutzername
-- -----------------------------------------------------------------------------
--  Wird vor der Anmeldung aufgerufen, muss also ohne Sitzung erreichbar sein.
--  Sie gibt ausschliesslich die Adresse zurueck, mit der sich das Konto anmeldet
--  — kein Name, kein Bereich, keine Rechte. Bei unbekanntem Benutzernamen kommt
--  NULL zurueck; die Anwendung meldet dann dieselbe allgemeine Fehlermeldung wie
--  bei falschem Passwort, damit sich Konten nicht durchprobieren lassen.
-- =============================================================================

create or replace function public.login_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
    from profiles p
    join auth.users u on u.id = p.id
   where p.username = lower(btrim(p_username))
     and p.active
$$;

revoke all on function public.login_email_for_username(text) from public;
grant execute on function public.login_email_for_username(text) to anon, authenticated;

-- =============================================================================
--  E-Mail-Adresse setzen oder entfernen
-- -----------------------------------------------------------------------------
--  Aendert die Adresse, mit der sich ein Konto anmeldet. Gleiche Rechteregel wie
--  beim Passwort: Administratoren jedes Konto, Bereichsleitungen nur den eigenen
--  Bereich und nie das Konto eines Admins.
-- =============================================================================

create or replace function public.admin_set_email(
  p_user_id uuid,
  p_email   text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target  profiles%rowtype;
  v_address text := nullif(lower(btrim(p_email)), '');
begin
  select * into v_target from profiles where id = p_user_id;
  if not found then
    raise exception 'Konto nicht gefunden.';
  end if;

  if not (
    public.is_admin()
    or (
      public.is_lead()
      and v_target.department is not null
      and v_target.department = public.my_department()
      and v_target.is_admin = false
    )
  ) then
    raise exception 'Keine Berechtigung, diese Adresse zu aendern.' using errcode = '42501';
  end if;

  if v_address is not null and v_address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Das sieht nicht nach einer E-Mail-Adresse aus.';
  end if;

  if v_address is null then
    -- Ohne echte Adresse zurueck auf die technische; sonst koennte sich das
    -- Konto ueberhaupt nicht mehr anmelden.
    if v_target.username is null then
      raise exception 'Ohne Benutzernamen kann die E-Mail-Adresse nicht entfernt werden.';
    end if;
    v_address := v_target.username || '@dreambowl.intern';
  end if;

  if exists (select 1 from auth.users where email = v_address and id <> p_user_id) then
    raise exception 'Diese Adresse wird bereits verwendet.';
  end if;

  update auth.users
     set email              = v_address,
         -- Ohne Bestaetigung waere die Anmeldung gesperrt; die Adresse vergibt
         -- ohnehin eine verantwortliche Person, nicht der Mitarbeiter selbst.
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = p_user_id;

  update profiles
     set email      = case when v_address like '%@dreambowl.intern' then null else v_address end,
         updated_at = now()
   where id = p_user_id;
end $$;

comment on function public.admin_set_email(uuid, text) is
  'Setzt die Anmeldeadresse eines Kontos. Leer bedeutet: zurueck auf die '
  'technische Adresse aus dem Benutzernamen.';

revoke all on function public.admin_set_email(uuid, text) from public;
grant execute on function public.admin_set_email(uuid, text) to authenticated;

-- Neue Konten: echte Adresse mitschreiben, technische nicht.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_user text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  v_user := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');

  if v_user is null and new.email like '%@dreambowl.intern' then
    v_user := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, display_name, username, email, department, is_lead, is_admin)
  values (
    new.id,
    coalesce(v_name, v_user, split_part(new.email, '@', 1)),
    v_user,
    case when new.email like '%@dreambowl.intern' then null else new.email end,
    null, false, false
  );
  return new;
end $$;
