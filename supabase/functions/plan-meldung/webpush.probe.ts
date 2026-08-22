/**
 * Probe der Web-Push-Rechnerei.
 *
 *   node webpush.probe.ts
 *
 * Sie spielt beides: den Versand und das Handy. Verschlüsselt wird mit dem
 * Code daneben, entschlüsselt auf dem Weg, den der Browser geht — kommt der
 * Klartext heil an, stimmt die Rechnung. Der Ausweis wird gegen den
 * öffentlichen Schlüssel geprüft, also gegen genau das, was auch Apple und
 * Google prüfen.
 *
 * Die Schlüssel entstehen hier frisch. Der echte private Schlüssel hat in
 * einem Verzeichnis nichts verloren, und für die Rechnung ist er nicht nötig.
 */
import { ausB64url, inB64url, verketten, hkdf, ausweis, verschluesseln } from './webpush.ts';

const text = (s: string) => new TextEncoder().encode(s);
let fehler = 0;
const pruefe = (was: string, ok: boolean, zusatz = '') => {
  console.log(`${ok ? 'ok  ' : 'FEHL'}  ${was}${zusatz ? '  — ' + zusatz : ''}`);
  if (!ok) fehler++;
};

// Ein Schlüsselpaar, wie es das Skript daneben erzeugt.
const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
const OEFF = inB64url(new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey)));
const PRIV = jwk.d!;

// --- Ausweis -----------------------------------------------------------------
const oeff = ausB64url(OEFF);
pruefe('Schlüssel ist ein unkomprimierter P-256-Punkt', oeff.length === 65 && oeff[0] === 4);

const kopf = await ausweis('https://web.push.apple.com/abc123', OEFF, PRIV, 'mailto:info@dreambowl.de');
const marke = /^vapid t=([^,]+), k=(.+)$/.exec(kopf)![1];
const [k1, k2, k3] = marke.split('.');

const pruefer = await crypto.subtle.importKey(
  'jwk',
  { kty: 'EC', crv: 'P-256', x: inB64url(oeff.slice(1, 33)), y: inB64url(oeff.slice(33, 65)), ext: true },
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);
pruefe(
  'Unterschrift hält der Prüfung stand',
  await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pruefer, ausB64url(k3), text(`${k1}.${k2}`)),
);

const nutz = JSON.parse(new TextDecoder().decode(ausB64url(k2)));
pruefe('Ausweis nennt den Zustelldienst als Empfänger', nutz.aud === 'https://web.push.apple.com', nutz.aud);
pruefe('Ausweis läuft in höchstens 24 Stunden ab', nutz.exp - Math.floor(Date.now() / 1000) <= 86400);
pruefe('Ausweis nennt einen Absender', typeof nutz.sub === 'string' && nutz.sub.includes('@'));
pruefe('Kopfzeile trägt den öffentlichen Schlüssel', kopf.endsWith(`k=${OEFF}`));

// --- Verschlüsselung ---------------------------------------------------------
const handy = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const handyPub = new Uint8Array(await crypto.subtle.exportKey('raw', handy.publicKey));
const geheimwort = crypto.getRandomValues(new Uint8Array(16));

const klartext = JSON.stringify({
  titel: 'Deine Schicht hat sich geändert',
  text: 'Montag: 14:30–23:00 (vorher frei)',
});
const paket = await verschluesseln(inB64url(handyPub), inB64url(geheimwort), klartext);

const salz = paket.slice(0, 16);
const satzgroesse = new DataView(paket.buffer, paket.byteOffset).getUint32(16);
const laenge = paket[20];
const absenderPub = paket.slice(21, 21 + laenge);
const chiffre = paket.slice(21 + laenge);

pruefe('Satzgröße im Kopf ist größer als der Inhalt', satzgroesse >= chiffre.length, `${satzgroesse} ≥ ${chiffre.length}`);
pruefe('Schlüssellänge im Kopf ist 65', laenge === 65, String(laenge));

const gegen = await crypto.subtle.importKey('raw', absenderPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const gemeinsam = new Uint8Array(
  await crypto.subtle.deriveBits({ name: 'ECDH', public: gegen }, handy.privateKey, 256),
);
const ikm = await hkdf(geheimwort, gemeinsam, verketten(text('WebPush: info\0'), handyPub, absenderPub), 32);
const schluessel = await hkdf(salz, ikm, text('Content-Encoding: aes128gcm\0'), 16);
const einmal = await hkdf(salz, ikm, text('Content-Encoding: nonce\0'), 12);
const aes = await crypto.subtle.importKey('raw', schluessel, 'AES-GCM', false, ['decrypt']);

let entziffert = '';
try {
  const roh = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: einmal }, aes, chiffre));
  pruefe('Klartext endet mit dem Abschlusszeichen 0x02', roh[roh.length - 1] === 2);
  entziffert = new TextDecoder().decode(roh.slice(0, -1));
} catch (e) {
  pruefe('Entschlüsselung gelingt', false, String(e));
}
pruefe('Das Handy liest genau das, was verschickt wurde', entziffert === klartext);

// Zweimal dasselbe verschicken darf nie dasselbe Paket ergeben — sonst wäre
// der Einmalschlüssel keiner.
const a = await verschluesseln(inB64url(handyPub), inB64url(geheimwort), klartext);
const b = await verschluesseln(inB64url(handyPub), inB64url(geheimwort), klartext);
pruefe('Jeder Versand nimmt frisches Salz und frischen Schlüssel', inB64url(a) !== inB64url(b));

console.log(fehler === 0 ? '\nAlles bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
