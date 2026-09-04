-- Kinderbumper in die 25k-Wartung aufnehmen.
--
-- Ein Bumper, der nicht ausfaehrt, faellt erst am Kindergeburtstag auf — dann
-- steht die Bahn voll und niemand hat Zeit. Deshalb bei jeder 25k-Wartung ein
-- kurzer Funktionslauf, statt auf die Beschwerde zu warten.
--
-- scope 'lane': jede Bahn hat ihre eigenen Bumper und faehrt sie einzeln aus.
insert into maintenance_tasks (maintenance_type_id, code, title_de, title_en, scope, sort_order)
select mt.id, t.code, t.title_de, t.title_en, t.scope::task_scope, t.sort_order
from (values
  ('kids_bumper', 'Kinderbumper auf Funktion prüfen (Aus- und Einfahren)',
                  'Check Bumper Operation (Raise And Lower)', 'lane', 5)
) as t(code, title_de, title_en, scope, sort_order)
join maintenance_types mt on mt.code = '25k'
on conflict (maintenance_type_id, code) do nothing;
