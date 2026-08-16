-- =============================================================================
--  Passwort zurücksetzen durch Administrator oder Bereichsleitung
-- -----------------------------------------------------------------------------
--  Mitarbeiter melden sich mit einem Benutzernamen an und haben keine
--  E-Mail-Adresse. Der übliche Weg "Passwort vergessen" per Mail fällt damit
--  aus — jemand mit Verantwortung muss es setzen können.
--
--  Warum eine Datenbankfunktion und keine Aufruf aus der Anwendung:
--  Passwörter anderer Konten zu ändern verlangt den service_role-Schlüssel, der
--  jede Rechteprüfung umgeht. Läge der im Browser, könnte ihn jeder auslesen und
--  hätte vollen Zugriff auf alle Daten. Diese Funktion läuft stattdessen in der
--  Datenbank, prüft selbst wer sie aufruft, und der Schlüssel bleibt aus dem
--  Spiel.
-- =============================================================================

create or replace function public.admin_set_password(
  p_user_id  uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_target profiles%rowtype;
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'Das Passwort muss mindestens 8 Zeichen haben.';
  end if;

  select * into v_target from profiles where id = p_user_id;
  if not found then
    raise exception 'Konto nicht gefunden.';
  end if;

  -- Administratoren duerfen jedes Konto zuruecksetzen. Eine Bereichsleitung nur
  -- Mitarbeiter des eigenen Bereichs — und niemals das Konto eines Admins,
  -- sonst koennte sie sich ueber ein fremdes Konto selbst hochstufen.
  if not (
    public.is_admin()
    or (
      public.is_lead()
      and v_target.department is not null
      and v_target.department = public.my_department()
      and v_target.is_admin = false
    )
  ) then
    raise exception 'Keine Berechtigung, dieses Passwort zu setzen.' using errcode = '42501';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at         = now()
   where id = p_user_id;

  if not found then
    raise exception 'Zu diesem Konto existiert keine Anmeldung.';
  end if;
end $$;

comment on function public.admin_set_password(uuid, text) is
  'Setzt das Passwort eines anderen Kontos. Nur fuer Administratoren und, '
  'begrenzt auf den eigenen Bereich, fuer Bereichsleitungen.';

revoke all on function public.admin_set_password(uuid, text) from public;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
