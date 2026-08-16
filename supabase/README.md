# Datenbank

Die Dateien in `migrations/` werden von der GitHub-Verbindung automatisch auf das
Supabase-Projekt angewendet — in der Reihenfolge ihrer Zeitstempel.

| Datei | Inhalt |
|---|---|
| `20260816090000_initial_schema.sql` | Tabellen, Views, Trigger, RLS-Policies, Storage-Bucket |
| `20260816090100_stammdaten.sql` | Module, 9 Bahnpaare, 18 Bahnen, 4 Wartungstypen, 13 Aufgaben |

Die Stammdaten liegen bewusst als Migration vor und nicht als `seed.sql`: Sie werden
im Produktivbetrieb gebraucht, `seed.sql` läuft bei Supabase nur auf Preview-Branches.
Beide Dateien sind wiederholbar geschrieben (`on conflict do nothing`).

## Regeln für neue Migrationen

- Nie eine bereits angewendete Migration ändern — immer eine neue Datei anlegen.
- Dateiname: `<YYYYMMDDHHMMSS>_kurze_beschreibung.sql`
- Keine `drop table` auf Tabellen mit Echtdaten. Spalten entfernen erst, wenn die
  Anwendung sie nicht mehr liest.

## Nach dem ersten Einspielen

Benutzer über Supabase Auth anlegen. Jeder neue Benutzer bekommt automatisch ein
Profil mit der Rolle `mechanic`. Adminrechte werden einmalig gesetzt:

```sql
update profiles set role = 'admin' where display_name = 'Marco';
```

Prüfen, ob alles angekommen ist:

```sql
select
  (select count(*) from lanes)              as bahnen,          -- 18
  (select count(*) from lane_pairs)         as bahnpaare,       -- 9
  (select count(*) from maintenance_types)  as wartungstypen,   -- 4
  (select count(*) from maintenance_tasks)  as aufgaben;        -- 13
```
