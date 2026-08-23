import { describe, expect, it } from 'vitest';
import {
  hinweise,
  hinweisText,
  lage,
  saison,
  tageBisAblauf,
  type Schliessfach,
} from './schliessfachModel';

const HEUTE = new Date(2026, 7, 23); // 23.08.2026

const fach = (teil: Partial<Schliessfach> = {}): Schliessfach => ({
  id: 'x',
  nummer: 1,
  groesse: 'S',
  zustand: 'vermietet',
  mieter: 'Beispiel',
  kontakt: null,
  mieteVon: '2026-01-01',
  mieteBis: '2026-12-31',
  bezahlt: true,
  ueberzahlung: false,
  notiz: null,
  ...teil,
});

describe('tageBisAblauf', () => {
  it('zählt bis zum Ende der Miete', () => {
    expect(tageBisAblauf(fach({ mieteBis: '2026-08-30' }), HEUTE)).toBe(7);
    expect(tageBisAblauf(fach({ mieteBis: '2026-08-23' }), HEUTE)).toBe(0);
  });

  it('wird negativ, wenn es vorbei ist', () => {
    expect(tageBisAblauf(fach({ mieteBis: '2026-08-01' }), HEUTE)).toBe(-22);
  });

  it('bleibt still, wenn kein Ende eingetragen ist', () => {
    expect(tageBisAblauf(fach({ mieteBis: null }), HEUTE)).toBeNull();
  });
});

describe('lage', () => {
  it('nennt zuerst das Dringlichste', () => {
    // Defekt schlaegt alles: ein kaputtes Fach vermietet man nicht weiter,
    // auch wenn die Miete noch laeuft.
    expect(lage(fach({ zustand: 'defekt', mieteBis: '2020-01-01' }), HEUTE, 42)).toBe('defekt');
    // Abgelaufen schlaegt unbezahlt — beides zugleich ist der Normalfall.
    expect(lage(fach({ mieteBis: '2026-01-01', bezahlt: false }), HEUTE, 42)).toBe('abgelaufen');
  });

  it('warnt innerhalb der Frist, aber nicht davor', () => {
    expect(lage(fach({ mieteBis: '2026-09-15' }), HEUTE, 42)).toBe('faellig'); // 23 Tage
    expect(lage(fach({ mieteBis: '2026-12-31' }), HEUTE, 42)).toBe('vermietet'); // 130 Tage
  });

  it('nimmt die Frist aus dem Haus, nicht aus dem Programm', () => {
    const bald = fach({ mieteBis: '2026-09-15' }); // 23 Tage
    expect(lage(bald, HEUTE, 42)).toBe('faellig');
    expect(lage(bald, HEUTE, 7)).toBe('vermietet');
  });

  it('meldet am letzten Tag noch fällig und am nächsten abgelaufen', () => {
    expect(lage(fach({ mieteBis: '2026-08-23' }), HEUTE, 42)).toBe('faellig');
    expect(lage(fach({ mieteBis: '2026-08-22' }), HEUTE, 42)).toBe('abgelaufen');
  });

  it('unterscheidet unbezahlt und überbezahlt', () => {
    expect(lage(fach({ bezahlt: false }), HEUTE, 42)).toBe('unbezahlt');
    expect(lage(fach({ ueberzahlung: true }), HEUTE, 42)).toBe('ueberzahlung');
  });

  it('lässt freie und reservierte Fächer in Ruhe', () => {
    expect(lage(fach({ zustand: 'frei', mieter: null, mieteBis: null }), HEUTE, 42)).toBe('frei');
    expect(lage(fach({ zustand: 'reserviert' }), HEUTE, 42)).toBe('reserviert');
    // Auch mit laengst abgelaufenem Datum: ein freies Fach laeuft nicht ab.
    expect(lage(fach({ zustand: 'frei', mieteBis: '2020-01-01' }), HEUTE, 42)).toBe('frei');
  });

  it('meldet ein vermietetes Fach ohne Enddatum nicht als fällig', () => {
    expect(lage(fach({ mieteBis: null }), HEUTE, 42)).toBe('vermietet');
  });
});

describe('hinweise', () => {
  const bestand: Schliessfach[] = [
    fach({ id: '1', nummer: 3, mieteBis: '2026-01-01' }), // abgelaufen
    fach({ id: '2', nummer: 1, mieteBis: '2026-02-01' }), // abgelaufen
    fach({ id: '3', nummer: 7, mieteBis: '2026-09-01' }), // faellig
    fach({ id: '4', nummer: 9, bezahlt: false }), // unbezahlt
    fach({ id: '5', nummer: 11, zustand: 'defekt' }),
    fach({ id: '6', nummer: 12 }), // in Ordnung
    fach({ id: '7', nummer: 13, zustand: 'frei', mieter: null }),
  ];

  it('meldet nur, wobei jemand etwas tun muss', () => {
    const h = hinweise(bestand, HEUTE, 42);
    expect(h.map((x) => x.lage)).toEqual(['abgelaufen', 'unbezahlt', 'faellig', 'defekt']);
    // Was in Ordnung ist, taucht nicht auf: „57 Faecher verliehen" ist keine
    // Nachricht.
    expect(h.some((x) => x.lage === 'vermietet' || x.lage === 'frei')).toBe(false);
  });

  it('nennt die Fachnummern in der Reihenfolge der Wand', () => {
    const h = hinweise(bestand, HEUTE, 42);
    expect(h[0].faecher).toEqual([1, 3]);
  });

  it('schweigt, wenn nichts ansteht', () => {
    expect(hinweise([fach({ nummer: 1 })], HEUTE, 42)).toEqual([]);
  });

  it('schreibt Einzahl und Mehrzahl richtig', () => {
    expect(hinweisText({ lage: 'abgelaufen', anzahl: 1, faecher: [3] })).toBe(
      'Ein Fach ist abgelaufen',
    );
    expect(hinweisText({ lage: 'abgelaufen', anzahl: 2, faecher: [1, 3] })).toBe(
      '2 Fächer sind abgelaufen',
    );
  });
});

describe('saison', () => {
  it('spannt vom frühesten Beginn bis zum spätesten Ende', () => {
    expect(
      saison([
        fach({ mieteVon: '2026-09-01', mieteBis: '2027-08-31' }),
        fach({ mieteVon: '2026-10-01', mieteBis: '2027-09-30' }),
      ]),
    ).toBe('2026/2027');
  });

  it('nennt nur ein Jahr, wenn alles hineinfällt', () => {
    expect(saison([fach({ mieteVon: '2026-01-01', mieteBis: '2026-12-31' })])).toBe('2026');
  });

  it('zählt nur laufende Mieten — leere Fächer verfälschen die Jahreszahl nicht', () => {
    expect(
      saison([
        fach({ zustand: 'frei', mieter: null, mieteVon: '2019-01-01', mieteBis: '2019-12-31' }),
        fach({ mieteVon: '2026-01-01', mieteBis: '2026-12-31' }),
      ]),
    ).toBe('2026');
  });

  it('schweigt, wenn nichts vermietet ist', () => {
    expect(saison([fach({ zustand: 'frei', mieter: null, mieteVon: null, mieteBis: null })])).toBeNull();
  });
});
