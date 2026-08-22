# Meldungen bei geschlossener App

Diese Funktion verschickt die Meldung. Angestoßen wird sie von der Datenbank,
sobald sich eine Woche im Dienstplan ändert.

## Einrichten

**1. Schlüsselpaar erzeugen** (einmalig, auf dem eigenen Rechner):

```
node apps/intern/scripts/vapid-schluessel.mjs
```

**2. Einstellungen der Funktion** (Supabase → Edge Functions → plan-meldung →
Secrets). Der private Schlüssel gehört ausschließlich hierhin:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (etwa `mailto:info@dreambowl.de`)
- `PLAN_MELDUNG_SECRET` (frei gewählt, muss mit dem Wert in der Datenbank übereinstimmen)

**3. Öffentlichen Schlüssel ins Programm** (Cloudflare Pages → Settings →
Environment variables):

- `VITE_VAPID_PUBLIC_KEY` — derselbe öffentliche Schlüssel

Danach neu bauen lassen, sonst kennt das Programm ihn nicht.

**4. Datenbank verbinden.** Zwei Zeilen im SQL-Editor, damit die Datenbank
weiß, wohin sie rufen soll:

```sql
insert into app_konfiguration (schluessel, wert, notiz) values
  ('meldung_url', 'https://<projekt>.supabase.co/functions/v1/plan-meldung', 'Adresse des Versanddienstes'),
  ('meldung_secret', '<derselbe Wert wie oben>', 'Weist den Ruf der Datenbank aus')
on conflict (schluessel) do update set wert = excluded.wert, updated_at = now();
```

Nicht als Datenbankparameter: die Rolle, mit der man auf Supabase arbeitet,
darf keine setzen. Die Tabelle hat bewusst keine Zeilenregeln — damit kommt
über die Schnittstelle niemand an das Geheimwort.

## Warum es diesen Umweg braucht

Eine Meldung, die auf dem Startbildschirm ankommt, kann nicht von der Seite
kommen — die läuft dann nicht. Der Zustelldienst des Herstellers nimmt sie nur
unterschrieben an, und unterschreiben lässt sich nur dort, wo der private
Schlüssel liegt: auf einem Server. Deshalb diese Funktion.
