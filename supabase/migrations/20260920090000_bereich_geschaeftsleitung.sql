-- =============================================================================
--  Bereich Geschäftsleitung
-- -----------------------------------------------------------------------------
--  Bisher gab es vier Bereiche, und alle vier arbeiten am Gast oder an der
--  Maschine. Wer das Haus fuehrt, gehoerte in keinen davon: als Administrator
--  eingetragen sah man alles, aber man stand nirgends — im Dienstplan ohne
--  Farbe, in der Uebersicht ohne Zuordnung.
--
--  Der Wert wird hier allein hinzugefuegt. Postgres laesst einen neuen
--  Aufzaehlungswert nicht im selben Transaktionsblock verwenden, in dem er
--  entsteht; die Rechte stehen deshalb in der Datei daneben. Dieselbe
--  Aufteilung wie damals bei der Kueche.
-- =============================================================================

alter type department add value if not exists 'geschaeftsleitung';
