import type { ModuleInfo } from '../data';

/**
 * Was es in der Plattform gibt — an einer Stelle.
 *
 * Startbildschirm und Seitenleiste zeigen dasselbe und dürfen nicht
 * auseinanderlaufen: Ein Werkzeug, das in der Leiste steht und auf der
 * Startseite fehlt, sieht aus wie ein Fehler, und umgekehrt sucht man auf der
 * Startseite etwas, das nur die Leiste kennt. Beide lesen deshalb von hier.
 *
 * Die Beschreibung ist kein Beiwerk. Wer neu anfängt, soll am Kasten selbst
 * erkennen, was dahinter liegt, ohne ihn zu öffnen — ein Wort allein leistet
 * das nicht.
 */
export interface Bereich {
  schluessel: string;
  titel: string;
  /** Ein Satz, der sagt, was dahinter liegt. */
  text: string;
  ziel: string;
  /** Zeichen für die Kachel — jedes nur einmal, sonst taugt es nicht zum Wiederfinden. */
  symbol: string;
  gruppe: Gruppe;
  /** Adresse außerhalb der Plattform, falls das Werkzeug eigenständig ist. */
  extern?: string | null;
  /** Nur ansehen, nicht ändern. */
  nurLesen?: boolean;
}

export type Gruppe = 'meine' | 'alle' | 'leitung';

/**
 * Fest eingebaute Bereiche — sie hängen an keiner Freigabe.
 *
 * Der Dienstplan geht jeden an: wer arbeitet, hat eine Schicht. Fragen hat
 * jeder, und wer nicht weiterweiß, soll nicht erst suchen müssen, ob er darf.
 * Das eigene Konto sowieso.
 */
export const FESTE_BEREICHE: Bereich[] = [
  {
    schluessel: 'dienstplan',
    titel: 'Dienstplan',
    text: 'Wer wann arbeitet — die ganze Woche auf einen Blick.',
    ziel: '/dienstplan',
    symbol: '📅',
    gruppe: 'alle',
  },
  {
    schluessel: 'chat',
    titel: 'Fragen an Pinny',
    text: 'Fragen zur Arbeit und zur App. Pinny antwortet.',
    ziel: '/chat',
    symbol: '💬',
    gruppe: 'alle',
  },
  {
    schluessel: 'profil',
    titel: 'Profil',
    text: 'Dein Name, Benachrichtigungen aufs Handy, Abmelden.',
    ziel: '/profil',
    symbol: '🙂',
    gruppe: 'alle',
  },
  {
    schluessel: 'verwaltung',
    titel: 'Verwaltung',
    text: 'Mitarbeiter anlegen, Bereichen zuordnen, Rechte vergeben.',
    ziel: '/verwaltung',
    symbol: '👥',
    gruppe: 'leitung',
  },
];

/** Zeichen und Erklärung zu den freigeschalteten Werkzeugen. */
const ZU_MODUL: Record<string, { symbol: string; text: string }> = {
  maintenance: {
    symbol: '🔧',
    text: 'Frame-Stände eintragen, fällige Wartungen und gemeldete Störungen.',
  },
  urkunden: { symbol: '🏆', text: 'Events anlegen, auswerten und Urkunden drucken.' },
  dokumente: { symbol: '📁', text: 'Formulare, Preislisten und Aushänge zum Ausdrucken.' },
  counter: { symbol: '🖥️', text: 'Kasse, Bahnvergabe und Tagesabschluss.' },
};

/**
 * Werkzeuge, die keinem Bereich gehören.
 *
 * Die Dokumente stehen allen offen — eine Preisliste ist kein Werkzeug der
 * Mechanik. Sie unter „Mein Bereich" zu führen, würde behaupten, sie gehöre
 * dorthin.
 */
const FUER_ALLE = new Set(['dokumente']);

/** Die freigeschalteten Werkzeuge als Bereiche. */
export function alsBereiche(module: ModuleInfo[]): Bereich[] {
  return module.map((m) => {
    const zusatz = ZU_MODUL[m.key];
    return {
      schluessel: m.key,
      titel: m.nameDe,
      text: zusatz?.text ?? 'Öffnen',
      ziel: m.path.replace(/\/+$/, '') || '/',
      symbol: zusatz?.symbol ?? '📋',
      gruppe: FUER_ALLE.has(m.key) ? 'alle' : 'meine',
      extern: m.externalUrl,
      nurLesen: !m.canWrite,
    };
  });
}

/**
 * Alles, was jemand sehen darf, nach Gruppen.
 *
 * Was hier fehlt, ist nicht bloß versteckt: die Datenbank lässt ihn ohnehin
 * nicht heran. Die Auswahl hier sorgt nur dafür, dass niemand vor Türen steht,
 * die für ihn verschlossen sind — wer am Counter arbeitet, muss nicht wissen,
 * dass es eine Bahnwartung gibt.
 */
export function bereicheFuer(
  module: ModuleInfo[],
  darfLeiten: boolean,
): Record<Gruppe, Bereich[]> {
  const alle = [...alsBereiche(module), ...FESTE_BEREICHE].filter(
    (b) => b.gruppe !== 'leitung' || darfLeiten,
  );
  return {
    meine: alle.filter((b) => b.gruppe === 'meine'),
    alle: alle.filter((b) => b.gruppe === 'alle').sort(nachWichtigkeit),
    leitung: alle.filter((b) => b.gruppe === 'leitung'),
  };
}

/**
 * Nach Gebrauch, nicht nach Zufall.
 *
 * Ohne diese Reihenfolge richtet sich die Liste danach, in welcher Reihenfolge
 * die Datenbank die Werkzeuge liefert — dann stehen die Dokumente vor dem
 * Dienstplan, obwohl in den Plan zehnmal am Tag jemand schaut und in die
 * Dokumente einmal im Monat.
 */
const REIHENFOLGE = ['dienstplan', 'dokumente', 'chat', 'profil'];

function nachWichtigkeit(a: Bereich, b: Bereich): number {
  const rang = (x: Bereich) => {
    const i = REIHENFOLGE.indexOf(x.schluessel);
    return i === -1 ? REIHENFOLGE.length : i;
  };
  return rang(a) - rang(b);
}
