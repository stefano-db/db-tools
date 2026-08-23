import type { ModuleInfo } from '../data';
import type { SymbolName } from '../ui/Icon';

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
  symbol: SymbolName;
  gruppe: Gruppe;
  /**
   * Was innerhalb dieses Bereichs unmittelbar erreichbar ist.
   *
   * Ohne sie führt jede Kachel nur bis zur Tür, und dahinter fängt das Suchen
   * an. Wer die Frame-Stände eintragen will, soll nicht erst die Bahnwartung
   * öffnen und dort den richtigen Reiter finden müssen.
   */
  unterpunkte?: Unterpunkt[];
  /** Adresse außerhalb der Plattform, falls das Werkzeug eigenständig ist. */
  extern?: string | null;
  /** Nur ansehen, nicht ändern. */
  nurLesen?: boolean;
}

export type Gruppe = 'meine' | 'alle' | 'leitung';

export interface Unterpunkt {
  titel: string;
  ziel: string;
  symbol: SymbolName;
}

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
    symbol: 'kalender',
    gruppe: 'alle',
    unterpunkte: [
      { titel: 'Wochenplan', ziel: '/dienstplan', symbol: 'kalender' },
      // Die Wandtafel hat eine eigene Adresse, damit der Fernseher im Center
      // sie als Lesezeichen bekommt statt jedes Mal durchgeklickt zu werden.
      { titel: 'Wandtafel', ziel: '/dienstplan?ansicht=tafel', symbol: 'bildschirm' },
      { titel: 'Teilen & Drucken', ziel: '/dienstplan?ansicht=teilen', symbol: 'teilen' },
      { titel: 'Mitarbeiter', ziel: '/dienstplan?ansicht=team', symbol: 'leute' },
    ],
  },
  {
    schluessel: 'chat',
    titel: 'Fragen an Pinny',
    text: 'Fragen zur Arbeit und zur App. Pinny antwortet.',
    ziel: '/chat',
    symbol: 'sprechblase',
    gruppe: 'alle',
  },
  {
    schluessel: 'profil',
    titel: 'Profil',
    text: 'Dein Name, Benachrichtigungen aufs Handy, Abmelden.',
    ziel: '/profil',
    symbol: 'person',
    gruppe: 'alle',
  },
  {
    schluessel: 'verwaltung',
    titel: 'Verwaltung',
    text: 'Mitarbeiter anlegen, Bereichen zuordnen, Rechte vergeben.',
    ziel: '/verwaltung',
    symbol: 'leute',
    gruppe: 'leitung',
  },
];

/** Zeichen, Erklärung und Einstiege der freigeschalteten Werkzeuge. */
const ZU_MODUL: Record<
  string,
  { symbol: SymbolName; text: string; unterpunkte?: Unterpunkt[] }
> = {
  maintenance: {
    symbol: 'schluessel',
    text: 'Frame-Stände eintragen, fällige Wartungen und gemeldete Störungen.',
    unterpunkte: [
      { titel: 'Übersicht', ziel: '/wartung', symbol: 'anzeige' },
      { titel: 'Frame-Stände', ziel: '/wartung/eingabe', symbol: 'liste' },
      { titel: 'Historie', ziel: '/wartung/historie', symbol: 'verlauf' },
      { titel: 'Einstellungen', ziel: '/wartung/einstellungen', symbol: 'zahnrad' },
    ],
  },
  urkunden: { symbol: 'pokal', text: 'Events anlegen, auswerten und Urkunden drucken.' },
  dokumente: { symbol: 'ordner', text: 'Formulare, Preislisten und Aushänge zum Ausdrucken.' },
  counter: { symbol: 'bildschirm', text: 'Kasse, Bahnvergabe und Tagesabschluss.' },
};

/**
 * Werkzeuge, die keinem Bereich gehören.
 *
 * Heute keines. Die Dokumente standen hier, solange alle Bereiche in denselben
 * Ordner sahen; seit jeder seinen eigenen Ablageort hat, sind sie ein Werkzeug
 * des Bereichs wie jedes andere — der Counter legt dort seine Preislisten ab,
 * die Mechanik ihre Wartungsanleitungen, und keiner scrollt am anderen vorbei.
 *
 * Die Menge bleibt stehen, weil das nächste Werkzeug wieder eines für alle sein
 * kann.
 */
const FUER_ALLE = new Set<string>();

/** Die freigeschalteten Werkzeuge als Bereiche. */
export function alsBereiche(module: ModuleInfo[]): Bereich[] {
  return module.map((m) => {
    const zusatz = ZU_MODUL[m.key];
    return {
      schluessel: m.key,
      titel: m.nameDe,
      text: zusatz?.text ?? 'Öffnen',
      ziel: m.path.replace(/\/+$/, '') || '/',
      symbol: zusatz?.symbol ?? 'liste',
      gruppe: FUER_ALLE.has(m.key) ? 'alle' : 'meine',
      unterpunkte: zusatz?.unterpunkte,
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
