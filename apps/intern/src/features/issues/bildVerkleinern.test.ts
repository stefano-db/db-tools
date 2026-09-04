import { describe, expect, it } from 'vitest';
import { fotoName, zielMasse, MAX_KANTE } from './bildVerkleinern';

describe('zielMasse', () => {
  it('laesst kleine Bilder unangetastet', () => {
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
  });

  it('laesst ein Bild genau auf der Grenze unangetastet', () => {
    expect(zielMasse(MAX_KANTE, 900)).toEqual({ breite: MAX_KANTE, hoehe: 900 });
  });

  it('verkleinert auf die laengste Kante und haelt das Seitenverhaeltnis', () => {
    // Typisches Hochformat vom iPhone.
    expect(zielMasse(3024, 4032)).toEqual({ breite: 1200, hoehe: 1600 });
  });

  it('rechnet auch im Querformat ueber die laengste Kante', () => {
    expect(zielMasse(4032, 3024)).toEqual({ breite: 1600, hoehe: 1200 });
  });

  it('laesst ein extremes Panorama nicht auf null zusammenfallen', () => {
    const m = zielMasse(20000, 5);
    expect(m.breite).toBe(MAX_KANTE);
    expect(m.hoehe).toBe(1);
  });

  it('meldet bei unsinnigen Massen null statt zu rechnen', () => {
    expect(zielMasse(0, 100)).toEqual({ breite: 0, hoehe: 0 });
  });
});

describe('fotoName', () => {
  it('haengt Stempel und laufende Nummer an', () => {
    expect(fotoName('IMG_0421.HEIC', 0, '2026-09-04')).toBe('2026-09-04-1-IMG_0421.jpg');
  });

  it('ersetzt Zeichen, die im Speicherpfad Aerger machen', () => {
    expect(fotoName('Bahn 12 – Riemen (neu).jpg', 1, 'x')).toBe('x-2-Bahn-12-Riemen-neu.jpg');
  });

  it('faellt auf einen Ersatznamen zurueck, wenn nichts uebrig bleibt', () => {
    expect(fotoName('....', 2, 'x')).toBe('x-3-foto.jpg');
  });
});
