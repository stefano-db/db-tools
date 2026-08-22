/**
 * Schlüssel und Geheimwort des Meldungsversands austauschen.
 *
 *   node scripts/meldung-schluessel-wechseln.mjs
 *
 * Warum ein eigenes Skript und nicht der Griff zum Schlüsselerzeuger daneben:
 * Ein Wechsel besteht aus drei Teilen, die zusammenpassen müssen — der Eintrag
 * in der Datenbank, der Wert im Bau der App, und ein Gerät, das sich danach neu
 * anmeldet. Wer die Teile einzeln zusammensucht, vergisst einen, und der Ausfall
 * zeigt sich erst Tage später als eine Meldung, die nicht kommt.
 *
 * Hier entsteht alles in einem Zug, fertig zum Einsetzen. Nichts davon geht
 * über eine fremde Leitung: Das Skript rechnet auf diesem Rechner und schreibt
 * nichts in eine Datei. Was hier auf dem Bildschirm steht, hat sonst niemand
 * gesehen — auch kein Chatverlauf.
 *
 * Wann man wechselt: wenn ein Schlüssel irgendwo gestanden hat, wo er nicht
 * hingehört. Und je eher, desto billiger — jedes angemeldete Gerät muss sich
 * danach einmal neu anmelden.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const projekt = process.argv[2] ?? 'ywmckemniifskxbmmswf';

const alsBase64Url = (puffer) =>
  puffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// Unkomprimierte Form: ein Byte 0x04, dann beide Koordinaten — die letzten 65
// Bytes der DER-Form sind genau das.
const oeffentlichDer = publicKey.export({ type: 'spki', format: 'der' });
const oeffentlich = alsBase64Url(oeffentlichDer.subarray(oeffentlichDer.length - 65));

// Der private Schlüssel ist der 32 Byte lange Skalar aus der DER-Form.
const privatDer = privateKey.export({ type: 'pkcs8', format: 'der' });
const start = privatDer.indexOf(Buffer.from([0x04, 0x20])) + 2;
const privat = alsBase64Url(privatDer.subarray(start, start + 32));

const geheimwort = randomBytes(24).toString('base64url');

const strich = '─'.repeat(76);

console.log(`
${strich}
 SCHRITT 1 — im SQL-Editor von Supabase ausführen
${strich}

insert into app_konfiguration (schluessel, wert) values
  ('meldung_url',       'https://${projekt}.supabase.co/functions/v1/plan-meldung'),
  ('meldung_secret',    '${geheimwort}'),
  ('vapid_oeffentlich', '${oeffentlich}'),
  ('vapid_privat',      '${privat}'),
  ('vapid_absender',    'mailto:info@dreambowl.de')
on conflict (schluessel) do update set wert = excluded.wert, updated_at = now();

grant select on app_konfiguration to service_role;

${strich}
 SCHRITT 2 — bei Cloudflare Pages, unter Production
${strich}

 Name:  VITE_VAPID_PUBLIC_KEY
 Wert:  ${oeffentlich}

 Danach neu bauen lassen. Der Schlüssel wird beim Bauen fest eingesetzt; ein
 späteres Eintragen wirkt erst beim nächsten Bau.

${strich}
 SCHRITT 3 — die Geräte
${strich}

 Jedes angemeldete Gerät meldet sich einmal neu an: App öffnen, Profil, dann
 „Dieses Gerät anmelden". Die App erkennt die alte Anmeldung von selbst als
 wertlos und räumt sie weg — der Knopf erscheint also wieder.

${strich}

 Der private Schlüssel steht nur hier und gleich in der Datenbank. Kein
 Chatverlauf, keine Datei, keine Verwaltung des Quelltexts. Wenn dieses
 Fenster zu ist, ist er nur noch dort, wo er hingehört.
`);
