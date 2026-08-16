import { daysBetween } from './dates';
import type { ISODate } from './types';

export interface RatePoint {
  readingDate: ISODate;
  cumulativeFrames: number;
}

/**
 * Gleitender Mittelwert der Frames pro Woche über die letzten `window` Ablesungen.
 * Entspricht der SQL-View v_lane_weekly_rate — beide arbeiten auf denselben
 * gültigen Ablesungen und liefern denselben Wert.
 *
 * null, solange weniger als zwei Ablesungen oder kein Zeitabstand vorliegen.
 */
export function weeklyRate(points: RatePoint[], window = 8): number | null {
  const sorted = [...points].sort((a, b) => (a.readingDate < b.readingDate ? 1 : -1)).slice(0, window);
  if (sorted.length < 2) return null;

  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const days = daysBetween(oldest.readingDate, newest.readingDate);
  if (days <= 0) return null;

  return Math.round(((newest.cumulativeFrames - oldest.cumulativeFrames) * 7) / days);
}
