# Urkundensystem — freie Fassung

Dasselbe Werkzeug wie in der Plattform, nur ohne Anmeldung: eine Seite, die
jeder öffnen kann, der die Adresse hat.

## Was anders ist

| | Plattform (`/urkunden`) | Diese Fassung |
|---|---|---|
| Anmeldung | nötig, Freigabe für „urkunden" | keine |
| Events | geteilt, alle am Counter sehen dieselben | je Gerät eigene |
| Ablage | Supabase | Browser des Betrachters |
| Aufräumen | täglich in der Datenbank | beim Öffnen, nach 7 Tagen |

Die Trennung ist gewollt. Wer die Adresse hat, kommt hinein — es darf deshalb
nichts darin liegen, was nicht jeder sehen soll. Spielernamen eines Abends sind
dafür harmlos; sie verlassen das Gerät ohnehin nicht.

**Zwei Leute an derselben Liste gehen hier nicht.** Was am Counter eingetragen
wird, sieht der Rechner im Büro nicht. Dafür ist die Fassung in der Plattform
da.

## Online stellen

Ein eigenes Cloudflare-Pages-Projekt, aus demselben Repo:

1. Cloudflare → Workers & Pages → **Create** → Pages → Git-Repo verbinden
2. Repository: `stefano-db/db-tools`
3. **Build command:** leer lassen
4. **Build output directory:** `apps/urkunden`
5. Umgebungsvariablen: keine

Es gibt nichts zu bauen — die Seite ist fertiges HTML. Jeder Push auf `main`
stellt sie neu.

## Prüfen

Vor dem Veröffentlichen lokal ansehen:

```bash
cd apps/urkunden && python3 -m http.server 5320
```

Die Prüfung des Excel-Imports liegt bei der Plattform-Fassung und gilt für
beide, weil der Parser derselbe ist:

```bash
npm run pruefe:urkunden --prefix apps/intern
```

## Wenn beide Fassungen gepflegt werden

`index.html` ist eine Kopie von `apps/intern/public/urkunden/index.html`, aus
der drei Dinge entfernt wurden: die Anmeldung, der Meldungs-Reiter und die
Verweise in die Plattform. Eine Änderung am Werkzeug selbst — am Parser, am
Urkunden-Layout, am Druck — gehört in beide Dateien.

`anleitung.html` gibt es nur hier. In der Plattform-Fassung zeigt der
Anleitungs-Knopf auf dieselbe Datei, die dort aber fehlt — Cloudflare liefert
dann die Plattform aus, was wie ein Neustart aussieht. Wer das dort auch
beheben will, kopiert die Datei hinüber und passt die drei Karten unter „Gut zu
wissen" an: dort sind die Events geteilt und liegen nicht im Browser.
