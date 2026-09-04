/**
 * Handyfotos vor dem Hochladen verkleinern.
 *
 * Ein Foto vom iPhone wiegt 3 bis 5 MB. Ein Defekt bekommt schnell drei davon,
 * und der Speicher des Supabase-Tarifs fasst insgesamt ein Gigabyte. Erkennbar
 * ist ein gerissener Riemen auch bei 1600 Pixel Kantenlaenge — die volle
 * Aufloesung kostet nur Platz und Wartezeit im Netz der Bahnhalle.
 */

/** Laengste Kante nach dem Verkleinern. */
export const MAX_KANTE = 1600;

/** JPEG-Guete. Darunter werden Riefen und Risse im Metall matschig. */
export const GUETE = 0.82;

/**
 * Zielmasse unter Beibehaltung des Seitenverhaeltnisses.
 *
 * Kleinere Bilder bleiben unangetastet — ein Foto hochzurechnen erfindet
 * Bildpunkte, die es nie gab, und macht die Datei dabei groesser.
 */
export function zielMasse(
  breite: number,
  hoehe: number,
  maxKante = MAX_KANTE,
): { breite: number; hoehe: number } {
  if (breite <= 0 || hoehe <= 0) return { breite: 0, hoehe: 0 };
  const laengste = Math.max(breite, hoehe);
  if (laengste <= maxKante) return { breite, hoehe };
  const faktor = maxKante / laengste;
  // Mindestens ein Bildpunkt je Kante: ein sehr schmales Panorama darf nicht
  // auf die Hoehe 0 zusammenfallen, sonst wirft die Zeichenflaeche.
  return {
    breite: Math.max(1, Math.round(breite * faktor)),
    hoehe: Math.max(1, Math.round(hoehe * faktor)),
  };
}

/** Ein sprechender Dateiname, damit im Speicher nicht 40-mal "image.jpg" liegt. */
export function fotoName(original: string, index: number, stempel: string): string {
  const roh = original
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '-')
    // Fuehrende und schliessende Striche abschneiden, sonst heisst eine Datei
    // "2026-09-04-1--.jpg" — und ein Name aus lauter Sonderzeichen wuerde die
    // Ersatzbezeichnung unten nie erreichen.
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${stempel}-${index + 1}-${roh || 'foto'}.jpg`;
}

/**
 * Verkleinert ein Bild auf {@link MAX_KANTE} und gibt es als JPEG zurueck.
 *
 * Schlaegt etwas fehl — unbekanntes Format, HEIC ohne Decoder, kein Canvas —
 * kommt die Originaldatei zurueck. Ein grosses Foto ist besser als keines:
 * der Mechaniker steht an der Maschine und soll nicht raten, warum sein Bild
 * verschwunden ist.
 */
export async function verkleinern(datei: File, maxKante = MAX_KANTE): Promise<File> {
  if (!datei.type.startsWith('image/')) return datei;
  try {
    const bild = await bitmap(datei);
    const ziel = zielMasse(bild.width, bild.height, maxKante);
    if (ziel.breite === bild.width && ziel.hoehe === bild.height && datei.type === 'image/jpeg') {
      bild.close();
      return datei;
    }

    const flaeche = document.createElement('canvas');
    flaeche.width = ziel.breite;
    flaeche.height = ziel.hoehe;
    const stift = flaeche.getContext('2d');
    if (!stift) return datei;
    stift.drawImage(bild, 0, 0, ziel.breite, ziel.hoehe);
    bild.close();

    const klein = await new Promise<Blob | null>((fertig) =>
      flaeche.toBlob(fertig, 'image/jpeg', GUETE),
    );
    if (!klein || klein.size >= datei.size) return datei;
    return new File([klein], datei.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: datei.lastModified,
    });
  } catch {
    return datei;
  }
}

async function bitmap(datei: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap fehlt');
  return createImageBitmap(datei);
}
