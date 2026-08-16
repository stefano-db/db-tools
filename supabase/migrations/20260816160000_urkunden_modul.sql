-- =============================================================================
--  Modul "Urkunden" anbinden
-- -----------------------------------------------------------------------------
--  Das Urkundensystem ist eine eigenstaendige Anwendung unter kgb-e61.pages.dev.
--  Es wird zunaechst nur verlinkt, nicht einverleibt: die Modeluebersicht zeigt
--  Counter-Mitarbeitern die Kachel, ein Klick fuehrt hinueber.
--
--  Dafuer braucht app_modules eine Adresse ausserhalb der Plattform. Module ohne
--  external_url bleiben interne Routen wie bisher.
-- =============================================================================

alter table app_modules
  add column if not exists external_url text;

comment on column app_modules.external_url is
  'Vollstaendige Adresse, wenn das Modul ausserhalb der Plattform liegt. '
  'Ist sie gesetzt, wird path ignoriert und in einem neuen Tab geoeffnet.';

insert into app_modules (key, name_de, path, icon, sort_order, active, external_url)
values ('urkunden', 'Urkunden', '/urkunden', 'trophy', 20, true, 'https://kgb-e61.pages.dev/')
on conflict (key) do update
  set name_de      = excluded.name_de,
      icon         = excluded.icon,
      sort_order   = excluded.sort_order,
      active       = excluded.active,
      external_url = excluded.external_url;

-- Counter-Mitarbeiter duerfen es benutzen, Administratoren ohnehin.
-- Mechaniker bekommen es bewusst nicht: die Uebersicht soll zeigen, was zum
-- eigenen Bereich gehoert, nicht alles was existiert.
insert into role_module_access (role, module_key, can_write)
values ('counter', 'urkunden', true),
       ('admin',   'urkunden', true)
on conflict (role, module_key) do update set can_write = excluded.can_write;

-- Der Platzhalter aus der Ersteinrichtung wird nicht mehr gebraucht.
update app_modules set active = false where key = 'counter';
