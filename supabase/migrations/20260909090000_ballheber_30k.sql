-- =============================================================================
--  Ballheber: eigenes Intervall bei 30.000 Frames
-- -----------------------------------------------------------------------------
--  Der Ballheber lief bisher bei jeder 25k-Wartung mit. Das ist oefter als
--  noetig: er haelt laenger als die Pins, und jede Pruefung, die man macht,
--  obwohl nichts dran ist, macht die Liste laenger und die naechste Wartung
--  unwahrscheinlicher.
--
--  Er bekommt deshalb ein eigenes Intervall. Dass 30.000 nicht durch 25.000
--  teilbar ist, ist Absicht: die beiden laufen dadurch selten zusammen, und
--  wenn doch, steht der Mechaniker ohnehin schon an der Maschine.
--
--  Das V-Wheel faellt weg. Es wurde beim Anlegen mit aufgenommen, gehoert im
--  Haus aber nicht in diese Runde.
-- =============================================================================

-- --- Der neue Typ, zwischen 25k und 50k --------------------------------------
--  Die spaeteren ruecken auf. Die Reihenfolge steuert nur die Anzeige; die
--  Faelligkeit rechnet jeder Typ fuer sich aus seinem eigenen Anker.
update maintenance_types set sort_order = sort_order + 1 where sort_order >= 2;

insert into maintenance_types (code, name_de, interval_frames, max_interval_days, cascades_to_smaller, sort_order)
values ('30k', 'Ballheber alle 30.000 Frames', 30000, 180, false, 2)
on conflict (code) do update
  set name_de           = excluded.name_de,
      interval_frames   = excluded.interval_frames,
      max_interval_days = excluded.max_interval_days,
      sort_order        = excluded.sort_order;

-- --- Aufgaben des neuen Intervalls -------------------------------------------
insert into maintenance_tasks (maintenance_type_id, code, title_de, title_en, scope, sort_order)
select mt.id, t.code, t.title_de, t.title_en, t.scope::task_scope, t.sort_order
from (values
  ('ball_elevator_belt',   'Ballheber: Riemen auf Verschleiß prüfen',
                           'Inspect Ball Elevator Belt For Wear',   'lane_pair', 1),
  ('ball_elevator_shafts', 'Ballheber: Wellen auf Verschleiß prüfen',
                           'Inspect Ball Elevator Shafts For Wear', 'lane_pair', 2)
) as t(code, title_de, title_en, scope, sort_order)
join maintenance_types mt on mt.code = '30k'
on conflict (maintenance_type_id, code) do update
  set active = true, sort_order = excluded.sort_order;

-- --- Die alten Eintraege bei 25k stilllegen ----------------------------------
--  Nicht loeschen: an ihnen haengen die bereits abgeschlossenen Wartungen. Ein
--  geloeschter Eintrag risse Loecher in die Historie, in der er vorkommt.
--  `active = false` nimmt ihn aus jeder kuenftigen Liste und laesst die
--  Vergangenheit stehen.
update maintenance_tasks
   set active = false, valid_to = current_date
 where code in ('ball_elevator_belt', 'ball_elevator_v_wheel', 'ball_elevator_shafts')
   and maintenance_type_id = (select id from maintenance_types where code = '25k');

comment on table maintenance_tasks is
  'Pruefpunkte je Intervall. Nichts wird geloescht — was nicht mehr gilt, wird '
  'auf active = false gesetzt, damit abgeschlossene Wartungen lesbar bleiben.';
