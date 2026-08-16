-- =============================================================================
--  Fehlerbehebung: record_frame_reading scheiterte an einem fehlenden Cast
-- -----------------------------------------------------------------------------
--  Fehlermeldung war:
--    column "source" is of type reading_source but expression is of type text
--
--  Ein CASE-Ausdruck liefert text. Ein einzelnes Literal wuerde Postgres in den
--  Aufzaehlungstyp umwandeln, das Ergebnis eines CASE aber nicht — der Cast muss
--  explizit dastehen. Dadurch schlug jeder Speicherversuch fehl, nicht nur die
--  Korrektur einer bestehenden Ablesung.
-- =============================================================================

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
  if not public.can_write_module('maintenance') then
    raise exception 'Keine Berechtigung fuer die Bahnwartung.' using errcode = '42501';
  end if;

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
      (p_lane_id, p_reading_date, 0, 0, 'initial'::epoch_reason,
       'Automatisch bei der ersten Frame-Eingabe angelegt.', auth.uid())
    returning * into v_epoch;
  end if;

  select * into v_existing
    from frame_readings
   where lane_id = p_lane_id
     and reading_date = p_reading_date
     and superseded_by_id is null;

  if found then
    update frame_readings set superseded_by_id = v_new_id where id = v_existing.id;
  end if;

  insert into frame_readings (
    id, lane_id, epoch_id, reading_date, raw_value, source,
    corrects_reading_id, correction_reason, recorded_by, client_request_id
  )
  values (
    v_new_id, p_lane_id, v_epoch.id, p_reading_date, p_raw_value,
    -- Der Cast ist der eigentliche Fix.
    (case when v_existing.id is null then 'weekly' else 'correction' end)::reading_source,
    v_existing.id,
    case when v_existing.id is null then null else 'Korrektur am selben Tag' end,
    auth.uid(), p_client_request_id
  );

  return v_new_id;
end $$;

revoke all on function public.record_frame_reading(uuid, date, bigint, uuid) from public;
grant execute on function public.record_frame_reading(uuid, date, bigint, uuid) to authenticated;
