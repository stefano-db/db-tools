import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  isoWeekNumber,
  mondayOf,
  parseTime,
  shiftMinutes,
  weekMinutes,
  type ShiftDay,
} from './rosterModel';

describe('parseTime', () => {
  it('versteht die Kurzformen aus dem schnellen Eintippen', () => {
    expect(parseTime('9')).toBe('09:00');
    expect(parseTime('930')).toBe('09:30');
    expect(parseTime('1430')).toBe('14:30');
    expect(parseTime('9:30')).toBe('09:30');
    expect(parseTime('9.30')).toBe('09:30');
    expect(parseTime(' 14:00 ')).toBe('14:00');
  });

  it('lässt Leeres leer, weist Unsinn ab', () => {
    expect(parseTime('')).toBe('');
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('12:75')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });
});

describe('shiftMinutes', () => {
  const dienst = (b: string, e: string): ShiftDay => ({ status: 'dienst', b, e });

  it('rechnet eine gewöhnliche Schicht', () => {
    expect(shiftMinutes(dienst('14:30', '23:00'))).toBe(510);
  });

  it('rechnet über Mitternacht — die Spätschicht endet nach 0 Uhr', () => {
    expect(shiftMinutes(dienst('18:00', '01:00'))).toBe(420);
  });

  it('zählt nur Dienst; Urlaub und Krank sind keine Arbeitszeit', () => {
    expect(shiftMinutes({ status: 'urlaub', b: '', e: '' })).toBe(0);
    expect(shiftMinutes({ status: 'krank', b: '09:00', e: '17:00' })).toBe(0);
    expect(shiftMinutes({ status: 'frei', b: '', e: '' })).toBe(0);
  });

  it('bleibt bei unvollständiger Zeit bei 0, statt zu raten', () => {
    expect(shiftMinutes(dienst('14:30', ''))).toBe(0);
  });
});

describe('weekMinutes', () => {
  it('summiert die Woche', () => {
    const week: ShiftDay[] = [
      { status: 'dienst', b: '09:00', e: '17:00' },
      { status: 'dienst', b: '18:00', e: '01:00' },
      { status: 'frei', b: '', e: '' },
      { status: 'urlaub', b: '', e: '' },
      { status: 'nein', b: '', e: '' },
      { status: 'dienst', b: '14:30', e: '23:00' },
      { status: 'nein', b: '', e: '' },
    ];
    expect(formatMinutes(weekMinutes(week))).toBe('23:30');
  });
});

describe('formatMinutes', () => {
  it('schreibt Stunden mit zweistelligen Minuten', () => {
    expect(formatMinutes(0)).toBe('0:00');
    expect(formatMinutes(90)).toBe('1:30');
    expect(formatMinutes(2400)).toBe('40:00');
  });
});

describe('mondayOf', () => {
  it('findet den Montag — auch am Sonntag, der zur Vorwoche gehört', () => {
    expect(mondayOf(new Date(2026, 7, 18)).getDate()).toBe(17); // Dienstag
    expect(mondayOf(new Date(2026, 7, 23)).getDate()).toBe(17); // Sonntag
    expect(mondayOf(new Date(2026, 7, 17)).getDate()).toBe(17); // Montag selbst
  });
});

describe('isoWeekNumber', () => {
  it('zählt nach ISO 8601', () => {
    expect(isoWeekNumber(new Date(2026, 7, 17))).toBe(34);
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });
});
