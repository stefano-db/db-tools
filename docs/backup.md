# Datensicherung und Wiederherstellung

Der kostenlose Supabase-Tarif enthält **keine** automatischen Sicherungen. Ohne
eigene Sicherung ist bei einem gelöschten Projekt alles weg.

## Sichern

In der App: *Einstellungen → Datensicherung → Vollständige Sicherung (JSON)*.
Nur für Administratoren sichtbar.

Die Datei heißt `bahnwartung-sicherung-JJJJ-MM-TT.json` und enthält alle Tabellen
im Rohformat, inklusive Zähler-Epochen, Ablesungen und Wartungshistorie.

**Empfehlung:** einmal im Monat, und immer nach der Ersteinrichtung. Die Datei
gehört an einen Ort außerhalb von Supabase — Firmenlaufwerk, Cloud-Speicher,
USB-Stick. Eine Sicherung, die nur im selben System liegt, ist keine.

Zusätzlich gibt es die Wartungshistorie als CSV. Die ist zum Nachlesen und
Archivieren gedacht, **nicht** zum Wiedereinspielen — sie enthält nur die
Historie, keine Zählerstände und keine Anker.

## Wiederherstellen

Vorbereitung: Migrationen einspielen, damit Tabellen und Regeln existieren
(passiert automatisch beim Push auf `main`, siehe [supabase/README.md](../supabase/README.md)).

Die Reihenfolge ist wichtig — Fremdschlüssel verlangen, dass Zieltabellen zuerst
gefüllt sind:

1. `lane_pairs`
2. `lanes`
3. `maintenance_types`
4. `maintenance_tasks`
5. `lane_counter_epochs`
6. `frame_readings`
7. `maintenance_records`
8. `maintenance_record_tasks`
9. `lane_issues`
10. `maintenance_settings`, `app_settings`, `app_modules`, `role_module_access`

`profiles` hängt an `auth.users`. Benutzerkonten lassen sich nicht aus dieser
Datei wiederherstellen; sie werden neu angelegt, und die Profile bekommen dann
neue IDs. Namen in der Wartungshistorie bleiben trotzdem lesbar, weil dort der
Anzeigename als Text mitgespeichert ist — genau dafür ist die Spalte
`employee_name` da.

Einspielen im SQL-Editor, Tabelle für Tabelle, nach diesem Muster:

```sql
insert into lanes
select * from jsonb_populate_recordset(null::lanes, '<hier das JSON-Array einfügen>'::jsonb)
on conflict (id) do nothing;
```

Bei `frame_readings` muss der Trigger umgangen werden, der den kumulativen Wert
berechnet — die Werte stehen ja bereits korrekt in der Sicherung:

```sql
alter table frame_readings disable trigger trg_frame_readings_prepare;
-- insert ...
alter table frame_readings enable trigger trg_frame_readings_prepare;
```

Danach prüfen:

```sql
select
  (select count(*) from lanes)             as bahnen,
  (select count(*) from frame_readings)    as ablesungen,
  (select count(*) from maintenance_records) as wartungen;
```

## Warum kein automatisches Backup eingerichtet ist

Automatisch ginge nur mit dem `service_role`-Schlüssel — dem Generalschlüssel,
der jede Rechteprüfung umgeht. Der müsste dann dauerhaft bei einem weiteren
Dienst hinterlegt sein. Für einen Datenbestand, der einmal pro Woche um 18 Zeilen
wächst, ist ein Knopfdruck im Monat das bessere Verhältnis von Nutzen zu Risiko.

Wenn es doch automatisch laufen soll, ist der Supabase-Pro-Tarif (rund 25 $/Monat)
die ehrlichere Antwort: tägliche Sicherungen, sieben Tage Aufbewahrung, und das
Projekt pausiert nicht mehr wegen Inaktivität.
