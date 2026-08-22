-- =============================================================================
--  Auslöser für die Meldung bei geschlossener App
-- -----------------------------------------------------------------------------
--  Sobald sich eine Woche ändert, ruft die Datenbank die Funktion, die die
--  Meldungen verschickt. Übergeben wird der alte und der neue Stand — welche
--  Person betroffen ist, entscheidet die Funktion, denn nur sie kennt die
--  Zuordnung von Namen zu Konten.
--
--  Der Ruf geht bewusst ohne Warten hinaus (pg_net): eine Speicherung im
--  Dienstplan darf nicht davon abhängen, ob ein Zustelldienst gerade erreichbar
--  ist. Schlägt der Versand fehl, ist die Meldung verloren — der Plan aber
--  gespeichert. Andersherum wäre es unbrauchbar.
-- =============================================================================

create extension if not exists pg_net;

create or replace function public.plan_meldung_ausloesen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := current_setting('app.meldung_url', true);
  v_geheim text := current_setting('app.meldung_secret', true);
begin
  -- Ohne Einstellungen geschieht nichts. So laesst sich der Versand abschalten,
  -- ohne den Ausloeser zu entfernen, und ein frisch aufgesetztes Abbild der
  -- Datenbank verschickt nicht versehentlich Meldungen.
  if v_url is null or v_geheim is null then
    return null;
  end if;

  -- Hat sich am Inhalt nichts geaendert, gibt es nichts zu melden.
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-plan-secret', v_geheim
    ),
    body := jsonb_build_object(
      'week_start', new.week_start,
      'data', new.data,
      'old_data', case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end
    )
  );

  return null;
end $$;

comment on function public.plan_meldung_ausloesen() is
  'Stoesst den Versand der Meldungen an. Ohne app.meldung_url und '
  'app.meldung_secret geschieht nichts.';

drop trigger if exists roster_weeks_meldung on roster_weeks;

-- Nach dem Schreiben, nicht davor: die Meldung haengt am gespeicherten Stand,
-- und ein Fehler beim Rufen darf das Speichern nicht zuruecknehmen.
create trigger roster_weeks_meldung
  after insert or update on roster_weeks
  for each row execute function public.plan_meldung_ausloesen();
