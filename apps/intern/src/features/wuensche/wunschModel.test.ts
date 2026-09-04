import { describe, expect, it } from 'vitest';
import { sortiere } from './wunschModel';
import type { Wunsch, WunschStatus } from '../../data';

const w = (
  id: string,
  status: WunschStatus,
  stimmen: number,
  tag: string,
  meiner = false,
): Wunsch => ({
  id,
  titel: id,
  beschreibung: null,
  bereich: null,
  status,
  eingereichtVon: meiner ? 'ich' : 'jemand',
  eingereichtVonName: 'X',
  eingereichtAm: `2026-09-${tag}T10:00:00Z`,
  antwort: null,
  beantwortetVonName: null,
  beantwortetAm: null,
  stimmen,
  ichHabeGestimmt: false,
  meiner,
});

describe('sortiere', () => {
  it('stellt Geplantes vor Offenes und Erledigtes ans Ende', () => {
    const liste = [
      w('abgelehnt', 'abgelehnt', 99, '01'),
      w('offen', 'offen', 1, '02'),
      w('umgesetzt', 'umgesetzt', 99, '03'),
      w('geplant', 'geplant', 0, '04'),
    ];
    expect(sortiere(liste, 'alle').map((x) => x.id)).toEqual([
      'geplant',
      'offen',
      'umgesetzt',
      'abgelehnt',
    ]);
  });

  it('sortiert bei gleichem Stand nach Zustimmung', () => {
    const liste = [w('wenig', 'offen', 2, '01'), w('viel', 'offen', 9, '02')];
    expect(sortiere(liste, 'alle').map((x) => x.id)).toEqual(['viel', 'wenig']);
  });

  it('nimmt bei Gleichstand das Datum, damit die Liste nicht springt', () => {
    const liste = [w('alt', 'offen', 3, '01'), w('neu', 'offen', 3, '09')];
    expect(sortiere(liste, 'alle').map((x) => x.id)).toEqual(['neu', 'alt']);
    // Dieselbe Eingabe in anderer Reihenfolge ergibt dieselbe Ausgabe.
    expect(sortiere([...liste].reverse(), 'alle').map((x) => x.id)).toEqual(['neu', 'alt']);
  });

  it('zeigt unter „offen" auch das Geplante — daran wird ja gearbeitet', () => {
    const liste = [
      w('offen', 'offen', 0, '01'),
      w('geplant', 'geplant', 0, '02'),
      w('fertig', 'umgesetzt', 0, '03'),
    ];
    expect(sortiere(liste, 'offen').map((x) => x.id)).toEqual(['geplant', 'offen']);
  });

  it('zeigt unter „meine" nur die eigenen', () => {
    const liste = [w('fremd', 'offen', 0, '01'), w('eigen', 'offen', 0, '02', true)];
    expect(sortiere(liste, 'meine').map((x) => x.id)).toEqual(['eigen']);
  });

  it('lässt die Eingabeliste unangetastet', () => {
    const liste = [w('a', 'abgelehnt', 0, '01'), w('b', 'offen', 0, '02')];
    sortiere(liste, 'alle');
    expect(liste.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
