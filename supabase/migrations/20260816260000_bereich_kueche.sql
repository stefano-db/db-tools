-- =============================================================================
--  Bereich "Küche" ergänzen
-- -----------------------------------------------------------------------------
--  Bewusst allein in dieser Datei: PostgreSQL laesst einen neu hinzugefuegten
--  Aufzaehlungswert erst nach Abschluss der Transaktion verwenden. Stuende die
--  Rechtevergabe hier mit drin, bräche die Migration mit "unsafe use of new
--  value" ab.
-- =============================================================================

alter type department add value if not exists 'kueche';
