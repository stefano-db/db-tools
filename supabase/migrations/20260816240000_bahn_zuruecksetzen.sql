-- =============================================================================
--  Eine Bahn auf den Ausgangszustand zurücksetzen
-- -----------------------------------------------------------------------------
--  Ausdrücklich eine Ausnahme. Das System ist append-only gebaut: Ablesungen und
--  Wartungen werden korrigiert oder storniert, nie gelöscht. Genau das macht die
--  Historie belastbar.
--
--  In der Einrichtungsphase entstehen aber Probeeingaben, die keinerlei
--  fachlichen Wert haben und die Anzeige dauerhaft verfälschen. Sie stehen zu
--  lassen wäre schlechter, als sie zu entfernen.
--
--  Absicherung:
--    - nur Administratoren
--    - alles Gelöschte landet vorher im audit_log; die Daten sind also
--      rekonstruierbar, falls sich jemand vertut
--    - gibt zurück, wie viel entfernt wurde, damit die Anwendung es benennen kann
-- =============================================================================

create or replace function public.admin_reset_lane(p_lane_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lane      lanes%rowtype;
  v_readings  int;
  v_records   int;
  v_epochs    int;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren duerfen eine Bahn zuruecksetzen.' using errcode = '42501';
  end if;

  select * into v_lane from lanes where id = p_lane_id;
  if not found then
    raise exception 'Bahn nicht gefunden.';
  end if;

  select count(*) into v_readings from frame_readings      where lane_id = p_lane_id;
  select count(*) into v_records  from maintenance_records where lane_id = p_lane_id;
  select count(*) into v_epochs   from lane_counter_epochs where lane_id = p_lane_id;

  -- Vollstaendige Kopie ins Protokoll, bevor irgendetwas verschwindet.
  insert into audit_log (table_name, row_id, action, actor_id, before)
  values (
    'lanes', p_lane_id, 'RESET', auth.uid(),
    jsonb_build_object(
      'lane_number', v_lane.lane_number,
      'frame_readings',      (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from frame_readings f      where f.lane_id = p_lane_id),
      'maintenance_records', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from maintenance_records m where m.lane_id = p_lane_id),
      'lane_counter_epochs', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from lane_counter_epochs e where e.lane_id = p_lane_id)
    )
  );

  delete from maintenance_record_tasks
   where record_id in (select id from maintenance_records where lane_id = p_lane_id);
  delete from maintenance_records where lane_id = p_lane_id;
  delete from frame_readings      where lane_id = p_lane_id;
  delete from lane_counter_epochs where lane_id = p_lane_id;

  return jsonb_build_object(
    'lane_number', v_lane.lane_number,
    'readings',    v_readings,
    'records',     v_records,
    'epochs',      v_epochs
  );
end $$;

comment on function public.admin_reset_lane(uuid) is
  'Entfernt alle Ablesungen, Wartungen und Zaehler-Epochen einer Bahn. '
  'Gedacht fuer Probeeingaben aus der Einrichtungsphase. Der vorherige Stand '
  'liegt vollstaendig im audit_log.';

revoke all on function public.admin_reset_lane(uuid) from public;
grant execute on function public.admin_reset_lane(uuid) to authenticated;
