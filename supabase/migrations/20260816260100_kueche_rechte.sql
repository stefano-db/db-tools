-- =============================================================================
--  Werkzeuge für den Bereich Küche
-- -----------------------------------------------------------------------------
--  Dienstplan sehen alle Bereiche; bearbeiten haengt an der Leitungsfunktion.
--  Dokumente darf die Kueche auch selbst pflegen — Rezepte, Hygieneplaene und
--  Aushaenge betreffen niemanden sonst.
-- =============================================================================

insert into department_module_access (department, module_key, can_write) values
  ('kueche', 'dienstplan', false),
  ('kueche', 'dokumente',  true)
on conflict (department, module_key) do update set can_write = excluded.can_write;
