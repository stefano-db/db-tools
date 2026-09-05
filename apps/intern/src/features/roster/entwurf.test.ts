import { describe, expect, it } from 'vitest';
import { entwurfStand, standInWorten } from './entwurf';

const dienst = (b: string, e: string) => ({ status: 'dienst', b, e });
const frei = { status: 'frei', b: '', e: '' };
const woche = (...tage: unknown[]) => ({ d: Array.from({ length: 7 }, (_, i) => tage[i] ?? frei) });

describe('entwurfStand', () => {
  it('meldet nichts, wenn kein Entwurf vorliegt', () => {
    expect(entwurfStand({ a: woche(dienst('09:00', '17:00')) }, null)).toEqual({ tage: 0, personen: 0 });
  });

  it('meldet nichts, wenn der Entwurf gleich ist', () => {
    const w = { a: woche(dienst('09:00', '17:00')), b: woche(frei) };
    expect(entwurfStand(w, structuredClone(w))).toEqual({ tage: 0, personen: 0 });
  });

  it('zählt Tage und Personen getrennt', () => {
    const alt = { a: woche(dienst('09:00', '17:00')), b: woche(frei) };
    const neu = {
      a: woche(dienst('10:00', '18:00'), dienst('09:00', '13:00')),
      b: woche(frei),
    };
    expect(entwurfStand(alt, neu)).toEqual({ tage: 2, personen: 1 });
  });

  it('erkennt einen neu aufgenommenen Namen', () => {
    const nein = { status: 'nein', b: '', e: '' };
    const alt = { a: woche(frei) };
    const neu = {
      a: woche(frei),
      b: { d: [dienst('14:30', '23:00'), nein, nein, nein, nein, nein, nein] },
    };
    expect(entwurfStand(alt, neu)).toEqual({ tage: 1, personen: 1 });
  });

  it('zählt auch gesetzte freie Tage — „frei" ist eine Eintragung', () => {
    // Ein Name, der neu mit sechs freien Tagen und einer Schicht im Plan
    // steht, hat sieben gesetzte Tage. Das ist keine Schönheitsfrage: wer
    // veröffentlicht, verschickt für all das eine Meldung.
    const alt = {};
    const neu = { b: woche(dienst('14:30', '23:00')) };
    expect(entwurfStand(alt, neu)).toEqual({ tage: 7, personen: 1 });
  });

  it('erkennt einen Bereichswechsel bei gleicher Zeit', () => {
    const alt = { a: woche(dienst('14:30', '23:00')) };
    const neu = { a: woche({ ...dienst('14:30', '23:00'), bereich: 2 }) };
    expect(entwurfStand(alt, neu)).toEqual({ tage: 1, personen: 1 });
  });

  it('hält einen fehlenden Tag für „nicht eingeteilt", nicht für eine Änderung', () => {
    const alt = { a: { d: [] } };
    const neu = { a: { d: [{ status: 'nein', b: '', e: '' }] } };
    // Der erste Tag ist in beiden „nicht eingeteilt"; die übrigen sechs sind
    // links leer und rechts nicht vorhanden — auch das ist dasselbe.
    expect(entwurfStand(alt, neu)).toEqual({ tage: 0, personen: 0 });
  });
});

describe('standInWorten', () => {
  it('setzt die Einzahl richtig', () => {
    expect(standInWorten({ tage: 1, personen: 1 })).toBe('1 Änderung bei 1 Person');
    expect(standInWorten({ tage: 4, personen: 2 })).toBe('4 Änderungen bei 2 Personen');
    expect(standInWorten({ tage: 0, personen: 0 })).toBe('Keine Änderungen');
  });
});
