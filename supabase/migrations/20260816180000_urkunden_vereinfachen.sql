-- =============================================================================
--  Urkundensystem: Datenmodell vereinfachen und Aufräumen serverseitig machen
-- -----------------------------------------------------------------------------
--  Die zuvor angelegten Tabellen cert_players und cert_documents waren sauber
--  normalisiert — und fuer diesen Zweck zu viel. Begruendung:
--
--  Der Sinn einer Normalisierung ist, spaeter ueber die Daten auswerten zu
--  koennen. Hier werden Events aber nach sieben Tagen geloescht; es gibt also
--  gar keine Langzeitdaten, ueber die sich etwas auswerten liesse. Was bleibt,
--  waere der Aufwand: 845 Zeilen erprobter Anwendungscode muessten auf ein
--  fremdes Datenmodell umgebaut werden, mit entsprechendem Risiko.
--
--  Stattdessen: ein Event ist eine Zeile, sein Inhalt (Spieler, Punkte,
--  gedruckte Urkunden) liegt als JSON daneben — genau in der Form, in der die
--  Anwendung ihn ohnehin im Speicher haelt. Geteilt wird trotzdem alles: jeder
--  Counter-Mitarbeiter sieht dieselben Events, von jedem Geraet.
-- =============================================================================

drop table if exists cert_documents;
drop table if exists cert_players;

alter table cert_events
  add column if not exists data jsonb not null default '{}'::jsonb;

comment on column cert_events.data is
  'Inhalt des Events: Spieler mit Punkten und bereits erzeugte Urkunden. '
  'Bewusst als JSON — der Datenbestand lebt nur sieben Tage.';

alter table cert_events
  add column if not exists updated_by uuid references profiles(id);

-- Der Status ist ein Detail der Anwendung ('new', 'imported', …) und aendert
-- sich mit ihr. Als Aufzaehlungstyp wuerde jede neue Stufe eine Migration
-- erzwingen — dafuer ist er zu unwichtig.
alter table cert_events alter column status drop default;
alter table cert_events alter column status type text using status::text;
alter table cert_events alter column status set default 'new';
drop type if exists cert_event_status;

-- --- Aufbewahrungsdauer ------------------------------------------------------
alter table cert_settings
  add column if not exists retention_days int not null default 7
  check (retention_days between 1 and 365);

comment on column cert_settings.retention_days is
  'Events aelter als diese Zahl an Tagen werden automatisch entfernt. Gewollt: '
  'das Werkzeug wird taeglich benutzt, und niemand raeumt zuverlaessig auf.';

-- --- Automatisches Aufräumen -------------------------------------------------
--  Bisher lief das im Browser und nur, wenn jemand die Seite oeffnete. Jetzt in
--  der Datenbank: dieselbe Regel fuer alle, unabhaengig davon, wer zuletzt da war.
create or replace function public.cert_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days    int;
  v_deleted int;
begin
  if not public.has_module('urkunden') then
    raise exception 'Keine Berechtigung fuer die Urkunden.' using errcode = '42501';
  end if;

  select retention_days into v_days from cert_settings where id;

  delete from cert_events
   where event_date < current_date - make_interval(days => v_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

comment on function public.cert_cleanup() is
  'Entfernt Events, die aelter als die eingestellte Aufbewahrungsdauer sind. '
  'Gibt die Anzahl zurueck, damit die Anwendung es melden kann.';

revoke all on function public.cert_cleanup() from public;
grant execute on function public.cert_cleanup() to authenticated;
