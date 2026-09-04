import { describe, expect, it } from 'vitest';
import { unterschied, tagInWorten } from './unterschied';
import type { ShiftDay } from '../../data';

const dienst = (b: string, e: string): ShiftDay => ({ status: 'dienst', b, e, std: '' });
const frei: ShiftDay = { status: 'frei', b: '', e: '', std: '' };
const urlaub: ShiftDay = { status: 'urlaub', b: '', e: '', std: '' };

const woche = (...tage: ShiftDay[]): ShiftDay[] =>
  Array.from({ length: 7 }, (_, i) => tage[i] ?? frei);

describe('unterschied', () => {
  it('meldet nichts, wenn sich für mich nichts geändert hat', () => {
    const a = woche(dienst('09:00', '17:00'), frei, dienst('14:30', '23:00'));
    const b = woche(dienst('09:00', '17:00'), frei, dienst('14:30', '23:00'));
    expect(unterschied(a, b)).toEqual([]);
  });

  it('benennt Tag, neuen und alten Stand', () => {
    const a = woche(dienst('09:00', '17:00'));
    const b = woche(dienst('10:00', '18:00'));
    expect(unterschied(a, b)).toEqual(['Montag: 10:00–18:00 (vorher 09:00–17:00)']);
  });

  it('erkennt eine gestrichene Schicht', () => {
    const a = woche(frei, dienst('14:30', '23:00'));
    const b = woche(frei, frei);
    expect(unterschied(a, b)).toEqual(['Dienstag: frei (vorher 14:30–23:00)']);
  });

  it('erkennt Urlaub und zaehlt mehrere Aenderungen auf', () => {
    const a = woche(dienst('09:00', '17:00'), dienst('09:00', '17:00'));
    const b = woche(urlaub, dienst('09:00', '17:00'), dienst('17:00', '23:00'));
    expect(unterschied(a, b)).toEqual([
      'Montag: Urlaub (vorher 09:00–17:00)',
      'Mittwoch: 17:00–23:00 (vorher frei)',
    ]);
  });

  it('meldet bei einer frisch angelegten Woche nur die Diensttage', () => {
    // Sonst stuenden in der Nachricht alle sieben Tage, und nach der zweiten
    // solchen Meldung schaltet sie jeder ab.
    const b = woche(dienst('09:00', '17:00'));
    expect(unterschied([], b)).toEqual(['Montag: 09:00–17:00 (vorher frei)']);
  });

  it('haelt „nicht eingeteilt" und „frei" fuer dasselbe — beides heisst: arbeitet nicht', () => {
    const a = woche({ status: 'nein', b: '', e: '', std: '' });
    const b = woche(frei);
    expect(unterschied(a, b)).toEqual([]);
  });
});

describe('tagInWorten', () => {
  it('nennt jeden Zustand beim Namen', () => {
    expect(tagInWorten(dienst('08:00', '12:00'))).toBe('08:00–12:00');
    expect(tagInWorten(frei)).toBe('frei');
    expect(tagInWorten(urlaub)).toBe('Urlaub');
    expect(tagInWorten(undefined)).toBe('frei');
  });

  it('nennt eine Schicht ohne Zeit nicht eine Schicht', () => {
    expect(tagInWorten({ status: 'dienst', b: '', e: '', std: '' })).toBe('frei');
  });

  it('benennt die Bahnpflege, statt sie wie eine Schicht aussehen zu lassen', () => {
    expect(tagInWorten({ status: 'bahnpflege', b: '08:00', e: '12:00', std: '' })).toBe(
      'Bahnpflege 08:00–12:00',
    );
    // Der Wechsel von Dienst zu Bahnpflege bei gleicher Zeit ist eine Aenderung,
    // die gemeldet werden muss - sonst steht jemand mit dem falschen Werkzeug da.
    const a = woche({ status: 'dienst', b: '08:00', e: '12:00', std: '' });
    const b = woche({ status: 'bahnpflege', b: '08:00', e: '12:00', std: '' });
    expect(unterschied(a, b)).toEqual([
      'Montag: Bahnpflege 08:00–12:00 (vorher 08:00–12:00)',
    ]);
  });
});
