/**
 * Rechenkern der Schließfächer — ohne React, ohne Datenbank.
 *
 * Hier liegt das, was das Werkzeug von einer Liste unterscheidet: die Frage,
 * in welcher Lage ein Fach gerade ist. Gespeichert wird nur, was jemand
 * entschieden hat — bis wann gemietet ist und ob bezahlt wurde. Ob ein Fach
 * abgelaufen ist, ergibt sich daraus und aus dem heutigen Datum; ein Feld
 * „abgelaufen" wäre am Tag nach dem Setzen falsch und würde von niemandem
 * nachgepflegt.
 */

// Der Typ steht in der Datenschicht, weil ihn beide Seiten brauchen und
// Typen keine Abhaengigkeit zur Laufzeit erzeugen.
import type { Schliessfach, SchliessfachZustand } from '../../data';

export type { Schliessfach, SchliessfachZustand };

/**
 * Die Lage eines Fachs — das, was auf der Kachel steht.
 *
 * Reihenfolge ist Absicht: Ein defektes Fach ist defekt, auch wenn die Miete
 * abgelaufen wäre; ein abgelaufenes ist abgelaufen, auch wenn es unbezahlt ist.
 * Es wird immer das Dringlichste genannt, denn auf einer Kachel steht nur eines.
 */
export type Lage =
  | 'defekt'
  | 'lager'
  | 'abgelaufen'
  | 'faellig'
  | 'unbezahlt'
  | 'ueberzahlung'
  | 'vermietet'
  | 'reserviert'
  | 'frei';

export const LAGE_TEXT: Record<Lage, string> = {
  defekt: 'Defekt',
  lager: 'Lager',
  abgelaufen: 'Abgelaufen',
  faellig: 'Läuft ab',
  unbezahlt: 'Nicht bezahlt',
  ueberzahlung: 'Überbezahlung',
  vermietet: 'Verliehen',
  reserviert: 'Reserviert',
  frei: 'Unbesetzt',
};

/** Tage bis zum Ablauf. Negativ heisst: schon vorbei. Null, wenn kein Ende steht. */
export function tageBisAblauf(fach: Schliessfach, heute: Date): number | null {
  if (!fach.mieteBis) return null;
  const ende = new Date(`${fach.mieteBis}T00:00:00`);
  if (Number.isNaN(ende.getTime())) return null;
  const tag = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.round((ende.getTime() - tag.getTime()) / 86_400_000);
}

/**
 * In welcher Lage ein Fach ist.
 *
 * `fristTage` sagt, ab wann „läuft ab" gilt. Das ist eine Entscheidung des
 * Hauses — „wir sprechen die Leute sechs Wochen vorher an" — und steht deshalb
 * in der Datenbank, nicht hier.
 */
export function lage(fach: Schliessfach, heute: Date, fristTage: number): Lage {
  if (fach.zustand === 'defekt') return 'defekt';
  if (fach.zustand === 'lager') return 'lager';
  if (fach.zustand === 'frei') return 'frei';
  if (fach.zustand === 'reserviert') return 'reserviert';

  const tage = tageBisAblauf(fach, heute);
  if (tage !== null && tage < 0) return 'abgelaufen';
  if (tage !== null && tage <= fristTage) return 'faellig';
  if (!fach.bezahlt) return 'unbezahlt';
  if (fach.ueberzahlung) return 'ueberzahlung';
  return 'vermietet';
}

/**
 * Was auf dem Dashboard steht.
 *
 * Nur das, wobei jemand etwas tun muss. „57 Fächer verliehen" ist keine
 * Nachricht; „drei laufen diesen Monat aus" ist eine.
 */
export interface Hinweis {
  lage: Lage;
  anzahl: number;
  faecher: number[];
}

export function hinweise(
  faecher: Schliessfach[],
  heute: Date,
  fristTage: number,
): Hinweis[] {
  const zaehler = new Map<Lage, number[]>();
  for (const f of faecher) {
    const l = lage(f, heute, fristTage);
    if (l === 'abgelaufen' || l === 'faellig' || l === 'unbezahlt' || l === 'defekt') {
      (zaehler.get(l) ?? zaehler.set(l, []).get(l)!).push(f.nummer);
    }
  }
  // Reihenfolge nach Dringlichkeit, nicht nach Menge: ein einzelnes
  // abgelaufenes Fach ist wichtiger als zwanzig, die irgendwann auslaufen.
  const reihe: Lage[] = ['abgelaufen', 'unbezahlt', 'faellig', 'defekt'];
  return reihe
    .filter((l) => zaehler.has(l))
    .map((l) => ({ lage: l, anzahl: zaehler.get(l)!.length, faecher: zaehler.get(l)!.sort((a, b) => a - b) }));
}

/** Kurzer Satz zu einem Hinweis — für das Dashboard. */
export function hinweisText(h: Hinweis): string {
  const eines = h.anzahl === 1;
  switch (h.lage) {
    case 'abgelaufen':
      return eines ? 'Ein Fach ist abgelaufen' : `${h.anzahl} Fächer sind abgelaufen`;
    case 'unbezahlt':
      return eines ? 'Ein Fach ist nicht bezahlt' : `${h.anzahl} Fächer sind nicht bezahlt`;
    case 'faellig':
      return eines ? 'Ein Fach läuft demnächst aus' : `${h.anzahl} Fächer laufen demnächst aus`;
    case 'defekt':
      return eines ? 'Ein Fach ist defekt' : `${h.anzahl} Fächer sind defekt`;
    default:
      return `${h.anzahl}`;
  }
}

/**
 * Die Saison, wie sie auf dem Blatt oben steht: „2026/2027".
 *
 * Abgeleitet statt getippt. Auf dem Papier musste jemand die Jahreszahl jedes
 * Mal ändern und hat es irgendwann vergessen — dann steht ein Jahr auf einer
 * Liste, das nicht mehr stimmt, und niemand traut ihr mehr.
 *
 * Gerechnet wird über die laufenden Mieten: das früheste Beginnjahr bis zum
 * spätesten Endjahr. Fallen sie zusammen, steht nur ein Jahr da.
 */
export function saison(faecher: Schliessfach[]): string | null {
  const jahre: number[] = [];
  for (const f of faecher) {
    if (f.zustand !== 'vermietet') continue;
    for (const datum of [f.mieteVon, f.mieteBis]) {
      const jahr = Number(datum?.slice(0, 4));
      if (Number.isFinite(jahr) && jahr > 1900) jahre.push(jahr);
    }
  }
  if (jahre.length === 0) return null;
  const von = Math.min(...jahre);
  const bis = Math.max(...jahre);
  return von === bis ? String(von) : `${von}/${bis}`;
}

/** Fächer in der Reihenfolge, in der sie an der Wand hängen. */
export function nachNummer(faecher: Schliessfach[]): Schliessfach[] {
  return [...faecher].sort((a, b) => a.nummer - b.nummer);
}
