import { daysBetween } from './dates';
import { formatFrames, type CounterEpoch } from './frames';
import type { ISODate, MaintenanceSettings } from './types';

/**
 * Prüfung der wöchentlichen Frame-Eingabe.
 *
 * Der häufigste reale Fehler ist nicht der Zähler-Reset, sondern der Tippfehler
 * (842500 statt 84250). Deshalb wird jeder Zuwachs gegen die übliche Wochenrate
 * der Bahn geprüft, bevor er gespeichert wird.
 */

export type ReadingIssueLevel = 'error' | 'warning' | 'info';

export type ReadingIssueCode =
  | 'negative_value'
  | 'below_previous'
  | 'implausible_jump'
  | 'above_absolute_max'
  | 'no_change'
  | 'future_date';

export interface ReadingIssue {
  level: ReadingIssueLevel;
  code: ReadingIssueCode;
  message: string;
}

export interface ReadingCandidate {
  rawValue: number;
  epoch: CounterEpoch;
  readingDate: ISODate;
  today: ISODate;
  /** Letzter gültiger kumulativer Stand der Bahn, null bei der ersten Ablesung. */
  previousCumulative: number | null;
  previousDate: ISODate | null;
  framesPerWeek: number | null;
  settings: MaintenanceSettings;
}

export function validateReading(c: ReadingCandidate): ReadingIssue[] {
  const issues: ReadingIssue[] = [];
  const unit = c.settings.counterUnitLabel;

  if (!Number.isFinite(c.rawValue) || c.rawValue < 0) {
    issues.push({
      level: 'error',
      code: 'negative_value',
      message: 'Bitte einen gültigen Zählerstand eingeben.',
    });
    return issues;
  }

  if (daysBetween(c.today, c.readingDate) > 0) {
    issues.push({
      level: 'error',
      code: 'future_date',
      message: 'Das Ablesedatum liegt in der Zukunft.',
    });
  }

  // Liegt der Wert unter dem Epochenstart, ist die Umrechnung nicht definiert —
  // das ist immer ein Zählerwechsel und muss über eine neue Epoche laufen.
  if (c.rawValue < c.epoch.counterStart) {
    issues.push({
      level: 'error',
      code: 'below_previous',
      message:
        `Der neue Stand ist niedriger als der bisherige Stand. ` +
        `Wurde der Zähler zurückgesetzt oder ausgetauscht?`,
    });
    return issues;
  }

  const cumulative = c.epoch.cumulativeOffset + (c.rawValue - c.epoch.counterStart);

  if (c.previousCumulative === null) {
    return issues; // Erste Ablesung: nichts zu vergleichen.
  }

  if (cumulative < c.previousCumulative) {
    issues.push({
      level: 'error',
      code: 'below_previous',
      message:
        `Der neue Stand (${formatFrames(cumulative)}) ist niedriger als der bisherige ` +
        `Stand (${formatFrames(c.previousCumulative)}). Wurde der Zähler zurückgesetzt?`,
    });
    return issues;
  }

  const delta = cumulative - c.previousCumulative;

  if (delta === 0) {
    issues.push({
      level: 'info',
      code: 'no_change',
      message: `Unverändert gegenüber der letzten Ablesung.`,
    });
    return issues;
  }

  if (delta > c.settings.plausibilityAbsMax) {
    issues.push({
      level: 'warning',
      code: 'above_absolute_max',
      message:
        `Zuwachs von ${formatFrames(delta)} ${unit} liegt über der Obergrenze von ` +
        `${formatFrames(c.settings.plausibilityAbsMax)}. Bitte auf Tippfehler prüfen.`,
    });
  }

  // Erwartungswert auf die tatsächlich vergangenen Tage umgerechnet, damit eine
  // ausgefallene Ablesewoche nicht fälschlich als Ausreißer gemeldet wird.
  if (c.framesPerWeek !== null && c.framesPerWeek > 0 && c.previousDate) {
    const days = Math.max(1, daysBetween(c.previousDate, c.readingDate));
    const expected = (c.framesPerWeek * days) / 7;
    if (delta > expected * c.settings.plausibilityFactor) {
      issues.push({
        level: 'warning',
        code: 'implausible_jump',
        message:
          `Zuwachs von ${formatFrames(delta)} ${unit} — üblich sind hier etwa ` +
          `${formatFrames(expected)}. Eingabe prüfen?`,
      });
    }
  }

  return issues;
}

export function hasBlockingIssue(issues: ReadingIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

/** Nur der Fall, der den Zähler-Reset-Dialog auslöst. */
export function needsCounterResetDialog(issues: ReadingIssue[]): boolean {
  return issues.some((i) => i.code === 'below_previous');
}

/**
 * Bestimmt, wogegen eine neue Ablesung verglichen wird.
 *
 * Überschreibt die Eingabe eine bereits erfasste Ablesung desselben Tages, darf
 * der Wert, der ersetzt werden soll, nicht der Maßstab sein — sonst gilt jeder
 * Zahlendreher nach unten als zurückgesetzter Zähler. Verglichen wird dann mit
 * der letzten Ablesung **davor**. Damit bleiben alle Prüfungen erhalten:
 * Reset-Verdacht, unplausibler Sprung, Tippfehler.
 */
export function readingBaseline(params: {
  selectedDate: ISODate;
  /** Alle Ablesungen der Bahn; ersetzte werden ignoriert. */
  readings: { readingDate: ISODate; cumulativeFrames: number; supersededById: string | null }[];
}): {
  previousCumulative: number | null;
  previousDate: ISODate | null;
  isCorrection: boolean;
  /** Der Wert, der überschrieben wird — nur zur Anzeige. */
  replacedCumulative: number | null;
} {
  const active = params.readings.filter((r) => r.supersededById === null);

  const onDate = active.find((r) => r.readingDate === params.selectedDate) ?? null;

  const before = active
    .filter((r) => r.readingDate < params.selectedDate)
    .sort((a, b) => (a.readingDate < b.readingDate ? 1 : -1))[0];

  return {
    isCorrection: onDate !== null,
    replacedCumulative: onDate ? onDate.cumulativeFrames : null,
    previousCumulative: before ? before.cumulativeFrames : null,
    previousDate: before ? before.readingDate : null,
  };
}
