import { repository } from '../../data';

/**
 * Anmeldung des Geräts für Meldungen bei geschlossener App.
 *
 * Drei Dinge müssen dafür zusammenkommen, und jedes kann für sich fehlen:
 * die Erlaubnis des Menschen, ein Dienst im Hintergrund, und eine Adresse beim
 * Zustelldienst des Herstellers. Diese Datei führt sie zusammen und sagt beim
 * Scheitern, welches der drei gefehlt hat — „hat nicht geklappt" wäre hier
 * wertlos, weil die Abhilfe je nach Ursache eine völlig andere ist.
 *
 * Am iPhone geht das nur, wenn die App auf dem Startbildschirm liegt. Das ist
 * keine Einstellung, die man ändern kann, sondern eine Vorgabe von Apple.
 */

/** Der öffentliche Schlüssel des Versanddienstes; ohne ihn geht keine Anmeldung. */
const OEFFENTLICHER_SCHLUESSEL = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export type PushStand =
  | { art: 'angemeldet'; geraet: string }
  | { art: 'abgemeldet' }
  | { art: 'unmoeglich'; grund: string };

/** Base64url in Bytes — so erwartet es die Schnittstelle des Browsers. */
function schluesselAlsBytes(base64url: string): ArrayBuffer {
  const rest = '='.repeat((4 - (base64url.length % 4)) % 4);
  const roh = atob((base64url + rest).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes.buffer;
}

function alsBase64(puffer: ArrayBuffer | null): string {
  if (!puffer) return '';
  // base64url, nicht gewoehnliches Base64: diese Werte wandern spaeter durch
  // Adressen und Kopfzeilen, in denen + und / etwas anderes bedeuten.
  return btoa(String.fromCharCode(...new Uint8Array(puffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Woran man das Gerät später wiedererkennt. */
function geraetename(): string {
  const u = navigator.userAgent;
  const system = /iPhone|iPad/.test(u)
    ? 'iPhone'
    : /Android/.test(u)
      ? 'Android'
      : /Mac/.test(u)
        ? 'Mac'
        : /Windows/.test(u)
          ? 'Windows'
          : 'Gerät';
  const app = window.matchMedia('(display-mode: standalone)').matches ? 'App' : 'Browser';
  return `${system} · ${app}`;
}

export async function pruefeStand(): Promise<PushStand> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { art: 'unmoeglich', grund: 'Dieses Gerät kennt keine Meldungen im Hintergrund.' };
  }
  if (!OEFFENTLICHER_SCHLUESSEL) {
    return { art: 'unmoeglich', grund: 'Der Versanddienst ist noch nicht eingerichtet.' };
  }

  const dienst = await navigator.serviceWorker.getRegistration();
  const anmeldung = await dienst?.pushManager.getSubscription();
  if (!anmeldung) return { art: 'abgemeldet' };

  // Der Browser allein beweist nichts. Er weiss, dass er angemeldet ist —
  // ob der Eintrag in der Datenbank ankam, weiss er nicht, und ohne ihn
  // schickt niemand etwas. Genau so stand hier einmal wochenlang
  // „angemeldet", waehrend die Tabelle leer war.
  try {
    if (await repository.pushGeraetBekannt(anmeldung.endpoint)) {
      return { art: 'angemeldet', geraet: geraetename() };
    }
    // Angemeldet ist das Geraet ja; es fehlt nur der Eintrag. Den holen wir
    // nach, statt den Menschen noch einmal einen Knopf suchen zu lassen.
    await nachtragen(anmeldung);
    return { art: 'angemeldet', geraet: geraetename() };
  } catch (fehler) {
    return {
      art: 'unmoeglich',
      grund: `Die Anmeldung steht nicht in der Datenbank: ${
        fehler instanceof Error ? fehler.message : String(fehler)
      }`,
    };
  }
}

function nachtragen(anmeldung: PushSubscription): Promise<void> {
  return repository.pushGeraetSpeichern({
    endpunkt: anmeldung.endpoint,
    p256dh: alsBase64(anmeldung.getKey('p256dh')),
    auth: alsBase64(anmeldung.getKey('auth')),
    bezeichnung: geraetename(),
  });
}

export async function meldeAn(): Promise<PushStand> {
  const stand = await pruefeStand();
  if (stand.art === 'unmoeglich') return stand;

  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== 'granted') {
    return {
      art: 'unmoeglich',
      grund:
        erlaubnis === 'denied'
          ? 'Von diesem Gerät abgelehnt. Das lässt sich nur in den Einstellungen des Browsers zurücknehmen.'
          : 'Ohne Erlaubnis geht es nicht.',
    };
  }

  const dienst = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const anmeldung = await dienst.pushManager.subscribe({
    // Ohne diese Zusage lehnen die Browser ab: eine Anmeldung, die auch stille
    // Nachrichten erlaubt, waere ein Weg, Geraete unbemerkt zu verfolgen.
    userVisibleOnly: true,
    applicationServerKey: schluesselAlsBytes(OEFFENTLICHER_SCHLUESSEL),
  });

  await nachtragen(anmeldung);

  return { art: 'angemeldet', geraet: geraetename() };
}

export async function meldeAb(): Promise<PushStand> {
  const dienst = await navigator.serviceWorker.getRegistration();
  const anmeldung = await dienst?.pushManager.getSubscription();
  if (anmeldung) {
    await repository.pushGeraetEntfernen(anmeldung.endpoint).catch(() => {});
    await anmeldung.unsubscribe();
  }
  return { art: 'abgemeldet' };
}
