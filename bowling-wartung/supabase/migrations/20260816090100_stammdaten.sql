-- =============================================================================
--  Stammdaten: 9 Bahnpaare, 18 Bahnen, 4 Wartungstypen, 13 Aufgaben
--  Nach 01_schema.sql ausfuehren. Idempotent.
-- =============================================================================

-- --- Module der internen Plattform ------------------------------------------
-- Aktuell existiert nur die Wartungs-App. 'counter' ist als Platzhalter fuer
-- den spaeteren Counter-Bereich bereits angelegt, aber inaktiv.
insert into app_modules (key, name_de, path, icon, sort_order, active)
values
  ('maintenance', 'Bahnwartung',   '/wartung/', 'wrench',  10, true),
  ('counter',     'Counter',       '/counter/', 'monitor', 20, false)
on conflict (key) do nothing;

insert into role_module_access (role, module_key, can_write)
values
  ('mechanic', 'maintenance', true),
  ('counter',  'counter',     true),
  -- Counter-Mitarbeiter duerfen spaeter Defekte melden, sehen aber die
  -- Wartungsplanung nicht (die Defekt-Policies pruefen 'counter' separat).
  ('admin',    'maintenance', true),
  ('admin',    'counter',     true)
on conflict (role, module_key) do nothing;

-- --- Bahnpaare (gemeinsamer Ball Return / Ball Elevator) ---------------------
insert into lane_pairs (label, sort_order)
select format('Bahn %s-%s', n, n + 1), (n + 1) / 2
  from generate_series(1, 17, 2) as n
on conflict (label) do nothing;

-- --- 18 Bahnen, jeweils dem Paar zugeordnet ---------------------------------
insert into lanes (lane_number, pair_id)
select n, lp.id
  from generate_series(1, 18) as n
  join lane_pairs lp on lp.sort_order = (n + 1) / 2
on conflict (lane_number) do nothing;

-- --- Wartungstypen ----------------------------------------------------------
-- max_interval_days = zusaetzliches Kalenderintervall (faellig ist, was zuerst
-- eintritt). Die Werte sind Vorschlaege und in den Einstellungen aenderbar.
insert into maintenance_types (code, name_de, interval_frames, max_interval_days, cascades_to_smaller, sort_order)
values
  ('25k',  'Wartung alle 25.000 Frames',  25000,  180,  false, 1),
  ('50k',  'Wartung alle 50.000 Frames',  50000,  365,  true,  2),
  ('100k', 'Wartung alle 100.000 Frames', 100000, 730,  true,  3),
  ('500k', 'Wartung alle 500.000 Frames', 500000, null, true,  4)
on conflict (code) do nothing;

-- --- Aufgaben ---------------------------------------------------------------
-- scope: 'lane'      = pro Bahn
--        'lane_pair' = pro Bahnpaar (gemeinsamer Ball Return / Elevator)
insert into maintenance_tasks (maintenance_type_id, code, title_de, title_en, scope, sort_order)
select mt.id, t.code, t.title_de, t.title_en, t.scope::task_scope, t.sort_order
from (values
  -- 25.000 Frames
  ('25k',  'pins_strings',      'Pins und Pin-Schnüre auf Verschleiß oder Beschädigungen prüfen',
                                'Inspect Pins And Pin Strings For Wear Or Damage',            'lane',      1),
  -- 50.000 Frames
  ('50k',  'string_tension',    'Spannung der Pin-Schnüre prüfen und bei Bedarf einstellen',
                                'Check String Tension (Adjust As Needed)',                    'lane',      1),
  ('50k',  'elevator_belt',     'Antriebsriemen des Ball Elevators prüfen',
                                'Inspect Ball Elevator Drive Belt (Surface Return Installations)', 'lane_pair', 2),
  -- 100.000 Frames
  ('100k', 'wagon_chain',       'String-Wagon-Kette und Kettenführungen auf Verschleiß prüfen',
                                'Inspect String Wagon Chain And Chain Guides For Wear',       'lane',      1),
  ('100k', 'wagon_chain_lube',  'String-Wagon-Kette und Pivot Link schmieren',
                                'Lubricate String Wagon Chain And Pivot Link',                'lane',      2),
  ('100k', 'cones_rollers',     'Centering Cones und String Rollers auf Verschleiß prüfen',
                                'Inspect Centering Cones And String Rollers For Wear',        'lane',      3),
  ('100k', 'wagon_motor_belt',  'Motorriemen des String Wagons auf Beschädigung oder Verschleiß prüfen',
                                'Inspect String Wagon Motor Belt For Damage Or Wear',         'lane',      4),
  ('100k', 'gate_string',       'Gate String auf Verschleiß prüfen',
                                'Inspect Gate String For Wear',                               'lane',      5),
  -- 500.000 Frames
  ('500k', 'cushion_board',     'Ball Cushion Board und Impact Strips auf Schäden prüfen',
                                'Inspect Ball Cushion Board And Impact Strips For Damage',    'lane',      1),
  ('500k', 'pit_side_frames',   'Pit Side Frames und Boards auf Schäden prüfen',
                                'Inspect Pit Side Frames And Boards For Damage',              'lane',      2),
  ('500k', 'pin_curtain',       'Pin Curtain auf Verschleiß prüfen',
                                'Inspect Pin Curtain For Wear',                               'lane',      3),
  ('500k', 'return_rail_covers','Ball Return Rail Covers auf Verschleiß prüfen',
                                'Inspect Ball Return Rail Covers For Wear',                   'lane_pair', 4),
  ('500k', 'dust_pan',          'Pinsetter Dust Pan reinigen',
                                'Clean Pinsetter Dust Pan',                                   'lane',      5)
) as t(type_code, code, title_de, title_en, scope, sort_order)
join maintenance_types mt on mt.code = t.type_code
on conflict (maintenance_type_id, code) do nothing;
