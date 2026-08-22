import type { ShiftDay } from '../../data';

/**
 * Was sich an einer Woche geändert hat, in Worten.
 *
 * Das ist das Stück, das darüber entscheidet, ob jemand abends noch eine
 * Meldung auf dem Telefon bekommt. „Der Plan wurde geändert" allein zwingt
 * jeden dazu, selbst nachzusehen — bei neunzehn Leuten und einer geänderten
 * Schicht ist das achtzehnmal umsonst. Deshalb wird der eigene Stand vorher
 * und nachher verglichen und der Unterschied benannt.
 *
 * Eine leere Liste heißt: für diese Person hat sich nichts geändert.
 */
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/**
 * Wie ein Tag in einer Meldung heißt.
 *
 * „Nicht eingeteilt" und „frei" fallen bewusst zusammen: für den Menschen, der
 * die Meldung liest, bedeuten beide dasselbe — er arbeitet nicht. Der
 * Unterschied ist eine Frage der Planung, nicht seines Tages. Ohne diese
 * Gleichsetzung meldete eine frisch angelegte Woche alle sieben Tage als
 * Änderung, und nach der zweiten solchen Nachricht schaltet man sie ab.
 */
export function tagInWorten(tag?: ShiftDay): string {
  if (!tag) return 'frei';
  if (tag.status === 'dienst' && tag.b) return `${tag.b}–${tag.e}`;
  if (tag.status === 'urlaub') return 'Urlaub';
  if (tag.status === 'krank') return 'krank';
  return 'frei';
}

export function unterschied(vorher: ShiftDay[], nachher: ShiftDay[]): string[] {
  const liste: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = tagInWorten(vorher[i]);
    const b = tagInWorten(nachher[i]);
    if (a !== b) liste.push(`${TAGE[i]}: ${b} (vorher ${a})`);
  }
  return liste;
}
