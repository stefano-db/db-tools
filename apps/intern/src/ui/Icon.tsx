/**
 * Symbole.
 *
 * Gezeichnet statt getippt: Emoji sahen aus wie Platzhalter, weil sie welche
 * waren. Jedes System stellt sie anders dar — auf dem Rechner der Leitung
 * anders als auf dem iPhone, im Ausdruck oft gar nicht —, und bunt gefüllte
 * Bilder neben goldenen Linien wirken wie hineingeworfen.
 *
 * Diese hier sind Striche in der Farbe des Textes: sie nehmen die Schriftfarbe
 * an, werden mit ihr hell oder dunkel und bleiben überall gleich. Keine
 * Bibliothek, kein Nachladen — es sind zwanzig Pfade.
 *
 * Maß: 24 × 24, Strichstärke 1.75, runde Enden. Wer eines hinzufügt, hält sich
 * daran; ein Symbol mit anderer Strichstärke fällt sofort aus der Reihe.
 */

export type SymbolName =
  | 'haus'
  | 'kalender'
  | 'uhr'
  | 'verlauf'
  | 'schluessel'
  | 'anzeige'
  | 'zahnrad'
  | 'warnung'
  | 'pokal'
  | 'ordner'
  | 'sprechblase'
  | 'leute'
  | 'person'
  | 'bahn'
  | 'werkzeug'
  | 'teilen'
  | 'bildschirm'
  | 'liste'
  | 'schloss'
  | 'geld'
  | 'pfeil';

/** Nur der Pfadinhalt — Rahmen, Farbe und Strichstärke stehen unten. */
const PFADE: Record<SymbolName, string> = {
  haus: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  kalender: 'M4 6.5h16v13.5H4zM4 10.5h16M8.5 3v4M15.5 3v4',
  uhr: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  verlauf: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V10h5.5M12 8v4.2l3 1.8',
  schluessel:
    'M14.7 6.3a4 4 0 0 0 5.2 5.2l-8.6 8.6a2.3 2.3 0 0 1-3.3 0l-1.9-1.9a2.3 2.3 0 0 1 0-3.3z',
  anzeige: 'M4 18a8 8 0 1 1 16 0M12 18l4-5M7.5 13.5h.01M16.5 13.5h.01M12 9.5h.01',
  zahnrad:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.5v2.2M12 19.3v2.2M4.3 7l1.9 1.1M17.8 15.9l1.9 1.1M4.3 17l1.9-1.1M17.8 8.1l1.9-1.1',
  warnung: 'M12 4 2.8 20h18.4zM12 10v4.5M12 17.2h.01',
  pokal: 'M7 4h10v5a5 5 0 0 1-10 0zM7 5.5H4.2V7a3.3 3.3 0 0 0 3 3.3M17 5.5h2.8V7a3.3 3.3 0 0 1-3 3.3M9.5 20h5M12 14v6',
  ordner: 'M3.5 6.5h6l2 2.5h9V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z',
  sprechblase: 'M4 5.5h16v11H9l-5 4V5.5zM8.5 11h.01M12 11h.01M15.5 11h.01',
  leute:
    'M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM2.8 20c0-3.2 2.8-5.3 6.2-5.3s6.2 2.1 6.2 5.3M16.5 5.6a3 3 0 0 1 0 5.8M18 14.9c2 .6 3.3 2.2 3.3 4.3',
  person: 'M12 11.8a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20.2c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6',
  bahn: 'M8 3.5h8l1.5 17h-11zM12 7.5h.01M10 10.5h.01M14 10.5h.01',
  werkzeug:
    'M14.5 3.5a4.2 4.2 0 0 1 5.1 5.4l-11 11a2 2 0 0 1-2.8-2.8l11-11zM4.5 4.5l3 3M6 3l3 3',
  teilen: 'M18 8.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM6 15.1a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM18 22a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 18 22zM8.3 11.3l7.4-3.7M8.3 13.7l7.4 3.7',
  bildschirm: 'M3.5 4.5h17v11h-17zM8.5 20h7M12 15.5V20',
  liste: 'M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01',
  schloss: 'M6 10.5h12V20H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3M12 14.5v2',
  geld: 'M3.5 6.5h17v11h-17zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 9.5h.01M17.5 14.5h.01',
  pfeil: 'M9 5.5 15.5 12 9 18.5',
};

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: SymbolName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PFADE[name]} />
    </svg>
  );
}
