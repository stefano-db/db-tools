-- =============================================================================
--  Frame-Ablesung erfassen und am selben Tag korrigieren koennen
-- -----------------------------------------------------------------------------
--  Bisher schlug eine zweite Eingabe fuer dieselbe Bahn am selben Tag fehl:
--  der Teilindex frame_readings_one_active_per_day laesst nur eine gueltige
--  Ablesung je Bahn und Tag zu. Genau das passiert aber staendig — der
--  Mechaniker vertippt sich und traegt den Wert direkt noch einmal ein.
--
--  Loesung: eine Funktion, die die alte Zeile als ersetzt markiert und die neue
--  einfuegt. Append-only bleibt erhalten: nichts wird ueberschrieben, die alte
--  Ablesung bleibt mit Verweis auf ihren Nachfolger stehen.
-- =============================================================================

-- Damit "alte Zeile zeigt auf neue Zeile" vor dem Einfuegen gesetzt werden kann,
-- muss der Fremdschluessel bis zum Transaktionsende aufgeschoben werden. Sonst
-- gaebe es kurzzeitig zwei gueltige Ablesungen und der Teilindex schlaegt zu.
alter table frame_readings
  drop constraint frame_readings_superseded_by_id_fkey;

alter table frame_readings
  add constraint frame_readings_superseded_by_id_fkey
  foreign key (superseded_by_id) references frame_readings(id)
  on delete set null
  deferrable initially deferred;

create or replace function public.record_frame_reading(
  p_lane_id           uuid,
  p_reading_date      date,
  p_raw_value         bigint,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch    lane_counter_epochs%rowtype;
  v_existing frame_readings%rowtype;
  v_new_id   uuid := gen_random_uuid();
begin
  -- Die Funktion laeuft mit erhoehten Rechten, prueft die Berechtigung also selbst.
  if not public.can_write_module('maintenance') then
    raise exception 'Keine Berechtigung fuer die Bahnwartung.' using errcode = '42501';
  end if;

  -- Zaehler-Epoche der Bahn ermitteln; bei der Ersteinrichtung neu anlegen.
  select * into v_epoch
    from lane_counter_epochs
   where lane_id = p_lane_id
     and effective_from <= p_reading_date
   order by effective_from desc
   limit 1;

  if not found then
    insert into lane_counter_epochs
      (lane_id, effective_from, counter_start, cumulative_offset, reason, note, created_by)
    values
      (p_lane_id, p_reading_date, 0, 0, 'initial',
       'Automatisch bei der ersten Frame-Eingabe angelegt.', auth.uid())
    returning * into v_epoch;
  end if;

  select * into v_existing
    from frame_readings
   where lane_id = p_lane_id
     and reading_date = p_reading_date
     and superseded_by_id is null;

  -- Erst die alte Zeile umbiegen (Fremdschluessel ist aufgeschoben), dann die
  -- neue einfuegen — so ist zu keinem Zeitpunkt mehr als eine gueltig.
  if found then
    update frame_readings set superseded_by_id = v_new_id where id = v_existing.id;
  end if;

  insert into frame_readings (
    id, lane_id, epoch_id, reading_date, raw_value, source,
    corrects_reading_id, correction_reason, recorded_by, client_request_id
  )
  values (
    v_new_id, p_lane_id, v_epoch.id, p_reading_date, p_raw_value,
    case when v_existing.id is null then 'weekly' else 'correction' end,
    v_existing.id,
    case when v_existing.id is null then null else 'Korrektur am selben Tag' end,
    auth.uid(), p_client_request_id
  );

  return v_new_id;
end $$;

comment on function public.record_frame_reading(uuid, date, bigint, uuid) is
  'Erfasst eine Frame-Ablesung. Existiert fuer Bahn und Tag bereits eine, wird '
  'sie als ersetzt markiert und die neue als Korrektur gespeichert.';

revoke all on function public.record_frame_reading(uuid, date, bigint, uuid) from public;
grant execute on function public.record_frame_reading(uuid, date, bigint, uuid) to authenticated;
