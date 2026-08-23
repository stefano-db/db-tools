import { describe, expect, it } from 'vitest';
import { bereicheFuer } from './bereiche';
import type { ModuleInfo } from '../data';

const modul = (key: string, extra: Partial<ModuleInfo> = {}): ModuleInfo => ({
  key,
  nameDe: key,
  path: `/${key}`,
  externalUrl: null,
  icon: null,
  sortOrder: 10,
  canRead: true,
  canWrite: true,
  ...extra,
});

describe('bereicheFuer', () => {
  it('zeigt am Counter keine Bahnwartung — sie steht gar nicht erst in der Liste', () => {
    const counter = bereicheFuer([modul('urkunden'), modul('dokumente')], false);
    const alles = [...counter.meine, ...counter.alle, ...counter.leitung];
    expect(alles.map((b) => b.schluessel)).not.toContain('maintenance');
  });

  it('trennt den eigenen Bereich von dem, was alle angeht', () => {
    const mechanik = bereicheFuer([modul('maintenance'), modul('dokumente')], false);
    // Die Dokumente gehoeren seit dem eigenen Ablageort zum Bereich: der
    // Counter legt dort Preislisten ab, die Mechanik Wartungsanleitungen.
    expect(mechanik.meine.map((b) => b.schluessel).sort()).toEqual(['dokumente', 'maintenance']);
    expect(mechanik.alle.map((b) => b.schluessel)).not.toContain('dokumente');
  });

  it('gibt jedem den Dienstplan, das Fragen und das eigene Konto', () => {
    const ohne = bereicheFuer([], false);
    expect(ohne.alle.map((b) => b.schluessel)).toEqual(['dienstplan', 'chat', 'profil']);
    expect(ohne.meine).toEqual([]);
  });

  it('ordnet nach Gebrauch: der Plan vor dem Fragen', () => {
    const reihe = bereicheFuer([], false).alle.map((b) => b.schluessel);
    expect(reihe.indexOf('dienstplan')).toBeLessThan(reihe.indexOf('chat'));
  });

  it('zeigt die Verwaltung nur, wer leitet', () => {
    expect(bereicheFuer([], false).leitung).toEqual([]);
    expect(bereicheFuer([], true).leitung.map((b) => b.schluessel)).toEqual(['verwaltung']);
  });

  it('merkt sich, was nur angesehen werden darf', () => {
    const nurLesen = bereicheFuer([modul('maintenance', { canWrite: false })], false);
    expect(nurLesen.meine[0].nurLesen).toBe(true);
  });

  it('reicht eigenstaendige Werkzeuge mit ihrer eigenen Adresse durch', () => {
    const extern = bereicheFuer([modul('urkunden', { externalUrl: 'https://beispiel.test/' })], false);
    expect(extern.meine[0].extern).toBe('https://beispiel.test/');
  });

  it('gibt jeder Kachel ein eigenes Zeichen — sonst taugt es nicht zum Wiederfinden', () => {
    const alles = bereicheFuer([modul('maintenance'), modul('urkunden'), modul('dokumente')], true);
    const zeichen = [...alles.meine, ...alles.alle, ...alles.leitung].map((b) => b.symbol);
    expect(new Set(zeichen).size).toBe(zeichen.length);
  });
});
