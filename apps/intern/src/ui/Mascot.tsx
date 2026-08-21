/**
 * Pinny und das Logo.
 *
 * Pinny ist die Figur des Hauses — schwarze Kappe, Namensschild, winkende Hand.
 * Die Bilder liegen unter public/marke/. Solange eines fehlt, erscheint ein
 * Platzhalter; das Austauschen besteht darin, die Datei in den Ordner zu legen,
 * am Code ändert sich nichts.
 *
 * Zwei Zuschnitte aus derselben Datei, denn ein Bild kann nicht beides:
 *
 *   „figur"  zeigt Pinny ganz — für die Anmeldung, die Kopfzeile, die
 *            Werkzeugkacheln. Dort ist Platz, und die winkende Hand gehört dazu.
 *
 *   „kopf"   zeigt nur den Kopf, rund beschnitten — für die kleinen Felder in
 *            Kopfzeile, Profil und Benutzerliste. Die ganze Figur auf 38 Pixel
 *            wäre ein Fleck; angeschnitten auf das Gesicht erkennt man sie.
 */
import { useState } from 'react';

export type MascotName = 'winken' | 'counter' | 'service' | 'kueche' | 'mechanik' | 'profil';

/** Dateiname und Notbehelf je Figur. */
const MASCOTS: Record<MascotName, { file: string; emoji: string }> = {
  winken: { file: 'maskottchen-winken.png', emoji: '👋' },
  // Bis eine eigene Fassung kommt, steht Pinny auch fuer das Profil: dieselbe
  // Figur, dieselbe Datei — kein zweites Mal dieselben Bytes im Programm.
  counter: { file: 'maskottchen-counter.png', emoji: '🎳' },
  service: { file: 'maskottchen-service.png', emoji: '🍹' },
  kueche: { file: 'maskottchen-kueche.png', emoji: '👨‍🍳' },
  mechanik: { file: 'maskottchen-mechanik.png', emoji: '🔧' },
  profil: { file: 'maskottchen-winken.png', emoji: '🙂' },
};

export function Mascot({
  name,
  className = '',
  size = 64,
  variante = 'figur',
}: {
  name: MascotName;
  className?: string;
  size?: number;
  variante?: 'figur' | 'kopf';
}) {
  const [failed, setFailed] = useState(false);
  const entry = MASCOTS[name];

  if (failed) {
    return (
      <span
        className={`db-mascot-fallback grid shrink-0 place-items-center rounded-full ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden="true"
        title="Platzhalter — echtes Bild folgt"
      >
        {entry.emoji}
      </span>
    );
  }

  // Der Kopf sitzt oben in der Mitte des Bildes: beschneiden wir auf das obere
  // Fünftel, steht das Gesicht im Kreis statt einer Schulter.
  const zuschnitt =
    variante === 'kopf'
      ? 'rounded-full object-cover [object-position:50%_10%]'
      : 'object-contain';

  const bild = (
    <img
      src={`/marke/${entry.file}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 ${zuschnitt} ${variante === 'kopf' ? className : ''}`}
      style={{ width: size, height: size }}
    />
  );

  // Der Kopf sitzt im Kreis und hat dadurch ohnehin eine Flaeche; die ganze
  // Figur braucht sie, weil ihre Kleidung so dunkel ist wie der Grund.
  if (variante === 'kopf') return bild;

  // Die Klasse gehoert an den Rahmen, nicht an das Bild darin: sonst blendet
  // ein „hidden" zwar das Bild aus, der Rahmen nimmt aber weiter seinen Platz
  // ein — am Handy verschluckte das die halbe Begruessung.
  return (
    <span
      className={`db-figur-schein grid shrink-0 place-items-center rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {bild}
    </span>
  );
}

/**
 * Wortmarke.
 *
 * Die Datei ist einfarbig schwarz — auf dem dunklen Grund des Programms wäre
 * sie unsichtbar. Statt eine zweite, goldene Fassung zu pflegen, wird sie als
 * Maske benutzt: sichtbar ist dann nicht die Datei, sondern die Farbe der
 * Umgebung. Dieselbe Datei erscheint dadurch golden in der App und schwarz auf
 * dem Ausdruck, und bei einer Änderung des Goldtons ändert sich nichts hier.
 */
export function Logo({
  className = '',
  hoehe = 36,
}: {
  className?: string;
  /** Höhe in Punkten; die Breite ergibt sich aus dem Seitenverhältnis. */
  hoehe?: number;
}) {
  const maske = {
    WebkitMaskImage: 'url(/marke/logo.svg)',
    maskImage: 'url(/marke/logo.svg)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    backgroundColor: 'currentColor',
    // Seitenverhältnis der zugeschnittenen Zeichnung: 1534 zu 857.
    width: hoehe * (1534 / 857),
    height: hoehe,
  } as const;

  return (
    <span
      role="img"
      aria-label="Dream Bowl"
      className={`inline-block shrink-0 text-db-gold ${className}`}
      style={maske}
    />
  );
}
