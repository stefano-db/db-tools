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
    /**
     * Die Einstellungen des Betriebs. Sie stehen in der Datenbank und nicht in
     * vier Feldern einer Oberflaeche: dort muss man dasselbe Wort zweimal
     * fehlerfrei eintippen, und ein Vertipper bleibt still — der Dienst
     * antwortet dann 401 und niemand weiss, warum.
     */
    async einstellungen(): Promise<Record<string, string>> {
      const a = await fetch(`${url}/rest/v1/app_konfiguration?select=schluessel,wert`, {
        headers: kopf,
      });
      if (!a.ok) return {};
      const zeilen = (await a.json()) as { schluessel: string; wert: string }[];
      return Object.fromEntries(zeilen.map((z) => [z.schluessel, z.wert]));
    },
  };
}

// --- Der Dienst --------------------------------------------------------------

Deno.serve(async (anfrage) => {
  const umgebung = (name: string) => Deno.env.get(name) ?? '';
  const db = datenbank(umgebung('SUPABASE_URL'), umgebung('SUPABASE_SERVICE_ROLE_KEY'));

  // Wo ein Wert herkommt, ist zweitrangig, solange er da ist. Die Umgebung hat
  // Vorrang — wer den Dienst lieber ueber Geheimnisse einrichtet, kann das —,
  // aber ohne sie genuegt die Datenbank. Dann ist alles an einer Stelle.
  const konf = await db.einstellungen();
  const wert = (name: string, feld: string) => umgebung(name) || konf[feld] || '';
  const geheim = wert('PLAN_MELDUNG_SECRET', 'meldung_secret');
  const oeffentlich = wert('VAPID_PUBLIC_KEY', 'vapid_oeffentlich');
  const privat = wert('VAPID_PRIVATE_KEY', 'vapid_privat');
  const absender = wert('VAPID_SUBJECT', 'vapid_absender') || 'mailto:info@dreambowl.de';

  // Ein Blick von aussen, ohne Geheimwort: laeuft der Dienst, und ist er
  // eingerichtet? Die Werte selbst gibt er nie heraus — nur ob sie da sind und
  // woher sie kommen. Ohne diese Auskunft bleibt bei einem Fehlschlag nur
  // Raten, und Raten hat uns hier schon genug Zeit gekostet.
  if (anfrage.method === 'GET') {
    const woher = (name: string, feld: string) =>
      umgebung(name) ? 'Umgebung' : konf[feld] ? 'Datenbank' : 'FEHLT';
    return Response.json({
      dienst: 'plan-meldung',
      laeuft: true,
      datenbank: umgebung('SUPABASE_URL') !== '' && umgebung('SUPABASE_SERVICE_ROLE_KEY') !== '',
      einstellungen: {
        geheimwort: woher('PLAN_MELDUNG_SECRET', 'meldung_secret'),
        vapid_oeffentlich: woher('VAPID_PUBLIC_KEY', 'vapid_oeffentlich'),
        vapid_privat: woher('VAPID_PRIVATE_KEY', 'vapid_privat'),
      },
      bereit: geheim !== '' && oeffentlich !== '' && privat !== '',
    });
  }

  // Nur die Datenbank darf hier hineinrufen. Ohne diese Pruefung koennte
  // jeder, der die Adresse kennt, Meldungen an die Belegschaft schicken.
  if (!geheim || anfrage.headers.get('x-plan-secret') !== geheim) {
    return new Response('Nicht erlaubt', { status: 401 });
  }

  if (!oeffentlich || !privat) {
    return Response.json({ fehler: 'VAPID-Schlüssel fehlen' }, { status: 500 });
  }

  const { week_start, data, old_data } = await anfrage.json();

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
      `push_geraete?select=id,endpunkt,p256dh,auth,fehler&user_id=eq.${person.profile_id}`,
    )) as { id: string; endpunkt: string; p256dh: string; auth: string; fehler: number }[];

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
          // Sonstiges ist oft voruebergehend — Netz, Ueberlastung —, kann aber
          // auch heissen, dass die Anmeldung nicht mehr zu unserem Schluessel
          // passt (403). Beides sieht hier gleich aus, also wird gezaehlt statt
          // geraten: nach fuenf Fehlschlaegen in Folge ist ein Geraet tot und
          // fliegt raus. Sonst schickt der Dienst bei jeder Aenderung bis in
          // alle Ewigkeit ins Leere.
          const bisher = (geraet.fehler ?? 0) + 1;
          console.error('Zustellung abgelehnt', antwort.status, bisher, await antwort.text());
          if (bisher >= 5) {
            await db.loeschen(`push_geraete?id=eq.${geraet.id}`);
            entfernt++;
          } else {
            await db.aendern(`push_geraete?id=eq.${geraet.id}`, { fehler: bisher });
          }
        }
      } catch (fehler) {
        console.error('Versand fehlgeschlagen', String(fehler));
      }
    }
  }

  return Response.json({ betroffen, verschickt, entfernt });
});
