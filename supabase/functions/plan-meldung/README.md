# plan-meldung — der Versanddienst

Schickt die Meldung aufs Handy, wenn sich der Dienstplan ändert, und zwar nur
an die Leute, deren eigene Schichten betroffen sind. Angestoßen wird er von der
Datenbank, nicht von der App: so kommt die Meldung auch dann an, wenn niemand
die Seite offen hat.

## Aufbau

| Datei | Zweck |
|---|---|
| `index.ts` | Auswahl der Betroffenen, Abfrage der Geräte, Versand |
| `webpush.ts` | Verschlüsselung und Ausweis (RFC 8291 / 8292) |
| `webpush.probe.ts` | Probe der Rechnerei — `node webpush.probe.ts` |

Ohne fremde Pakete. Der erste Anlauf holte sich `web-push` aus der Node-Welt;
in der Deno-Umgebung von Supabase startete das nicht („BOOT_ERROR"), und weil
ein Startfehler nirgends auffällt, war der Versand still tot. Web Push ist ein
offener Standard, und alles Nötige steckt in der Web-Krypto.

## Prüfen, ohne etwas zu verschicken

```
node webpush.probe.ts
```

Die Probe spielt beide Seiten: sie verschlüsselt mit `webpush.ts` und
entschlüsselt danach auf dem Weg, den der Browser geht. Kommt der Klartext heil
an und hält die Unterschrift der Prüfung stand, stimmt die Rechnung. Die
Schlüssel entstehen dabei frisch — der echte private Schlüssel gehört in kein
Verzeichnis.

## Einrichten

**1. Schlüsselpaar** (einmalig, liegt schon vor):

```
node ../../../apps/intern/scripts/vapid-schluessel.mjs
```

**2. Ausrollen.** Mit der CLI, das ist der verlässliche Weg:

```
npx supabase@latest login
npx supabase@latest functions deploy plan-meldung \
  --project-ref <projekt> --no-verify-jwt
```

`--no-verify-jwt` ist keine Nachlässigkeit: hier ruft die Datenbank an, nicht
ein angemeldeter Mensch. Der Ausweis ist das Geheimwort im Kopf `x-plan-secret`,
und ohne es kommt niemand hinein. Bleibt die JWT-Prüfung an, antwortet der
Dienst der Datenbank mit 401.

**3. Geheimnisse** setzen (Dashboard → Edge Functions → Secrets):

| Name | Inhalt |
|---|---|
| `PLAN_MELDUNG_SECRET` | frei gewähltes Wort, muss mit `app_konfiguration` übereinstimmen |
| `VAPID_PUBLIC_KEY` | öffentlicher Schlüssel aus Schritt 1 |
| `VAPID_PRIVATE_KEY` | privater Schlüssel aus Schritt 1 |
| `VAPID_SUBJECT` | `mailto:…` (freiwillig) |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase selbst.

**4. Datenbank** darauf zeigen lassen:

```sql
insert into app_konfiguration (schluessel, wert) values
  ('meldung_url',    'https://<projekt>.supabase.co/functions/v1/plan-meldung'),
  ('meldung_secret', '<dasselbe Wort wie oben>')
on conflict (schluessel) do update set wert = excluded.wert, updated_at = now();
```

**5. Öffentlichen Schlüssel** in den Bau der App: bei Cloudflare Pages als
`VITE_VAPID_PUBLIC_KEY` unter **Production** eintragen und neu bauen lassen. Er
wird beim Bauen fest eingesetzt, ein späteres Eintragen wirkt erst beim
nächsten Bau.

## Nachsehen, wenn nichts ankommt

Der Dienst beantwortet ein schlichtes `GET` ohne Geheimwort — er sagt, dass er
läuft und welche Einstellungen gesetzt sind, aber niemals deren Inhalt:

```
curl https://<projekt>.supabase.co/functions/v1/plan-meldung
```

Was die Datenbank beim Rufen zurückbekommen hat, steht in `pg_net`:

```sql
select status_code, error_msg, left(content, 300), created
  from net._http_response order by created desc limit 5;
```

| Antwort | Bedeutung |
|---|---|
| kein Eintrag | der Auslöser hat nicht gefeuert |
| 503 `BOOT_ERROR` | der Dienst startet nicht — Logs im Dashboard |
| 401 | Geheimwort passt nicht, oder die JWT-Prüfung ist noch an |
| 200 `{"betroffen":0}` | niemand war betroffen — dann war es keine Änderung an einer Schicht |
| 200 `{"verschickt":0}` mit `betroffen > 0` | die Betroffenen haben kein Gerät angemeldet |
