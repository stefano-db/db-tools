import type { ShiftDay } from './rosterModel';

/**
 * Was am Entwurf anders ist als am veröffentlichten Plan.
 *
 * Die Leitung muss vor dem Veröffentlichen sehen können, was sie damit
 * auslöst — sonst drückt sie im Zweifel gar nicht. Gezählt wird deshalb nicht
 * „hat sich etwas geändert", sondern wie viele Personen betroffen sind und an
 * wie vielen Tagen.
 */

export interface Woche {
  d?: unknown[];
}

export interface EntwurfStand {
  /** Geänderte Tage insgesamt. */
  tage: number;
  /** Personen, bei denen sich etwas geändert hat. */
  personen: number;
}

/** Ein Tag zählt als gleich, wenn Zustand, Zeiten und Bereich übereinstimmen. */
function gleich(a: unknown, b: unknown): boolean {
  const t = (x: unknown) => {
    const d = (x ?? {}) as Partial<ShiftDay>;
    // Ohne Zustand ist ein Tag „nicht eingeteilt"; „frei" und „nicht
    // eingeteilt" bleiben getrennt, weil sie im Plan verschieden aussehen.
    return `${d.status ?? 'nein'}|${d.b ?? ''}|${d.e ?? ''}|${d.bereich ?? ''}`;
  };
  return t(a) === t(b);
}

export function entwurfStand(
  veroeffentlicht: Record<string, Woche>,
  entwurf: Record<string, Woche> | null,
): EntwurfStand {
  if (!entwurf) return { tage: 0, personen: 0 };

  // Auch Namen, die nur auf einer Seite vorkommen: eine neu in den Plan
  // aufgenommene Person ist eine Änderung, eine entfernte ebenso.
  const namen = new Set([...Object.keys(veroeffentlicht), ...Object.keys(entwurf)]);

  let tage = 0;
  let personen = 0;

  for (const name of namen) {
    const alt = veroeffentlicht[name]?.d ?? [];
    const neu = entwurf[name]?.d ?? [];
    let betroffen = 0;
    for (let i = 0; i < 7; i++) {
      if (!gleich(alt[i], neu[i])) betroffen += 1;
    }
    if (betroffen > 0) {
      tage += betroffen;
      personen += 1;
    }
  }

  return { tage, personen };
}

/** „3 Änderungen bei 2 Personen" — für die Leiste über dem Plan. */
export function standInWorten(stand: EntwurfStand): string {
  if (stand.tage === 0) return 'Keine Änderungen';
  const tage = stand.tage === 1 ? '1 Änderung' : `${stand.tage} Änderungen`;
  const leute = stand.personen === 1 ? '1 Person' : `${stand.personen} Personen`;
  return `${tage} bei ${leute}`;
}
