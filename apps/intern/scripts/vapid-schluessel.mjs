/**
 * Schlüsselpaar für den Versand von Meldungen erzeugen.
 *
 * Der Zustelldienst jedes Herstellers — Apple, Google, Mozilla — nimmt eine
 * Nachricht nur an, wenn sie unterschrieben ist. Dafür braucht es ein
 * Schlüsselpaar: den öffentlichen kennt das Gerät bei der Anmeldung, mit dem
 * privaten unterschreibt der Dienst beim Versand.
 *
 * Ohne Zusatzpakete, damit man dafür nichts installieren muss:
 *   node scripts/vapid-schluessel.mjs
 *
 * Der private Schlüssel gehört ausschließlich in die Einstellungen des
 * Servers — nie in das Programm, nie in die Verwaltung des Quelltexts.
 */
import { generateKeyPairSync } from 'node:crypto';

// Als Schlüsselobjekte, nicht als Text: daraus lassen sich beide Formen
// unmittelbar ableiten.
const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const alsBase64Url = (puffer) =>
  puffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Der öffentliche Schlüssel wird unkomprimiert erwartet: ein Byte 0x04, dann
// die beiden Koordinaten. In der DER-Form stehen sie am Ende — die letzten 65
// Bytes sind genau das.
const oeffentlichDer = publicKey.export({ type: 'spki', format: 'der' });
const oeffentlich = alsBase64Url(oeffentlichDer.subarray(oeffentlichDer.length - 65));

// Der private Schlüssel ist der 32 Byte lange Skalar aus der DER-Form.
const privatDer = privateKey.export({ type: 'pkcs8', format: 'der' });
const start = privatDer.indexOf(Buffer.from([0x04, 0x20])) + 2;
const privat = alsBase64Url(privatDer.subarray(start, start + 32));

console.log('');
console.log('Öffentlicher Schlüssel (kommt in die Umgebung des Programms):');
console.log('VITE_VAPID_PUBLIC_KEY=' + oeffentlich);
console.log('');
console.log('Privater Schlüssel (kommt in die Einstellungen der Funktion, sonst nirgendwohin):');
console.log('VAPID_PRIVATE_KEY=' + privat);
console.log('');
console.log('Absender (eine erreichbare Adresse, verlangen die Zustelldienste):');
console.log('VAPID_SUBJECT=mailto:info@dreambowl.de');
console.log('');
