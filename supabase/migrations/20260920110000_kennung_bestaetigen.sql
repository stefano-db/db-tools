-- =============================================================================
--  Konten ohne E-Mail sofort gültig
-- -----------------------------------------------------------------------------
--  Supabase verschickt beim Anlegen eine Bestätigungsmail und sperrt das Konto,
--  bis jemand darauf klickt. Bei einer technischen Kennung kommt sie nirgends
--  an — das Konto blieb gesperrt, und der Mitarbeiter konnte sich nie anmelden.
--
--  Bestätigt wird deshalb hier, unmittelbar nach dem Anlegen, und zwar nur für
--  Kennungen, die aus einem Benutzernamen gebaut wurden. Eine echte Adresse
--  bestätigt weiterhin ihr Inhaber: dort ist die Prüfung sinnvoll, denn sie
--  belegt, dass die Adresse stimmt und der Person gehört.
--
--  Der Weg über eine Funktion statt über die Einstellung „Confirm email":
--  abgeschaltet gälte es für alle Konten, auch für die mit echter Adresse, und
--  ein Tippfehler in der Adresse fiele nie auf.
-- =============================================================================

create or replace function public.admin_kennung_bestaetigen(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_betroffen int;
begin
  if not (public.is_admin() or public.is_lead()) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;

  -- Die Bedingung auf die Kennung steht in der Abfrage, nicht davor: so kann
  -- der Aufruf eine echte Adresse nicht versehentlich mitbestätigen, auch
  -- wenn ihn jemand mit der falschen Kennung aufruft.
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = p_user_id
     and public.ist_technische_kennung(email)
     and email_confirmed_at is null;

  get diagnostics v_betroffen = row_count;

  -- Kein Treffer ist kein Fehler: das Konto hat eine echte Adresse, war schon
  -- bestätigt, oder es gibt die Einstellung gar nicht. Alle drei sind in
  -- Ordnung und sollen das Anlegen nicht abbrechen.
  if v_betroffen = 0 then
    return;
  end if;
end $$;

comment on function public.admin_kennung_bestaetigen(uuid) is
  'Bestätigt ein frisch angelegtes Konto, dessen Anmeldekennung aus dem '
  'Benutzernamen gebaut wurde. Konten mit echter Adresse bleiben unberührt.';

revoke all on function public.admin_kennung_bestaetigen(uuid) from public;
grant execute on function public.admin_kennung_bestaetigen(uuid) to authenticated;
