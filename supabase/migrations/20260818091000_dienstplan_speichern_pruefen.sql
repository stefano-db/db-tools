-- =============================================================================
--  Nachtrag: „gespeichert" darf nicht behauptet werden
-- -----------------------------------------------------------------------------
--  Die Speicherfunktion laeuft mit den Rechten des Aufrufers — richtig so, denn
--  nur Leitungen duerfen den Plan aendern. Wer sie ohne dieses Recht aufrief,
--  bekam aber trotzdem "ok": das UPDATE traf durch die Zeilenrechte einfach
--  keine Zeile, und das sah aus wie Erfolg.
--
--  Bei einem Dienstplan ist das die schlimmste Sorte Fehler: die Oberflaeche
--  meldet gespeichert, die Woche steht unveraendert in der Datenbank, und
--  niemand erfaehrt es. Die Funktion prueft jetzt, ob wirklich geschrieben
--  wurde, und sagt sonst deutlich, dass das Recht fehlt.
-- =============================================================================

create or replace function public.roster_week_speichern(
  p_week_start date,
  p_data       jsonb,
  p_version    bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aktuell bigint;
  v_neu     bigint;
  v_zeilen  int;
begin
  if not (public.is_lead() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  select version into v_aktuell from roster_weeks where week_start = p_week_start;

  -- Neue Woche: es gab noch nichts, also gibt es auch nichts zu ueberschreiben.
  if v_aktuell is null then
    insert into roster_weeks (week_start, data, updated_by)
    values (p_week_start, p_data, auth.uid());
    return jsonb_build_object('ok', true, 'version', 1);
  end if;

  if p_version is distinct from v_aktuell then
    return jsonb_build_object(
      'ok', false, 'grund', 'veraltet',
      'version', v_aktuell,
      'data', (select data from roster_weeks where week_start = p_week_start)
    );
  end if;

  update roster_weeks
     set data = p_data, updated_by = auth.uid()
   where week_start = p_week_start
  returning version into v_neu;

  get diagnostics v_zeilen = row_count;

  -- Keine Zeile getroffen, obwohl es sie gibt: die Zeilenrechte haben es
  -- verhindert. Das ist ein Fehlschlag und wird auch so gemeldet.
  if v_zeilen = 0 then
    return jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  end if;

  return jsonb_build_object('ok', true, 'version', v_neu);
end $$;

revoke all on function public.roster_week_speichern(date, jsonb, bigint) from public;
grant execute on function public.roster_week_speichern(date, jsonb, bigint) to authenticated;
