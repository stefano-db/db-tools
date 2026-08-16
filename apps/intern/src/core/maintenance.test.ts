import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  anchorAfterCompletion,
  buildResetEpoch,
  cascadeTargets,
  compareLanes,
  computeLaneOverview,
  computeMaintenanceStatus,
  needsCounterResetDialog,
  readingBaseline,
  summarize,
  toCumulative,
  validateReading,
  type CounterEpoch,
  type LaneReadingState,
  type MaintenanceAnchor,
  type MaintenanceType,
} from './index';

// ---------------------------------------------------------------------------
// Testdaten
// ---------------------------------------------------------------------------

const TODAY = '2026-08-17';

const T25: MaintenanceType = {
  id: 't25', code: '25k', nameDe: '25.000 Frames',
  intervalFrames: 25_000, maxIntervalDays: null, cascadesToSmaller: false, sortOrder: 1,
};
const T50: MaintenanceType = {
  id: 't50', code: '50k', nameDe: '50.000 Frames',
  intervalFrames: 50_000, maxIntervalDays: null, cascadesToSmaller: true, sortOrder: 2,
};
const T100: MaintenanceType = {
  id: 't100', code: '100k', nameDe: '100.000 Frames',
  intervalFrames: 100_000, maxIntervalDays: null, cascadesToSmaller: true, sortOrder: 3,
};
const T500: MaintenanceType = {
  id: 't500', code: '500k', nameDe: '500.000 Frames',
  intervalFrames: 500_000, maxIntervalDays: null, cascadesToSmaller: true, sortOrder: 4,
};
const ALL_TYPES = [T25, T50, T100, T500];

function lane(overrides: Partial<LaneReadingState> = {}): LaneReadingState {
  return {
    laneId: 'l1',
    laneNumber: 1,
    status: 'active',
    currentFrames: 100_000,
    lastReadingDate: '2026-08-17',
    framesPerWeek: 2_000,
    ...overrides,
  };
}

function anchor(typeId: string, frames: number | null, date: string | null = '2026-01-05'): MaintenanceAnchor {
  return { maintenanceTypeId: typeId, anchorFrames: frames, anchorDate: date };
}

const status = (l: LaneReadingState, t: MaintenanceType, a: MaintenanceAnchor | undefined) =>
  computeMaintenanceStatus(l, t, a, DEFAULT_SETTINGS, TODAY);

// ---------------------------------------------------------------------------

describe('Fall 1 – exakt fällige Wartung', () => {
  it('meldet fällig, wenn genau das Intervall erreicht ist', () => {
    // 156.000 − 131.000 = 25.000
    const s = status(lane({ currentFrames: 156_000 }), T25, anchor('t25', 131_000));
    expect(s.framesSince).toBe(25_000);
    expect(s.kind).toBe('due');
    expect(s.overdueFrames).toBe(0);
    expect(s.detail).toBe('Intervall erreicht');
    expect(s.nextDueAtFrames).toBe(156_000);
  });

  it('meldet einen Frame vor dem Intervall noch nicht als fällig', () => {
    const s = status(lane({ currentFrames: 155_999 }), T25, anchor('t25', 131_000));
    expect(s.kind).not.toBe('due');
    expect(s.framesRemaining).toBe(1);
  });
});

describe('Fall 2 – Beispiel aus der Spezifikation', () => {
  it('Bahn 4: 45.000 − 27.300 = 17.700, noch nicht fällig', () => {
    const s = status(lane({ laneNumber: 4, currentFrames: 45_000 }), T25, anchor('t25', 27_300));
    expect(s.framesSince).toBe(17_700);
    expect(s.framesRemaining).toBe(7_300);
    expect(s.kind).toBe('ok');
    expect(s.nextDueAtFrames).toBe(52_300);
  });

  it('Bahn 1: 84.250 mit 25k-Anker 68.550 ist OK mit 9.300 Rest', () => {
    const s = status(lane({ currentFrames: 84_250 }), T25, anchor('t25', 68_550));
    expect(s.kind).toBe('ok');
    expect(s.framesRemaining).toBe(9_300);
    expect(s.detail).toBe('Noch 9.300 Frames');
  });
});

