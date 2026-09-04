-- Ballheber in die 25k-Wartung aufnehmen.
--
-- Bisher tauchte der Ballheber erst bei 50.000 Frames auf, und dort nur mit dem
-- Riemen. Riemen, V-Wheel und Wellen laufen im Haus schneller ein als das
-- Intervall unterstellt; geprueft wird deshalb ab jetzt bei jeder 25k-Wartung.
--
-- scope 'lane_pair': ein Ballheber bedient beide Bahnen eines Paares. Die
-- Oberflaeche haengt an solchen Aufgaben das Paar-Kuerzel an, damit der
-- Mechaniker nicht zweimal an dieselbe Maschine geht.
insert into maintenance_tasks (maintenance_type_id, code, title_de, title_en, scope, sort_order)
select mt.id, t.code, t.title_de, t.title_en, t.scope::task_scope, t.sort_order
from (values
  ('ball_elevator_belt',    'Ballheber: Riemen auf Verschleiß prüfen',
                            'Inspect Ball Elevator Belt For Wear',     'lane_pair', 2),
  ('ball_elevator_v_wheel', 'Ballheber: V-Wheel auf Verschleiß prüfen',
                            'Inspect Ball Elevator V-Wheel For Wear',  'lane_pair', 3),
  ('ball_elevator_shafts',  'Ballheber: Wellen auf Verschleiß prüfen',
                            'Inspect Ball Elevator Shafts For Wear',   'lane_pair', 4)
) as t(code, title_de, title_en, scope, sort_order)
join maintenance_types mt on mt.code = '25k'
on conflict (maintenance_type_id, code) do nothing;
