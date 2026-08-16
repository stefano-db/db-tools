import type { ISODate } from './types';

const DAY_MS = 86_400_000;

/** Parst 'YYYY-MM-DD' als UTC-Mitternacht — zeitzonenunabhängig und sommerzeitfest. */
export function parseISODate(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Ungültiges Datum: ${iso}`);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromISO: ISODate, toISO: ISODate): number {
  return Math.round((parseISODate(toISO) - parseISODate(fromISO)) / DAY_MS);
}

export function addDays(iso: ISODate, days: number): ISODate {
  return new Date(parseISODate(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function formatDateDe(iso: ISODate): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
