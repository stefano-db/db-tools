/**
 * Rechenkern des Dienstplans — ohne React, ohne Datenbank.
 *
 * Alles, was der Plan an Logik braucht, steht hier: Zeiten verstehen, Dauer
 * rechnen, Wochen benennen. So lässt es sich prüfen, ohne eine Oberfläche zu
 * starten, und die Anzeige bleibt frei von Rechnerei.
 */

export type ShiftStatus = 'dienst' | 'frei' | 'urlaub' | 'krank' | 'nein';

export interface ShiftDay {
  status: ShiftStatus;
  /** Beginn als "HH:MM"; leer, wenn kein Dienst. */
  b: string;
  /** Ende als "HH:MM". */
  e: string;
}

export const EMPTY_DAY: ShiftDay = { status: 'nein', b: '', e: '' };

export const STATUS_LABEL: Record<ShiftStatus, string> = {
  dienst: 'Dienst',
  frei: 'Frei',
  urlaub: 'Urlaub',
  krank: 'Krank',
  nein: 'Nicht eingeteilt',
};

export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * Kurzschreibweise verstehen, wie sie beim schnellen Eintippen entsteht:
 * "9" → 09:00, "930" → 09:30, "1430" → 14:30, "9.30" und "9:30" ebenso.
 * Gibt null zurück, wenn daraus keine gültige Uhrzeit wird.
 */
export function parseTime(raw: string): string | null {
  const t = raw.trim().replace(/[.,]/g, ':');
  if (t === '') return '';

  let h: number;
  let m: number;

  if (t.includes(':')) {
    const [hs, ms = '0'] = t.split(':');
    h = Number(hs);
    m = Number(ms.padEnd(2, '0'));
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t);
    m = 0;
  } else if (/^\d{3}$/.test(t)) {
    h = Number(t.slice(0, 1));
    m = Number(t.slice(1));
  } else if (/^\d{4}$/.test(t)) {
    h = Number(t.slice(0, 2));
    m = Number(t.slice(2));
  } else {
    return null;
  }

  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Dauer eines Dienstes in Minuten.
 *
 * Ein Ende vor dem Beginn heißt: über Mitternacht hinaus. Im Bowling ist das
 * der Normalfall, keine Ausnahme — die Spätschicht endet um 1:00.
 */
export function shiftMinutes(day: ShiftDay): number {
  if (day.status !== 'dienst') return 0;
  const b = toMinutes(day.b);
  const e = toMinutes(day.e);
  if (b === null || e === null) return 0;
  return e >= b ? e - b : 24 * 60 - b + e;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function weekMinutes(days: ShiftDay[]): number {
  return days.reduce((sum, d) => sum + shiftMinutes(d), 0);
}

/** Montag der Woche, in der das Datum liegt. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/** Kalenderwoche nach ISO 8601 — die Woche mit dem ersten Donnerstag. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNo = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNo);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Sieben leere Tage — Grundlage jeder neuen Woche. */
export function emptyWeek(): ShiftDay[] {
  return Array.from({ length: 7 }, () => ({ ...EMPTY_DAY }));
}


/**
 * Lage einer Schicht im Tag, als Anteil von 0 bis 1.
 *
 * Zahlen muss man lesen und vergleichen; eine Lage sieht man. Zwei Zeilen
 * untereinander verraten so auf einen Blick, ob jemand frueh anfaengt und der
 * andere spaet — ohne vier Uhrzeiten im Kopf zu behalten.
 *
 * Das Fenster laeuft von 6:00 bis 2:00 der Folgenacht; darin liegt der Betrieb
 * eines Bowlingcenters vollstaendig. Was darueber hinausgeht, wird an den Rand
 * gedrueckt statt abgeschnitten — sichtbar bleibt es allemal.
 */
const WINDOW_START = 6 * 60;
const WINDOW_END = 26 * 60;

export function shiftSpan(day: ShiftDay): { from: number; to: number } | null {
  if (day.status !== 'dienst') return null;
  const b = /^(\d{1,2}):(\d{2})$/.exec(day.b);
  if (!b) return null;
  const start = Number(b[1]) * 60 + Number(b[2]);
  const minutes = shiftMinutes(day);
  if (minutes <= 0) return null;

  const span = WINDOW_END - WINDOW_START;
  const from = (start - WINDOW_START) / span;
  const to = (start + minutes - WINDOW_START) / span;
  return {
    from: Math.min(Math.max(from, 0), 1),
    to: Math.min(Math.max(to, 0), 1),
  };
}