describe('Fall 3 – kurz vor Fälligkeit', () => {
  it('warnt vor, wenn die Wartung innerhalb der Vorwarnzeit erwartet wird', () => {
    // Rest 3.420 bei 2.000 Frames/Woche => ca. 1,7 Wochen
    const s = status(lane({ currentFrames: 121_580 }), T25, anchor('t25', 100_000));
    expect(s.kind).toBe('due_soon');
    expect(s.framesRemaining).toBe(3_420);
    expect(s.detail).toContain('Noch 3.420 Frames');
    expect(s.detail).toContain('ca. 2 Wochen');
    expect(s.estimatedDueDate).toBe('2026-08-29');
  });

  it('bleibt grün, solange die Wartung weiter als die Vorwarnzeit entfernt ist', () => {
    // Rest 15.000 bei 2.000/Woche => 7,5 Wochen
    const s = status(lane({ currentFrames: 110_000 }), T25, anchor('t25', 100_000));
    expect(s.kind).toBe('ok');
  });

  it('nutzt die Prozentregel nur, solange keine Wochenrate bekannt ist', () => {
    const withoutRate = lane({ currentFrames: 121_580, framesPerWeek: null });
    expect(status(withoutRate, T25, anchor('t25', 100_000)).kind).toBe('due_soon');
  });
});

describe('Fall 4 – überfällige Wartung', () => {
  it('weist die Überschreitung in Frames aus', () => {
    const s = status(lane({ currentFrames: 127_450 }), T25, anchor('t25', 100_000));
    expect(s.kind).toBe('due');
    expect(s.overdueFrames).toBe(2_450);
    expect(s.detail).toBe('2.450 Frames überfällig');
  });
});

describe('Fall 5 – Wartung vorzeitig durchgeführt', () => {
  it('setzt den aktuellen Stand als neuen Ausgangspunkt', () => {
    const before = status(lane({ currentFrames: 112_000 }), T25, anchor('t25', 100_000));
    expect(before.kind).toBe('ok'); // erst 12.000 seit der letzten Wartung

    const { anchor: next, nextDueAtFrames } = anchorAfterCompletion(112_000, '2026-08-17', T25);
    expect(nextDueAtFrames).toBe(137_000);

    const after = status(lane({ currentFrames: 112_000 }), T25, next);
    expect(after.framesSince).toBe(0);
    expect(after.kind).toBe('ok');
    expect(after.nextDueAtFrames).toBe(137_000);
  });

  it('Beispiel 100k-Wartung bei 105.430 ergibt 205.430 als nächsten Termin', () => {
    const { nextDueAtFrames } = anchorAfterCompletion(105_430, '2026-08-17', T100);
    expect(nextDueAtFrames).toBe(205_430);
  });
});

describe('Fall 6 – mehrere Wartungsintervalle gleichzeitig', () => {
  it('bewertet jedes Intervall unabhängig', () => {
    const l = lane({ laneNumber: 7, currentFrames: 105_430 });
    const anchors = [
      anchor('t25', 77_980),   // 27.450 seit der Wartung -> überfällig
      anchor('t50', 87_130),   // 18.300 seit der Wartung -> OK
      anchor('t100', 5_430),   // 100.000 seit der Wartung -> exakt fällig
      anchor('t500', 0),       // 105.430 seit der Wartung -> OK
    ];
    const o = computeLaneOverview(l, ALL_TYPES, anchors, DEFAULT_SETTINGS, TODAY);

    expect(o.dueCount).toBe(2);
    expect(o.worst).toBe('due');
    expect(o.maxOverdueFrames).toBe(2_450);

    const byCode = Object.fromEntries(o.statuses.map((s) => [s.code, s]));
    expect(byCode['25k'].kind).toBe('due');
    expect(byCode['25k'].overdueFrames).toBe(2_450);
    expect(byCode['50k'].kind).toBe('ok');
    expect(byCode['100k'].kind).toBe('due');
    expect(byCode['100k'].overdueFrames).toBe(0);
    expect(byCode['500k'].kind).toBe('ok');
  });
});

