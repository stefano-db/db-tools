-- =============================================================================
--  Werkzeuge für die Geschäftsleitung
-- -----------------------------------------------------------------------------
--  Sehen, nicht eingreifen. Wer das Haus fuehrt, soll den Stand der Wartung,
--  die Schliessfaecher und die Wuensche kennen, ohne in Listen zu klicken, die
--  jemand anders fuehrt — eine versehentlich abgehakte Wartung faellt sonst
--  niemandem auf.
--
--  Ausnahme sind die Dokumente: Aushaenge und Rundschreiben kommen von hier.
--
--  Wer mehr braucht, bekommt es einzeln ueber user_module_access oder die
--  Administratorrolle. Das ist die Ausnahme und soll eine bleiben.
-- =============================================================================

insert into department_module_access (department, module_key, can_write) values
  ('geschaeftsleitung', 'dienstplan',      false),
  ('geschaeftsleitung', 'dokumente',       true),
  ('geschaeftsleitung', 'maintenance',     false),
  ('geschaeftsleitung', 'schliessfaecher', false),
  ('geschaeftsleitung', 'urkunden',        false)
on conflict (department, module_key) do update set can_write = excluded.can_write;
