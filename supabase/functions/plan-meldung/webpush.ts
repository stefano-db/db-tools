/**
 * Web Push von Hand — Verschlüsselung und Ausweis.
 *
 * Steht getrennt, damit es sich ohne Deno und ohne Netz prüfen lässt: die
 * Probe daneben verschlüsselt mit diesem Code und entschlüsselt anschließend
 * so, wie es der Browser tut. Ein Fehler in dieser Rechnerei bliebe sonst
 * unsichtbar — man sähe nur, dass keine Meldung ankommt.
 *
 * RFC 8291 (Verschlüsselung), RFC 8292 (Ausweis), RFC 8188 (Aufbau).
 */

// --- Kleinkram ---------------------------------------------------------------

function ausB64url(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const roh = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  const aus = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) aus[i] = roh.charCodeAt(i);
  return aus;
}

function inB64url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function verketten(...teile: Uint8Array[]): Uint8Array {
  const aus = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let i = 0;
  for (const t of teile) {
    aus.set(t, i);
    i += t.length;
  }
  return aus;
}

const text = (s: string) => new TextEncoder().encode(s);

async function hkdf(salz: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const roh = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salz, info },
    k,
    bytes * 8,
  );
  return new Uint8Array(roh);
}

// --- Ausweis gegenüber dem Zustelldienst (VAPID, RFC 8292) -------------------

/**
 * Apple und Google nehmen eine Meldung nur an, wenn der Absender sich
 * ausweist: ein kurzlebiges, signiertes Papier, das sagt „ich bin derselbe,
 * dessen Schlüssel im Gerät hinterlegt ist". Signiert wird mit dem privaten
 * Teil des Schlüsselpaares; der öffentliche steckt im Programm auf dem Handy.
 */
async function ausweis(endpunkt: string, oeffentlich: string, privat: string, absender: string) {
  const oeff = ausB64url(oeffentlich); // 0x04 || X || Y
  const schluessel = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: privat,
      x: inB64url(oeff.slice(1, 33)),
      y: inB64url(oeff.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const kopf = inB64url(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const inhalt = inB64url(
    text(
      JSON.stringify({
        aud: new URL(endpunkt).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: absender,
      }),
    ),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, schluessel, text(`${kopf}.${inhalt}`)),
  );
  return `vapid t=${kopf}.${inhalt}.${inB64url(sig)}, k=${oeffentlich}`;
}

// --- Verschlüsselung des Inhalts (aes128gcm, RFC 8291) -----------------------

/**
 * Der Zustelldienst darf den Inhalt nicht lesen können. Verschlüsselt wird
 * mit einem Schlüssel, den nur dieses eine Gerät und dieser eine Versand
 * kennen: aus einem frisch erzeugten Paar und dem Schlüssel des Geräts wird
 * ein gemeinsames Geheimnis gerechnet, daraus der eigentliche Schlüssel.
 */
async function verschluesseln(p256dh: string, auth: string, klartext: string) {
  const geraetePub = ausB64url(p256dh); // 65 Byte
  const geheimwort = ausB64url(auth); // 16 Byte

  const eigen = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const eigenPub = new Uint8Array(await crypto.subtle.exportKey('raw', eigen.publicKey));

  const gegen = await crypto.subtle.importKey(
    'raw',
    geraetePub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const gemeinsam = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: gegen }, eigen.privateKey, 256),
  );

  const ikm = await hkdf(
    geheimwort,
    gemeinsam,
    verketten(text('WebPush: info\0'), geraetePub, eigenPub),
    32,
  );

  const salz = crypto.getRandomValues(new Uint8Array(16));
  const schluessel = await hkdf(salz, ikm, text('Content-Encoding: aes128gcm\0'), 16);
  const einmalzahl = await hkdf(salz, ikm, text('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', schluessel, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: einmalzahl },
      aes,
      verketten(text(klartext), new Uint8Array([2])), // 0x02 schliesst den Klartext ab
    ),
  );

  // Kopf nach RFC 8188: Salz, Satzgröße, Länge des Schlüssels, Schlüssel.
  const kopf = new Uint8Array(16 + 4 + 1 + 65);
  kopf.set(salz, 0);
  new DataView(kopf.buffer).setUint32(16, 4096);
  kopf[20] = 65;
  kopf.set(eigenPub, 21);
  return verketten(kopf, chiffre);
}

export { ausB64url, inB64url, verketten, hkdf, ausweis, verschluesseln };
