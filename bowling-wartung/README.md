# Bahnwartung

Wartungsplanung für 18 Bowlingbahnen auf Basis der tatsächlich gespielten Frames.

```
bowling-wartung/
  supabase/migrations/     Schema und Stammdaten, per GitHub-Verbindung automatisch angewendet
  supabase/config.toml     Projektreferenz
  docs/03-ui-struktur.md   Seitenstruktur und Bedienführung
  app/                     React + TypeScript + Tailwind (Vite)
    src/core/              Wartungslogik, framework-frei, vollständig getestet
    src/data/              Datenschicht (Demo lokal / Supabase)
    src/features/          Dashboard, Eingabe, Wartung, Historie, Einstellungen
```

## Entwicklung

```bash
cd app && npm install && npm run dev
```

Danach <http://localhost:5178/wartung/> öffnen.

Ohne Supabase-Zugangsdaten läuft die App auf einem lokal erzeugten Beispielbestand
im Browser (localStorage). Alle Funktionen sind nutzbar; unter *Einstellungen →
Demo-Bestand* lässt sich der Ausgangszustand wiederherstellen.

```bash
npm test        # Wartungslogik, 35 Testfälle
npm run typecheck
npm run build
```

## Anbindung an Supabase

1. In `supabase/config.toml` die Projektreferenz eintragen
   (Dashboard → Project Settings → General → Reference ID).
2. Code nach GitHub pushen. Die Supabase-GitHub-Verbindung wendet die Dateien aus
   `supabase/migrations/` automatisch an. Details in [supabase/README.md](supabase/README.md).
3. Benutzer über Supabase Auth anlegen. Jeder Benutzer erhält automatisch ein Profil
   mit der Rolle `mechanic`; Admins werden per SQL gesetzt:
   ```sql
   update profiles set role = 'admin' where display_name = 'Marco';
   ```
4. `app/.env` aus `app/.env.example` anlegen und die beiden Werte aus
   Dashboard → Project Settings → API eintragen.

Sobald beide Werte gesetzt sind, arbeitet dieselbe Oberfläche gegen die Datenbank —
am Code ändert sich nichts.

**Noch offen:** Die Supabase-Datenschicht (`src/data/supabase/`) ist gegen das
Schema geschrieben, aber noch nicht gegen ein laufendes Projekt getestet. Sobald
die Datenbank steht, sollte einmal der komplette Ablauf durchgespielt werden:
Ersteinrichtung, Wocheneingabe, Wartungsabschluss mit Kaskade, Zählerwechsel.

## Ersteinrichtung der Bahnen

Für jede Bahn wird eingetragen: aktueller Frame-Stand und der Stand bei der letzten
Wartung je Intervall. Ist ein Wartungsstand nicht bekannt, bleibt er **leer** — nicht
0. Die Bahn erscheint dann dauerhaft als „Wartungsstand unbekannt", bis die Wartung
einmal regulär durchgeführt wurde.

## Veröffentlichen über Cloudflare Pages

Die App wird als Unterpfad `/wartung/` der bestehenden Website ausgeliefert
(`vite.config.ts`: `base: '/wartung/'`).

- Build-Befehl: `npm run build`
- Ausgabeverzeichnis: `app/dist`
- Zielordner auf der Website: `/wartung/`
- Für das SPA-Routing eine Datei `_redirects` im Ausgabeverzeichnis:
  ```
  /wartung/*  /wartung/index.html  200
  ```

Empfohlen: **Cloudflare Access** davorschalten, damit die App nur nach einer
zusätzlichen Anmeldung erreichbar ist.

## Grundregeln der Datenhaltung

1. Gerechnet wird ausschließlich mit **kumulativen** Frames. Ein zurückgesetzter oder
   getauschter Zähler erzeugt eine neue Zähler-Epoche; der Gesamtstand läuft weiter.
2. **Nichts wird gelöscht.** Korrekturen sind neue Zeilen mit Verweis auf die alte,
   Stornos setzen `voided_at`. Es gibt keine `DELETE`-Policy.
3. Der aktuelle Stand und der letzte Wartungsstand sind **abgeleitete** Werte (Views).
   Es gibt keine Spalte, die veralten kann.
4. Die Bewertung „fällig / bald fällig / überfällig" existiert **nur** in
   `src/core/maintenance.ts`. Die Datenbank liefert Fakten, sie rechnet nicht.
