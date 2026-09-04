/**
 * Zeichen und Farbe der Bahnpflege — an einer Stelle.
 *
 * Sie erscheint an vier Orten: im Wochenraster, auf der Wandtafel, in der
 * Tagesansicht und auf dem Bild, das im Chat verschickt wird. Die ersten drei
 * baut die Seite, das vierte eine Zeichenflaeche. Ohne gemeinsame Quelle
 * driftet das Bild irgendwann von der Ansicht ab, und niemand merkt es, bis
 * jemand beides nebeneinander haelt.
 *
 * Die Farbe ist die der Mechanik. Nicht aus Bequemlichkeit: die Bahnpflege ist
 * Mechanik-Arbeit, auch wenn sie einmal jemand aus einem anderen Bereich
 * uebernimmt. Fest statt nach eingeteilter Person, damit sie ueber alle Zeilen
 * hinweg dieselbe bleibt — genau darum geht es bei ihr.
 */
export const PFLEGE_FARBE = '#1f6f92';

/**
 * Schrift auf der hellen Flaeche des Schildes.
 *
 * Eine Stufe dunkler als die Flaechenfarbe. Nachgemessen: mit PFLEGE_FARBE
 * selbst kommt das Wort auf 4,35:1 und liegt damit unter dem, was fuer Schrift
 * dieser Groesse traegt; so sind es 5,4:1. Der Unterschied faellt niemandem
 * auf — das Fehlen wuerde auffallen, im Hellen an der Wand.
 */
export const PFLEGE_SCHRIFT = '#1a5f7f';

export const BAHNPFLEGE_ZEICHEN = '🧽';

export const BAHNPFLEGE_WORT = 'Bahnpflege';
