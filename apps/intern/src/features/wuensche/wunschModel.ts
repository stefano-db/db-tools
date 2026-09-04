import type { Wunsch, WunschStatus } from '../../data';

/**
 * Reine Logik der Wunschliste — ohne React, ohne Datenbank.
 */

export type Filter = 'offen' | 'alle' | 'meine';

export const STATUS_TEXT: Record<WunschStatus, { label: string; cls: string }> = {
  offen: { label: 'Offen', cls: 'bg-lw-card2 text-lw-text2' },
  geplant: { label: 'Geplant', cls: 'bg-lw-warn/15 text-lw-warn' },
  umgesetzt: { label: 'Umgesetzt', cls: 'bg-lw-ok/15 text-lw-ok' },
  abgelehnt: { label: 'Abgelehnt', cls: 'bg-lw-bad/12 text-lw-bad' },
};

/**
 * Erledigtes nach unten.
 *
 * Umgesetzt und abgelehnt bleiben sichtbar — sonst reicht jemand denselben
 * Wunsch ein zweites Mal ein, und die Antwort von damals ist verloren. Oben
 * stehen sie aber nicht: dort gehört hin, worüber noch zu entscheiden ist.
 */
const RANG: Record<WunschStatus, number> = {
  geplant: 0,
  offen: 1,
  umgesetzt: 2,
  abgelehnt: 3,
};

export function sortiere(liste: Wunsch[], filter: Filter): Wunsch[] {
  const gefiltert = liste.filter((w) => {
    if (filter === 'meine') return w.eingereichtVon !== null && w.meiner;
    if (filter === 'offen') return w.status === 'offen' || w.status === 'geplant';
    return true;
  });

  return [...gefiltert].sort((a, b) => {
    const rang = RANG[a.status] - RANG[b.status];
    if (rang !== 0) return rang;
    // Innerhalb desselben Standes entscheidet die Zustimmung, dann das Datum.
    // Ohne den zweiten Schlüssel wäre die Reihenfolge bei Gleichstand zufällig
    // und die Liste spränge bei jedem Laden.
    if (a.stimmen !== b.stimmen) return b.stimmen - a.stimmen;
    return a.eingereichtAm < b.eingereichtAm ? 1 : -1;
  });
}