describe('Fall 7 – Frame-Zähler zurückgesetzt', () => {
  const epoch1: CounterEpoch = {
    id: 'e1', laneId: 'l1', effectiveFrom: '2024-01-01',
    counterStart: 0, cumulativeOffset: 0, reason: 'initial',
  };

  it('rechnet nach einem Reset auf 0 lückenlos weiter', () => {
    expect(toCumulative(318_640, epoch1)).toBe(318_640);

    const epoch2 = buildResetEpoch({
      id: 'e2', laneId: 'l1', effectiveFrom: '2026-08-17',
      lastCumulativeFrames: 318_640, newCounterValue: 0, reason: 'counter_reset',
    });
    expect(epoch2.cumulativeOffset).toBe(318_640);
    expect(toCumulative(2_100, epoch2)).toBe(320_740);
  });

  it('kommt mit einem Austauschzähler zurecht, der nicht bei 0 startet', () => {
    const epoch2 = buildResetEpoch({
      id: 'e2', laneId: 'l1', effectiveFrom: '2026-08-17',
      lastCumulativeFrames: 318_640, newCounterValue: 1_200, reason: 'counter_replaced',
    });
    expect(epoch2.counterStart).toBe(1_200);
    expect(toCumulative(1_200, epoch2)).toBe(318_640); // kein Sprung am Wechseltag
    expect(toCumulative(3_300, epoch2)).toBe(320_740);
  });

  it('zählt Frames mit, die zwischen Wechsel und nächster Ablesung gelaufen sind', () => {
    // Zähler getauscht, neuer Zähler startete bei 0. Eine Woche später steht er
    // auf 1.240 — diese 1.240 Frames müssen im Gesamtstand ankommen.
    const epoch2 = buildResetEpoch({
      id: 'e2', laneId: 'l1', effectiveFrom: '2026-08-10',
      lastCumulativeFrames: 80_900, newCounterValue: 0, reason: 'counter_replaced',
    });
    expect(toCumulative(1_240, epoch2)).toBe(82_140);
  });

  it('lässt die Wartungshistorie durch den Reset unberührt', () => {
    const epoch2 = buildResetEpoch({
      id: 'e2', laneId: 'l1', effectiveFrom: '2026-08-17',
      lastCumulativeFrames: 318_640, newCounterValue: 0, reason: 'counter_reset',
    });
    const current = toCumulative(2_100, epoch2); // 320.740
    // Der Anker liegt in der alten Epoche, der Stand in der neuen — die Rechnung
    // muss trotzdem exakt dieselbe sein wie ohne Zählerwechsel.
    const s = status(lane({ currentFrames: current }), T25, anchor('t25', 300_000));
    expect(s.framesSince).toBe(20_740);
    expect(s.framesRemaining).toBe(4_260);
    expect(s.kind).toBe('due_soon'); // 4.260 Rest sind bei 2.000/Woche gut 2 Wochen
    expect(s.nextDueAtFrames).toBe(325_000);
  });

  it('meldet einen niedrigeren Rohwert als Reset-Verdacht statt ihn zu verrechnen', () => {
    const issues = validateReading({
      rawValue: 1_240,
      epoch: epoch1,
      readingDate: TODAY,
      today: TODAY,
      previousCumulative: 318_640,
      previousDate: '2026-08-10',
      framesPerWeek: 2_100,
      settings: DEFAULT_SETTINGS,
    });
    expect(needsCounterResetDialog(issues)).toBe(true);
    expect(issues[0].level).toBe('error');
  });
});

