-- =============================================================================
--  Verlauf verdichten
-- -----------------------------------------------------------------------------
--  Der Editor speichert nach jeder Eingabe. Bisher legte damit jede Eingabe
--  einen eigenen Stand ab — nach einer halben Stunde Planung stehen dort
--  hundert Einträge im Minutenabstand. Das ist kein Verlauf mehr, sondern ein
--  Protokoll: Wer eine Woche zurückholen will, findet den richtigen Punkt nicht.
--
--  Nützlich ist der Stand *vor* einer Arbeitssitzung, nicht der vor jedem
--  Tastendruck. Deshalb wird nur noch abgelegt, wenn der letzte Eintrag
--  derselben Person länger als zehn Minuten zurückliegt. Innerhalb einer
--  Sitzung leistet das Rückgängig im Editor dasselbe, nur schneller.
-- =============================================================================

create or replace function public.roster_week_versionieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fassung und Zeitstempel gehen immer hoch: daran haengt die Pruefung beim
  -- Speichern, die darf nie ausfallen.
  new.version := old.version + 1;
  new.updated_at := now();

  -- Der Stand hat sich gar nicht geaendert? Dann gibt es nichts abzulegen.
  if new.data is not distinct from old.data then
    return new;
  end if;

  -- Innerhalb derselben Sitzung genuegt der Stand von deren Beginn.
  if exists (
    select 1 from roster_week_history
     where week_start = old.week_start
       and replaced_by is not distinct from auth.uid()
       and replaced_at > now() - interval '10 minutes'
  ) then
    return new;
  end if;

  insert into roster_week_history (week_start, data, version, replaced_by)
  values (old.week_start, old.data, old.version, auth.uid());

  return new;
end $$;

-- =============================================================================
--  Aufräumen
-- -----------------------------------------------------------------------------
--  Ohne Zeitplaner in der Datenbank läuft das beim Öffnen des Editors mit —
--  dasselbe Verfahren wie beim Urkunden-Werkzeug. Zwei Schritte:
--
--    Verdichten: Was älter als ein Tag ist, braucht keine Zehn-Minuten-Punkte
--    mehr. Je Woche und Stunde bleibt der älteste Stand stehen — er ist der,
--    auf den man zurückwill.
--
--    Ausdünnen: Nach einem halben Jahr fragt niemand mehr nach dem Stand einer
--    Woche. Der jeweils älteste Eintrag je Woche bleibt trotzdem erhalten,
--    damit es immer einen Weg ganz zurück gibt.
-- =============================================================================
create or replace function public.roster_verlauf_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weg integer := 0;
  v_zwischen integer;
begin
  if not (public.is_lead() or public.is_admin()) then
    return 0;
  end if;

  with gruppiert as (
    select id,
           row_number() over (
             partition by week_start, date_trunc('hour', replaced_at)
             order by replaced_at
           ) as platz
      from roster_week_history
     where replaced_at < now() - interval '1 day'
  )
  delete from roster_week_history h
   using gruppiert g
   where h.id = g.id and g.platz > 1;
  get diagnostics v_zwischen = row_count;
  v_weg := v_weg + v_zwischen;

  with aeltester as (
    select distinct on (week_start) id
      from roster_week_history
     order by week_start, replaced_at
  )
  delete from roster_week_history
   where replaced_at < now() - interval '180 days'
     and id not in (select id from aeltester);
  get diagnostics v_zwischen = row_count;
  v_weg := v_weg + v_zwischen;

  return v_weg;
end $$;

comment on function public.roster_verlauf_aufraeumen() is
  'Verdichtet den Verlauf auf einen Stand je Stunde (ab einem Tag Alter) und '
  'entfernt Staende aelter als ein halbes Jahr, ausser dem jeweils aeltesten '
  'je Woche.';

revoke all on function public.roster_verlauf_aufraeumen() from public;
grant execute on function public.roster_verlauf_aufraeumen() to authenticated;
