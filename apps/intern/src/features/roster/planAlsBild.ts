import {
  DAY_SHORT,
  formatDayMonth,
  isoWeekNumber,
  type ShiftDay,
} from './rosterModel';

/**
 * Den Wochenplan als Bild zeichnen.
 *
 * Warum von Hand und nicht mit einer Bibliothek: die ueblichen Werkzeuge
 * fotografieren das HTML ab und schleppen dafuer ein paar hundert Kilobyte in
 * jede Seite. Gebraucht wird hier aber kein Abbild des Bildschirms, sondern
 * ein Aushang — feste Groesse, feste Schrift, gleiches Ergebnis auf jedem
 * Geraet. Das sind ein paar Rechtecke und Zeilen, und die zeichnet man selbst.
 */

export interface BildBereich {
  no: number;
  name: string;
  color: string;
  symbol: string;
}

export interface BildPerson {
  id: string;
  name: string;
  groupNo: number;
}

const BREITE = 1600;
const NAMENSSPALTE = 210;
const RAND = 28;
const KOPF = 92;
const TAGKOPF = 46;
const BANDHOEHE = 34;
const ZEILE = 52;
const FUSS = 40;

/** Farbe mit Weiss mischen — dieselbe Abstufung wie in der Oberflaeche. */
function tint(hex: string, prozent: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const m = (v: number) => Math.round(v * (prozent / 100) + 255 * (1 - prozent / 100));
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

function abgerundet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function zeichnePlan(opts: {
  monday: Date;
  days: Date[];
  bereiche: BildBereich[];
  personen: BildPerson[];
  weekOf: (id: string) => ShiftDay[];
}): HTMLCanvasElement {
  const { monday, days, bereiche, personen, weekOf } = opts;

  const gruppen = bereiche
    .map((b) => ({ bereich: b, leute: personen.filter((p) => p.groupNo === b.no) }))
    .filter((g) => g.leute.length > 0);

  const hoehe =
    KOPF +
    TAGKOPF +
    gruppen.reduce((h, g) => h + BANDHOEHE + g.leute.length * ZEILE, 0) +
    FUSS +
    RAND;

  // Zweifache Aufloesung: in Signal wird hineingezoomt, und weiche Schrift
  // sieht nach Bildschirmfoto aus statt nach Aushang.
  const skala = 2;
  const canvas = document.createElement('canvas');
  canvas.width = BREITE * skala;
  canvas.height = hoehe * skala;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(skala, skala);

  const schrift = (groesse: number, fett = false) =>
    `${fett ? '700 ' : ''}${groesse}px "Inter", "Helvetica Neue", Arial, sans-serif`;

  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, BREITE, hoehe);

  // Kopf
  ctx.fillStyle = '#201d18';
  ctx.font = schrift(34, true);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Dienstplan', RAND, 52);
  ctx.fillStyle = '#554e44';
  ctx.font = schrift(26, true);
  const kw = `KW ${isoWeekNumber(monday)}`;
  ctx.fillText(kw, RAND + ctx.measureText('Dienstplan').width + 168, 52);
  ctx.font = schrift(22);
  const zeitraum = `${formatDayMonth(days[0])} – ${formatDayMonth(days[6])}${monday.getFullYear()}`;
  ctx.textAlign = 'right';
  ctx.fillText(zeitraum, BREITE - RAND, 52);
  ctx.textAlign = 'left';

  const spalte = (BREITE - RAND * 2 - NAMENSSPALTE) / 7;
  const spaltenX = (i: number) => RAND + NAMENSSPALTE + i * spalte;

  // Tageskopf
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  days.forEach((d, i) => {
    const istHeute = d.getTime() === heute.getTime();
    if (istHeute) {
      ctx.fillStyle = 'rgba(224,160,56,0.20)';
      abgerundet(ctx, spaltenX(i) + 3, KOPF - 30, spalte - 6, 34, 8);
      ctx.fill();
    }
    ctx.fillStyle = istHeute ? '#a06010' : '#554e44';
    ctx.font = schrift(24, true);
    ctx.fillText(DAY_SHORT[i], spaltenX(i) + 14, KOPF - 6);
    ctx.font = schrift(18);
    ctx.fillText(formatDayMonth(d), spaltenX(i) + 58, KOPF - 6);
  });

  // Zeilen
  let y = KOPF + TAGKOPF - 24;
  for (const { bereich, leute } of gruppen) {
    ctx.fillStyle = tint(bereich.color, 20);
    abgerundet(ctx, RAND, y, BREITE - RAND * 2, BANDHOEHE - 6, 6);
    ctx.fill();
    ctx.fillStyle = bereich.color;
    ctx.font = schrift(19, true);
    ctx.fillText(`${bereich.symbol}  ${bereich.name.toUpperCase()}`, RAND + 12, y + 21);
    y += BANDHOEHE;

    leute.forEach((person, index) => {
      const grund = tint(bereich.color, index % 2 === 0 ? 7 : 13);
      ctx.fillStyle = grund;
      ctx.fillRect(RAND, y, BREITE - RAND * 2, ZEILE - 3);
      ctx.fillStyle = bereich.color;
      ctx.fillRect(RAND, y, 4, ZEILE - 3);

      ctx.fillStyle = '#201d18';
      ctx.font = schrift(22, true);
      ctx.fillText(person.name, RAND + 16, y + 33);

      weekOf(person.id).forEach((tag, i) => {
        const x = spaltenX(i) + 5;
        const w = spalte - 10;
        if (tag.status === 'dienst') {
          const b = bereiche.find((g) => g.no === (tag.bereich ?? person.groupNo)) ?? bereich;
          const fremd = b.no !== person.groupNo;
          ctx.fillStyle = '#ffffff';
          abgerundet(ctx, x, y + 6, w, ZEILE - 18, 8);
          ctx.fill();
          if (fremd) {
            ctx.strokeStyle = tint(b.color, 70);
            ctx.lineWidth = 2;
            abgerundet(ctx, x, y + 6, w, ZEILE - 18, 8);
            ctx.stroke();
          }
          ctx.fillStyle = b.color;
          ctx.font = schrift(21, true);
          ctx.textAlign = 'center';
          const text = `${fremd ? b.symbol + ' ' : ''}${tag.b}–${tag.e}`;
          ctx.fillText(text, x + w / 2, y + 31);
          ctx.textAlign = 'left';
        } else if (tag.status === 'urlaub' || tag.status === 'krank') {
          ctx.fillStyle = '#ffffff';
          abgerundet(ctx, x, y + 6, w, ZEILE - 18, 8);
          ctx.fill();
          ctx.fillStyle = tag.status === 'urlaub' ? '#1a7a4c' : '#b03028';
          ctx.font = schrift(19, true);
          ctx.textAlign = 'center';
          ctx.fillText(tag.status === 'urlaub' ? 'Urlaub' : 'Krank', x + w / 2, y + 31);
          ctx.textAlign = 'left';
        }
        // Freie Tage bleiben leer — wie an der Wand.
      });

      y += ZEILE;
    });
  }

  // Fuss: woher das Bild stammt und von wann.
  ctx.fillStyle = '#8a8175';
  ctx.font = schrift(17);
  const stand = new Date();
  ctx.fillText(
    `Dream Bowl · Stand ${formatDayMonth(stand)}${stand.getFullYear()}, ${String(stand.getHours()).padStart(2, '0')}:${String(stand.getMinutes()).padStart(2, '0')} Uhr`,
    RAND,
    y + 26,
  );

  return canvas;
}

/**
 * Das Bild weitergeben.
 *
 * Am Handy uebernimmt das Teilen-Menue des Systems — dort steht Signal neben
 * allem anderen. Wo es das nicht gibt (Rechner), bleibt der Download; von dort
 * zieht man die Datei in den Chat.
 */
export async function teileBild(canvas: HTMLCanvasElement, dateiname: string): Promise<'geteilt' | 'geladen'> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Bild konnte nicht erzeugt werden.');
  const datei = new File([blob], dateiname, { type: 'image/png' });

  if (navigator.canShare?.({ files: [datei] })) {
    await navigator.share({ files: [datei], title: 'Dienstplan' });
    return 'geteilt';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  // Nicht sofort freigeben: der Browser holt sich die Daten erst nach dem
  // Klick, und ein zu frueh eingezogener Verweis bricht den Download ab.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'geladen';
}
