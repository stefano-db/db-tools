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
 * Deno, läuft als Supabase Edge Function.
 */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Tag = { status?: string; b?: string; e?: string };

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

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

Deno.serve(async (anfrage) => {
  // Nur die Datenbank darf hier hineinrufen. Ohne diese Pruefung koennte
  // jeder, der die Adresse kennt, Meldungen an die Belegschaft schicken.
  const geheim = Deno.env.get('PLAN_MELDUNG_SECRET');
  if (!geheim || anfrage.headers.get('x-plan-secret') !== geheim) {
    return new Response('Nicht erlaubt', { status: 401 });
  }

  const { week_start, data, old_data } = await anfrage.json();

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@dreambowl.de',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // Dienstschluessel: die Zuordnung von Namen zu Konten und die Geraete
    // stehen hinter Zeilenrechten, und dieser Dienst handelt fuer niemanden
    // bestimmten.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: leute } = await db
    .from('roster_employees')
    .select('id, name, profile_id')
    .eq('active', true)
    .not('profile_id', 'is', null);

  let verschickt = 0;
  let entfernt = 0;

  for (const person of leute ?? []) {
    const vorher = (old_data?.[person.id]?.d ?? []) as Tag[];
    const nachher = (data?.[person.id]?.d ?? []) as Tag[];
    const meine = unterschied(vorher, nachher);
    if (meine.length === 0) continue; // betrifft diese Person nicht

    const { data: geraete } = await db
      .from('push_geraete')
      .select('id, endpunkt, p256dh, auth')
      .eq('user_id', person.profile_id);

    const nachricht = JSON.stringify({
      titel: 'Deine Schicht hat sich geändert',
      text: meine.join(', '),
      ziel: '/dienstplan',
      woche: week_start,
    });

    for (const geraet of geraete ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: geraet.endpunkt,
            keys: { p256dh: geraet.p256dh, auth: geraet.auth },
          },
          nachricht,
        );
        verschickt++;
        await db.from('push_geraete').update({ last_ok_at: new Date().toISOString(), fehler: 0 }).eq('id', geraet.id);
      } catch (fehler) {
        const code = (fehler as { statusCode?: number }).statusCode;
        // 404 und 410 heissen: dieses Geraet gibt es nicht mehr. Behalten
        // wuerde nur dazu fuehren, dass bei jeder Aenderung ins Leere
        // geschickt wird.
        if (code === 404 || code === 410) {
          await db.from('push_geraete').delete().eq('id', geraet.id);
          entfernt++;
        } else {
          // Andere Fehler sind voruebergehend (Netz, Ueberlastung). Das Geraet
          // bleibt stehen; beim naechsten Mal klappt es meist.
          await db
            .from('push_geraete')
            .update({ fehler: (geraet as { fehler?: number }).fehler ?? 0 })
            .eq('id', geraet.id);
        }
      }
    }
  }

  return Response.json({ verschickt, entfernt });
});
