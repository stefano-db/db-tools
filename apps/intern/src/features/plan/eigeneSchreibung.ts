/**
 * Merkzettel für die eigene Schreibung.
 *
 * Wer den Plan gerade selbst ändert, braucht keine Meldung darüber, dass der
 * Plan sich geändert hat — er weiß es. Die Meldung soll die anderen erreichen.
 *
 * Der Wächter kann das nicht selbst erkennen: über die Verbindung kommt nur der
 * neue Stand, nicht wer ihn geschrieben hat. Deshalb hinterlässt der Plan hier
 * kurz eine Spur, und der Wächter schweigt, solange sie frisch ist.
 */
let zuletzt = 0;

/** Nach dem eigenen Speichern aufrufen. */
export function merkeEigeneSchreibung() {
  zuletzt = Date.now();
}

/**
 * War das gerade die eigene Schreibung?
 *
 * Drei Sekunden, weil dazwischen die Datenbank, die Auslöser und der Rückweg
 * über die Verbindung liegen. Länger wäre riskant: dann verschluckt es eine
 * echte fremde Änderung, die kurz danach kommt.
 */
export function warEigeneSchreibung(): boolean {
  return Date.now() - zuletzt < 3000;
}
