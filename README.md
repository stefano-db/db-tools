# Interne Plattform

Eine Anmeldung für alle Mitarbeiter. Danach sieht jeder genau die Werkzeuge seines
Bereichs. Erstes Modul ist die **Bahnwartung** — Wartungsplanung für 18
Bowlingbahnen auf Basis der tatsächlich gespielten Frames.

```
/                        Modulübersicht — zeigt nur freigeschaltete Werkzeuge
/wartung                 Modul Bahnwartung
```

```
supabase/migrations/     Schema und Stammdaten, per GitHub-Verbindung automatisch angewendet
docs/03-ui-struktur.md   Seitenstruktur und Bedienführung
apps/intern/             React + TypeScript + Tailwind (Vite)
  src/app/               Anmeldung, Kopfzeile, Modulübersicht, Routing
  src/core/              Wartungslogik, framework-frei, vollständig getestet
  src/data/              Datenschicht (Demo lokal / Supabase)
  src/features/          Bildschirme des Wartungsmoduls
```

## Ein neues Modul hinzufügen

1. Zeile in `app_modules` anlegen (`key`, `name_de`, `path`, `icon`) und in
   `role_module_access` festlegen, welche Rolle es sehen darf.
2. Tabellen des Moduls anlegen, RLS-Policies über `has_module('<key>')` und
   `can_write_module('<key>')` — dieselbe Regel gilt dann automatisch im Frontend.
3. Route in `src/main.tsx` ergänzen und die Bildschirme unter `src/features/`
   einhängen.

Anmeldung, Rechteprüfung, Kopfzeile und Modulübersicht müssen dafür nicht
angefasst werden. Die Datenbank ist bewusst gemeinsam: Ein Defekt, den ein
Counter-Mitarbeiter meldet, landet in derselben Tabelle, aus der der Mechaniker
ihn abarbeitet.

## Entwicklung

```bash
cd apps/intern && npm install && npm run dev
```

Danach <http://localhost:5178/> öffnen.

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
3. Benutzer über *Authentication → Users → Add user* anlegen (mit „Auto Confirm User").
   Jeder neue Benutzer erhält automatisch ein Profil mit der Rolle `mechanic`;
   Adminrechte werden einmalig gesetzt:
   ```sql
   update profiles set role = 'admin' where display_name = 'Marko';
   ```
4. `apps/intern/.env` aus `.env.example` anlegen und die beiden Werte aus
   Dashboard → Project Settings → API eintragen.

Sobald beide Werte gesetzt sind, arbeitet dieselbe Oberfläche gegen die Datenbank —
am Code ändert sich nichts.

## Ersteinrichtung der Bahnen

Einmalig für jede Bahn den aktuellen Zählerstand über *Frame-Stände* eintragen. Die
Zähler-Epoche wird dabei automatisch angelegt; der abgelesene Wert ist zugleich der
kumulative Ausgangswert.

Die letzten Wartungsstände bleiben zunächst **unbekannt** — nicht 0. Jede Bahn zeigt
dann `? Wartungsstand unbekannt` und meldet weder „fällig" noch „in Ordnung". Sobald
eine Wartung das erste Mal regulär abgeschlossen wird, ist der Ausgangspunkt gesetzt
und die Berechnung läuft für dieses Intervall selbstständig.

## Veröffentlichen über Cloudflare Pages

Die App läuft unter einer eigenen Subdomain (z. B. `wartung.example.de`) und damit
im Wurzelverzeichnis. Die bestehende Website bleibt unberührt und verlinkt nur dorthin.

Neues Pages-Projekt anlegen, mit dem GitHub-Repository verbinden und so konfigurieren:

| Einstellung | Wert |
|---|---|
| Root directory | `apps/intern` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Framework preset | None |

Umgebungsvariablen (Settings → Environment variables), für Production **und** Preview:

```
VITE_SUPABASE_URL       https://ywmckemniifskxbmmswf.supabase.co
VITE_SUPABASE_ANON_KEY  <anon public key>
```

Ohne diese Werte baut Cloudflare stillschweigend die Demo-Fassung mit lokalen
Beispieldaten — die App sähe funktionsfähig aus, hätte aber keinerlei Verbindung
zur Datenbank.

Die Node-Version steht in `apps/intern/.node-version`, das SPA-Routing in
`apps/intern/public/_redirects` (landet beim Build automatisch in `dist`).

Danach unter *Custom domains* die Subdomain hinzufügen. Jeder Push auf `main`
veröffentlicht automatisch neu.

Empfohlen: **Cloudflare Access** davorschalten, damit die App nur nach einer
zusätzlichen Anmeldung überhaupt erreichbar ist — eine zweite Schutzschicht vor
der Anmeldung in der App selbst.

### Auf einen Unterpfad umstellen

Soll die App später doch unter `example.de/wartung/` laufen: in
`apps/intern/vite.config.ts` `base: '/wartung/'` setzen, in `src/main.tsx` den
`basename` auf `'/wartung'`, und in `public/_redirects` die Pfade entsprechend
anpassen. Mehr ist nicht nötig.

## Grundregeln der Datenhaltung

1. Gerechnet wird ausschließlich mit **kumulativen** Frames. Ein zurückgesetzter oder
   getauschter Zähler erzeugt eine neue Zähler-Epoche; der Gesamtstand läuft weiter.
2. **Nichts wird gelöscht.** Korrekturen sind neue Zeilen mit Verweis auf die alte,
   Stornos setzen `voided_at`. Es gibt keine `DELETE`-Policy.
3. Der aktuelle Stand und der letzte Wartungsstand sind **abgeleitete** Werte (Views).
   Es gibt keine Spalte, die veralten kann.
4. Die Bewertung „fällig / bald fällig / überfällig" existiert **nur** in
   `src/core/maintenance.ts`. Die Datenbank liefert Fakten, sie rechnet nicht.
