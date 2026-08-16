-- =============================================================================
--  Urkunden laufen jetzt innerhalb der Plattform
-- -----------------------------------------------------------------------------
--  Bisher zeigte die Kachel auf kgb-e61.pages.dev. Die Anwendung liegt jetzt
--  unter derselben Adresse wie der Rest, mit derselben Anmeldung und den Daten
--  in der gemeinsamen Datenbank.
--
--  Die Adresse zeigt bewusst direkt auf index.html: es ist eine eigenstaendige
--  Seite neben der React-Anwendung, kein Bestandteil von deren Routing.
-- =============================================================================

update app_modules
   set external_url = '/urkunden/index.html'
 where key = 'urkunden';