describe('Fall 8 – falsche Frame-Eingabe korrigiert', () => {
  const epoch: CounterEpoch = {
    id: 'e1', laneId: 'l1', effectiveFrom: '2024-01-01',
    counterStart: 0, cumulativeOffset: 0, reason: 'initial',
  };

  it('erkennt den Tippfehler bereits bei der Eingabe', () => {
    const issues = validateReading({
      rawValue: 862_310, // gemeint war 86.310
      epoch,
      readingDate: TODAY,
      today: TODAY,
      previousCumulative: 84_250,
      previousDate: '2026-08-10',
      framesPerWeek: 2_100,
      settings: DEFAULT_SETTINGS,
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('implausible_jump');
    expect(codes).toContain('above_absolute_max');
    expect(issues.every((i) => i.level === 'warning')).toBe(true); // blockiert nicht
  });

  it('liefert nach der Korrektur wieder den richtigen Status', () => {
    const wrong = status(lane({ currentFrames: 862_310 }), T25, anchor('t25', 68_550));
    expect(wrong.kind).toBe('due'); // Falscheingabe würde Wartung auslösen

    const corrected = status(lane({ currentFrames: 86_310 }), T25, anchor('t25', 68_550));
    expect(corrected.kind).toBe('ok');
    expect(corrected.framesSince).toBe(17_760);
  });

  it('nimmt bei einer Korrektur desselben Tages den ersetzten Wert nicht als Massstab', () => {
    const same = readingBaseline({
      selectedDate: '2026-08-16',
      lastReadingDate: '2026-08-16',
      lastCumulative: 282_958,
    });
    expect(same).toEqual({ isCorrection: true, previousCumulative: null, previousDate: null });

    const newDay = readingBaseline({
      selectedDate: '2026-08-23',
      lastReadingDate: '2026-08-16',
      lastCumulative: 282_958,
    });
    expect(newDay).toEqual({
      isCorrection: false,
      previousCumulative: 282_958,
      previousDate: '2026-08-16',
    });

    const first = readingBaseline({
      selectedDate: '2026-08-16',
      lastReadingDate: null,
      lastCumulative: null,
    });
    expect(first.isCorrection).toBe(false);
  });

  it('meldet eine Korrektur nach unten nicht als Zaehler-Reset', () => {
    // Wird die Ablesung desselben Tages ueberschrieben, ist der bisherige Wert
    // genau der, der ersetzt werden soll. Ohne Vergleichswert darf ein
    // niedrigerer Wert deshalb keinen Reset-Verdacht ausloesen.
    const issues = validateReading({
      rawValue: 84_100,
      epoch,
      readingDate: TODAY,
      today: TODAY,
      previousCumulative: null,
      previousDate: null,
      framesPerWeek: 2_100,
      settings: DEFAULT_SETTINGS,
    });
    expect(issues).toHaveLength(0);
  });

  it('akzeptiert einen plausiblen Zuwachs ohne Warnung', () => {
    const issues = validateReading({
      rawValue: 86_310,
      epoch,
      readingDate: TODAY,
      today: TODAY,
      previousCumulative: 84_250,
      previousDate: '2026-08-10',
      framesPerWeek: 2_100,
      settings: DEFAULT_SETTINGS,
    });
    expect(issues).toHaveLength(0);
  });

  it('meldet eine ausgefallene Ablesewoche nicht als Ausreißer', () => {
    const issues = validateReading({
      rawValue: 88_450, // +4.200 in zwei Wochen bei 2.100/Woche
      epoch,
      readingDate: '2026-08-24',
      today: '2026-08-24',
      previousCumulative: 84_250,
      previousDate: '2026-08-10',
      framesPerWeek: 2_100,
      settings: DEFAULT_SETTINGS,
    });
    expect(issues).toHaveLength(0);
  });
});

describe('Unbekannter Wartungsstand', () => {
  it('wird niemals als 0 interpretiert', () => {
    const s = status(lane({ currentFrames: 480_000 }), T25, anchor('t25', null, null));
    expect(s.kind).toBe('unknown');
    expect(s.framesSince).toBeNull();
    expect(s.detail).toContain('manuell prüfen');
  });

  it('gilt auch, wenn für den Typ überhaupt kein Anker existiert', () => {
    expect(status(lane(), T500, undefined).kind).toBe('unknown');
  });

  it('zählt auf dem Dashboard als ungeklärt, nicht als fällig', () => {
    const o = computeLaneOverview(
      lane({ currentFrames: 480_000 }),
      ALL_TYPES,
      [anchor('t25', null, null), anchor('t50', 450_000), anchor('t100', 400_000), anchor('t500', 0)],
      DEFAULT_SETTINGS,
      TODAY,
    );
    expect(o.unknownCount).toBe(1);
    expect(o.dueCount).toBe(0);
    expect(summarize([o]).unclear).toBe(1);
  });

  it('meldet Bahnen ohne jede Ablesung getrennt', () => {
    const o = computeLaneOverview(
      lane({ currentFrames: null, lastReadingDate: null, framesPerWeek: null }),
      ALL_TYPES, [], DEFAULT_SETTINGS, TODAY,
    );
    expect(o.worst).toBe('no_data');
    expect(summarize([o]).unclear).toBe(1);
  });
});

describe('Vorwarnung skaliert über alle Intervalle', () => {
  it('lässt die 500k-Wartung nicht ein Jahr lang gelb leuchten', () => {
    // Rest 100.000 = exakt 20 % des Intervalls, aber bei 2.000/Woche noch 50 Wochen
    const s = status(lane({ currentFrames: 500_000 }), T500, anchor('t500', 100_000));
    expect(s.framesRemaining).toBe(100_000);
    expect(s.kind).toBe('ok');
  });

  it('warnt bei derselben Bahn, sobald es zeitlich eng wird', () => {
    const s = status(lane({ currentFrames: 594_000 }), T500, anchor('t500', 100_000));
    expect(s.framesRemaining).toBe(6_000); // 3 Wochen
    expect(s.kind).toBe('due_soon');
  });
});

describe('Zusätzliches Kalenderintervall', () => {
  const T25Time: MaintenanceType = { ...T25, maxIntervalDays: 180 };

  it('macht eine kaum bespielte Bahn nach Ablauf der Frist fällig', () => {
    const l = lane({ currentFrames: 101_000, framesPerWeek: 30 });
    const s = computeMaintenanceStatus(l, T25Time, anchor('t25', 100_000, '2026-01-05'), DEFAULT_SETTINGS, TODAY);
    expect(s.daysSince).toBe(224);
    expect(s.kind).toBe('due');
    expect(s.reason).toBe('time');
    expect(s.detail).toContain('Zeitintervall');
  });

  it('bleibt vor Fristablauf grün', () => {
    const l = lane({ currentFrames: 101_000, framesPerWeek: 30 });
    const s = computeMaintenanceStatus(l, T25Time, anchor('t25', 100_000, '2026-06-01'), DEFAULT_SETTINGS, TODAY);
    expect(s.kind).toBe('ok');
  });

  it('meldet beide Gründe, wenn Frames und Zeit überschritten sind', () => {
    const l = lane({ currentFrames: 130_000 });
    const s = computeMaintenanceStatus(l, T25Time, anchor('t25', 100_000, '2026-01-05'), DEFAULT_SETTINGS, TODAY);
    expect(s.reason).toBe('both');
  });
});

describe('Kaskadierung', () => {
  it('schlägt beim 100k-Abschluss die kleineren Intervalle vor', () => {
    expect(cascadeTargets(T100, ALL_TYPES).map((t) => t.code)).toEqual(['50k', '25k']);
  });

  it('schlägt beim 25k-Abschluss nichts vor', () => {
    expect(cascadeTargets(T25, ALL_TYPES)).toEqual([]);
  });

  it('respektiert einen abgeschalteten Wartungstyp', () => {
    expect(cascadeTargets({ ...T500, cascadesToSmaller: false }, ALL_TYPES)).toEqual([]);
  });
});

describe('Dashboard-Sortierung', () => {
  it('reiht überfällig vor fällig vor ungeklärt vor bald fällig vor OK', () => {
    const mk = (n: number, current: number, a25: number | null, status: LaneReadingState['status'] = 'active') =>
      computeLaneOverview(
        lane({ laneId: `l${n}`, laneNumber: n, currentFrames: current, status }),
        [T25],
        [anchor('t25', a25, a25 === null ? null : '2026-06-01')],
        DEFAULT_SETTINGS,
        TODAY,
      );

    const overdue = mk(3, 130_000, 100_000);   // 5.000 überfällig
    const exact = mk(8, 125_000, 100_000);     // exakt fällig
    const unclear = mk(12, 120_000, null);     // Anker unbekannt
    const soon = mk(16, 122_700, 100_000);     // 2.300 Rest
    const ok = mk(1, 105_000, 100_000);
    const offline = mk(18, 130_000, 100_000, 'out_of_service');

    const sorted = [ok, soon, offline, unclear, exact, overdue]
      .sort(compareLanes)
      .map((o) => o.lane.laneNumber);

    expect(sorted).toEqual([3, 8, 12, 16, 1, 18]);
  });

  it('sortiert mehrere überfällige Bahnen nach Ausmaß', () => {
    const mk = (n: number, current: number) =>
      computeLaneOverview(
        lane({ laneId: `l${n}`, laneNumber: n, currentFrames: current }),
        [T25], [anchor('t25', 100_000)], DEFAULT_SETTINGS, TODAY,
      );
    const sorted = [mk(2, 128_000), mk(5, 140_000), mk(9, 126_000)]
      .sort(compareLanes)
      .map((o) => o.lane.laneNumber);
    expect(sorted).toEqual([5, 2, 9]);
  });
});

describe('Zusammenfassung', () => {
  it('zählt jede Bahn genau einmal, nach ihrem dringendsten Zustand', () => {
    const mk = (n: number, current: number, a: number | null) =>
      computeLaneOverview(
        lane({ laneId: `l${n}`, laneNumber: n, currentFrames: current }),
        [T25, T50],
        [anchor('t25', a), anchor('t50', a)],
        DEFAULT_SETTINGS,
        TODAY,
      );
    const s = summarize([mk(1, 105_000, 100_000), mk(2, 130_000, 100_000), mk(3, 123_000, null)]);
    expect(s).toMatchObject({ total: 3, ok: 1, due: 1, unclear: 1, dueSoon: 0, outOfService: 0 });
  });
});
