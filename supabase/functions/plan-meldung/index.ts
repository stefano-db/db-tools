/**
 * Versand der Meldungen bei geschlossener App.
 *
 * Wird von der Datenbank angestoßen, sobald sich eine Woche im Dienstplan
 * ändert. Sie bekommt den alten und den neuen Stand und entscheidet je Person,
 * ob und was gemeldet wird.
 *
 * Der Kern ist nicht der Versand, sondern die Auswahl: „Der Dienstplan wurde
 * geändert" an neunzehn Leute zu schicken, wenn sich eine einzige Schicht
 * geändert hat, ist achtzehnmal eine Störung. Gemeldet wird deshalb nur, wer
 * betroffen ist — und dem wird gesagt, was sich für ihn geändert hat.
 *
 * Ohne fremde Pakete. Der erste Anlauf holte sich „web-push" aus der
 * Node-Welt und startete in der Deno-Umgebung nicht („BOOT_ERROR"), womit der
 * ganze Versand tot war, ohne dass es irgendwo auffiel. Web Push ist aber ein
 * offener Standard (RFC 8291 für die Verschlüsselung, RFC 8292 für den
 * Ausweis), und alles, was er braucht, steckt in der Web-Krypto: ECDH,
 * HKDF, AES-GCM, ECDSA. Der Code darunter ist länger als ein Import, dafür
 * kann er nicht mehr an einer fremden Abhängigkeit scheitern.
 *
 * Deno, läuft als Supabase Edge Function.
 */

import { ausweis, verschluesseln } from './webpush.ts';

type Tag = { status?: string; b?: string; e?: string };

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// --- Was gemeldet wird -------------------------------------------------------

/**
 * Wie ein Tag in einer Meldung heißt.
 *
 * „Nicht eingeteilt" und „frei" fallen zusammen: für den Menschen, der die
 * Meldung liest, heißt beides, dass er nicht arbeitet. Ohne diese
 * Gleichsetzung meldete eine frisch angelegte Woche alle sieben Tage.
 */
function inWorten(tag?: Tag): string {
  if (!tag) return 'frei';
  if (tag.status === 'dienst' && tag.b) return `${tag.b}–${tag.e}`;
  if (tag.status === 'urlaub') return 'Urlaub';
  if (tag.status === 'krank') return 'krank';
  return 'frei';
}

function unterschied(vorher: Tag[], nachher: Tag[]): string[] {
  const liste: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = inWorten(vorher[i]);
    const b = inWorten(nachher[i]);
    if (a !== b) liste.push(`${TAGE[i]}: ${b} (vorher ${a})`);
  }
  return liste;
}

// --- Datenbank ---------------------------------------------------------------

/**
 * Unmittelbar über die Schnittstelle statt über eine Bibliothek — es sind vier
 * Zugriffe, und jedes Paket weniger ist ein Startfehler weniger.
 */
function datenbank(url: string, schluessel: string) {
  const kopf = {
    apikey: schluessel,
    Authorization: `Bearer ${schluessel}`,
    'Content-Type': 'application/json',
  };
  return {
    async holen(pfad: string) {
      const a = await fetch(`${url}/rest/v1/${pfad}`, { headers: kopf });
      return a.ok ? await a.json() : [];
    },
    async aendern(pfad: string, werte: unknown) {
      await fetch(`${url}/rest/v1/${pfad}`, {
        method: 'PATCH',
        headers: { ...kopf, Prefer: 'return=minimal' },
        body: JSON.stringify(werte),
      });
    },
    async loeschen(pfad: string) {
      await fetch(`${url}/rest/v1/${pfad}`, { method: 'DELETE', headers: kopf });
    },
  };
}

// --- Der Dienst --------------------------------------------------------------

