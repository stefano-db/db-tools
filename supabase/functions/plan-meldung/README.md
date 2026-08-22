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

**4. Datenbank verbinden.** Die Migration `20260823091000_plan_meldung_ausloeser.sql`
legt den Auslöser an. Vorher müssen zwei Werte gesetzt sein, damit die Datenbank
weiß, wohin sie rufen soll:

```sql
alter database postgres set app.meldung_url =
  'https://<projekt>.supabase.co/functions/v1/plan-meldung';
alter database postgres set app.meldung_secret = '<derselbe Wert wie oben>';
```

## Warum es diesen Umweg braucht

Eine Meldung, die auf dem Startbildschirm ankommt, kann nicht von der Seite
kommen — die läuft dann nicht. Der Zustelldienst des Herstellers nimmt sie nur
unterschrieben an, und unterschreiben lässt sich nur dort, wo der private
Schlüssel liegt: auf einem Server. Deshalb diese Funktion.
