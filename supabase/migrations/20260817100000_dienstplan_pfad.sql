-- =============================================================================
--  Dienstplan als eigenstaendige Seite eintragen
-- -----------------------------------------------------------------------------
--  Fehler aus dem Betrieb: Die Kachel war da, liess sich aber nicht oeffnen.
--
--  Ursache: Der Dienstplan ist eine eigene Seite neben der React-Anwendung, war
--  aber als interne Route eingetragen. Der Router kennt '/dienstplan' nicht und
--  leitet auf die Uebersicht zurueck — der Klick lief also ins Leere.
--
--  Module mit einer Adresse, die mit / beginnt, werden als voller Seitenwechsel
--  behandelt. Genau das gilt auch fuer das Urkundensystem.
-- =============================================================================

update app_modules
   set external_url = '/dienstplan/index.html'
 where key = 'dienstplan';