Deno.serve(async (anfrage) => {
  const umgebung = (name: string) => Deno.env.get(name) ?? '';

  // Ein Blick von aussen, ohne Geheimnis: laeuft der Dienst, und sind seine
  // Einstellungen gesetzt? Die Werte selbst gibt er nicht heraus, nur ob sie
  // da sind. Ohne diese Auskunft bleibt bei einem Fehlschlag nur Raten.
  if (anfrage.method === 'GET') {
    return Response.json({
      dienst: 'plan-meldung',
      laeuft: true,
      eingerichtet: {
        PLAN_MELDUNG_SECRET: umgebung('PLAN_MELDUNG_SECRET') !== '',
        VAPID_PUBLIC_KEY: umgebung('VAPID_PUBLIC_KEY') !== '',
        VAPID_PRIVATE_KEY: umgebung('VAPID_PRIVATE_KEY') !== '',
        SUPABASE_URL: umgebung('SUPABASE_URL') !== '',
        SUPABASE_SERVICE_ROLE_KEY: umgebung('SUPABASE_SERVICE_ROLE_KEY') !== '',
      },
    });
  }

  // Nur die Datenbank darf hier hineinrufen. Ohne diese Pruefung koennte
  // jeder, der die Adresse kennt, Meldungen an die Belegschaft schicken.
  const geheim = umgebung('PLAN_MELDUNG_SECRET');
  if (!geheim || anfrage.headers.get('x-plan-secret') !== geheim) {
    return new Response('Nicht erlaubt', { status: 401 });
  }

  const oeffentlich = umgebung('VAPID_PUBLIC_KEY');
  const privat = umgebung('VAPID_PRIVATE_KEY');
  if (!oeffentlich || !privat) {
    return Response.json({ fehler: 'VAPID-Schlüssel fehlen' }, { status: 500 });
  }
  const absender = umgebung('VAPID_SUBJECT') || 'mailto:info@dreambowl.de';

  const { week_start, data, old_data } = await anfrage.json();
  const db = datenbank(umgebung('SUPABASE_URL'), umgebung('SUPABASE_SERVICE_ROLE_KEY'));

  const leute = (await db.holen(
    'roster_employees?select=id,name,profile_id&active=eq.true&profile_id=not.is.null',
  )) as { id: string; name: string; profile_id: string }[];

  let verschickt = 0;
  let entfernt = 0;
  let betroffen = 0;

  for (const person of leute) {
    const meine = unterschied(
      (old_data?.[person.id]?.d ?? []) as Tag[],
      (data?.[person.id]?.d ?? []) as Tag[],
    );
    if (meine.length === 0) continue; // betrifft diese Person nicht
    betroffen++;

    const geraete = (await db.holen(
      `push_geraete?select=id,endpunkt,p256dh,auth&user_id=eq.${person.profile_id}`,
    )) as { id: string; endpunkt: string; p256dh: string; auth: string }[];

    const nachricht = JSON.stringify({
      titel: 'Deine Schicht hat sich geändert',
      text: meine.join(', '),
      ziel: '/dienstplan',
      woche: week_start,
    });

    for (const geraet of geraete) {
      try {
        const antwort = await fetch(geraet.endpunkt, {
          method: 'POST',
          headers: {
            TTL: '86400',
            Urgency: 'normal',
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            Authorization: await ausweis(geraet.endpunkt, oeffentlich, privat, absender),
          },
          body: await verschluesseln(geraet.p256dh, geraet.auth, nachricht),
        });

        if (antwort.ok) {
          verschickt++;
          await db.aendern(`push_geraete?id=eq.${geraet.id}`, {
            last_ok_at: new Date().toISOString(),
            fehler: 0,
          });
        } else if (antwort.status === 404 || antwort.status === 410) {
          // Dieses Geraet gibt es nicht mehr. Behalten hiesse, bei jeder
          // Aenderung ins Leere zu schicken.
          await db.loeschen(`push_geraete?id=eq.${geraet.id}`);
          entfernt++;
        } else {
          // Sonstiges ist meist voruebergehend. Der Zaehler macht sichtbar,
          // wenn ein Geraet dauerhaft klemmt.
          console.error('Zustellung abgelehnt', antwort.status, await antwort.text());
          await db.aendern(`push_geraete?id=eq.${geraet.id}`, { fehler: 1 });
        }
      } catch (fehler) {
        console.error('Versand fehlgeschlagen', String(fehler));
      }
    }
  }

  return Response.json({ betroffen, verschickt, entfernt });
});
