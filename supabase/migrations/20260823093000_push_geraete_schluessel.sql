-- =============================================================================
--  Womit ein Gerät angemeldet ist
-- -----------------------------------------------------------------------------
--  Wird das Schlüsselpaar getauscht, sind alle bestehenden Anmeldungen wertlos:
--  der Zustelldienst nimmt nichts mehr für sie an. Von außen sieht man das
--  nicht — das Gerät steht angemeldet da und klingelt nie wieder.
--
--  Der Browser könnte es beantworten, tut es aber nicht überall: Safari am
--  iPhone gibt den Schlüssel einer bestehenden Anmeldung nicht heraus. Also
--  merkt es sich die Datenbank. Sie ist ohnehin die Stelle, die zählt.
--
--  Bestehende Zeilen bekommen NULL. Das ist beabsichtigt und heisst „unbekannt,
--  also nicht vertrauenswürdig": das Gerät meldet sich einmal neu an, und
--  danach steht es fest.
-- =============================================================================
alter table push_geraete add column if not exists vapid text;

comment on column push_geraete.vapid is
  'Oeffentlicher Schluessel, mit dem diese Anmeldung entstand. Weicht er vom '
  'heutigen ab, ist die Anmeldung wertlos und muss erneuert werden. NULL '
  'heisst unbekannt und wird wie „weicht ab" behandelt.';
