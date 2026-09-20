-- =============================================================================
--  Technische Anmeldekennung: weg von .intern
-- -----------------------------------------------------------------------------
--  Mitarbeiter melden sich mit einem Namen an, Supabase braucht dafür eine
--  E-Mail. Gebaut wurde bisher <name>@dreambowl.intern. Diese Endung gibt es im
--  Internet nicht — kein Eintrag, kein Mailserver —, und Supabase prueft das
--  inzwischen: ein Konto ohne echte Adresse liess sich nicht mehr anlegen.
--
--  Genommen wird stattdessen die Adresse des Hauses auf Cloudflare. Sie
--  existiert; hingeschickt wird nie etwas. Sie ist eine Kennung, die einer
--  Adresse aehnlich sehen muss, mehr nicht.
--
--  Die alte Endung bleibt ueberall erkannt: die bestehenden Konten tragen sie,
--  sollen sich weiter anmelden koennen und weiter ohne sichtbare Adresse in
--  der Liste stehen. Umgeschrieben wird nichts — eine laufende Anmeldung
--  anzufassen waere ein Risiko ohne Gegenwert.
--
--  Die beiden Funktionen unten stehen wortgleich wie zuvor da; geaendert sind
--  nur die Stellen, an denen die Endung vorkam.
-- =============================================================================

create or replace function public.ist_technische_kennung(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email is not null
     and (p_email like '%@dreambowl-intern.pages.dev' or p_email like '%@dreambowl.intern')
$$;

comment on function public.ist_technische_kennung(text) is
  'Erkennt die Kennungen, die aus einem Benutzernamen gebaut wurden — die '
  'heutige und die frueher verwendete. Sie sind keine erreichbare Post.';

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
    v_address := v_target.username || '@dreambowl-intern.pages.dev';
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
     set email      = case when public.ist_technische_kennung(v_address) then null else v_address end,
         updated_at = now()
   where id = p_user_id;
end $$;

revoke all on function public.admin_set_email(uuid, text) from public;
grant execute on function public.admin_set_email(uuid, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_user text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  v_user := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');

  if v_user is null and public.ist_technische_kennung(new.email) then
    v_user := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, display_name, username, email, department, is_lead, is_admin)
  values (
    new.id,
    coalesce(v_name, v_user, split_part(new.email, '@', 1)),
    v_user,
    case when public.ist_technische_kennung(new.email) then null else new.email end,
    null, false, false
  );
  return new;
end $$;
