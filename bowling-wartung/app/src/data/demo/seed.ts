import { addDays, type CounterEpoch, type ISODate, type MaintenanceTask, type MaintenanceType } from '../../core';

/**
 * Startdatenbestand für den Demo-Betrieb.
 *
 * Die Werte sind so gewählt, dass alle Zustände einmal vorkommen: überfällig,
 * exakt fällig, bald fällig, unbekannter Anker, ein zurückgesetzter Zähler und
 * eine Bahn in Renovierung. So lässt sich die Oberfläche ohne Serveranbindung
 * beurteilen, bevor echte Zählerstände eingetragen werden.
 */

export interface DemoLane {
  id: string;
  laneNumber: number;
  pairId: string;
  status: 'active' | 'out_of_service' | 'renovation';
}

export interface DemoReading {
  id: string;
  laneId: string;
  epochId: string;
  readingDate: ISODate;
  rawValue: number;
  cumulativeFrames: number;
  supersededById: string | null;
  correctionReason: string | null;
}

export interface DemoRecord {
  id: string;
  laneId: string;
  maintenanceTypeId: string;
  performedOn: ISODate;
  cumulativeFrames: number;
  employeeName: string;
  notes: string | null;
  source: 'manual' | 'cascade' | 'initial_import';
  derivedFromRecordId: string | null;
  hasDeviation: boolean;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface DemoIssue {
  id: string;
  laneId: string | null;
  title: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved';
  reportedBy: string;
  reportedAt: string;
  resolutionNote: string | null;
}

export interface DemoDb {
  version: number;
  pairs: { id: string; label: string; sortOrder: number }[];
  lanes: DemoLane[];
  types: MaintenanceType[];
  tasks: MaintenanceTask[];
  epochs: CounterEpoch[];
  readings: DemoReading[];
  records: DemoRecord[];
  recordTasks: { recordId: string; taskId: string; result: 'done' | 'not_applicable' | 'open'; taskTitleSnapshot: string }[];
  issues: DemoIssue[];
  settings: {
    warningWeeks: number;
    warningPercent: number;
    plausibilityFactor: number;
    plausibilityAbsMax: number;
    counterUnitLabel: string;
  };
}

export const TYPES: MaintenanceType[] = [
  { id: 't25', code: '25k', nameDe: 'Wartung alle 25.000 Frames', intervalFrames: 25_000, maxIntervalDays: 180, cascadesToSmaller: false, sortOrder: 1 },
  { id: 't50', code: '50k', nameDe: 'Wartung alle 50.000 Frames', intervalFrames: 50_000, maxIntervalDays: 365, cascadesToSmaller: true, sortOrder: 2 },
  { id: 't100', code: '100k', nameDe: 'Wartung alle 100.000 Frames', intervalFrames: 100_000, maxIntervalDays: 730, cascadesToSmaller: true, sortOrder: 3 },
  { id: 't500', code: '500k', nameDe: 'Wartung alle 500.000 Frames', intervalFrames: 500_000, maxIntervalDays: null, cascadesToSmaller: true, sortOrder: 4 },
];

export const TASKS: MaintenanceTask[] = [
  { id: 'k1', maintenanceTypeId: 't25', code: 'pins_strings', titleDe: 'Pins und Pin-Schnüre auf Verschleiß oder Beschädigungen prüfen', scope: 'lane', sortOrder: 1 },

  { id: 'k2', maintenanceTypeId: 't50', code: 'string_tension', titleDe: 'Spannung der Pin-Schnüre prüfen und bei Bedarf einstellen', scope: 'lane', sortOrder: 1 },
  { id: 'k3', maintenanceTypeId: 't50', code: 'elevator_belt', titleDe: 'Antriebsriemen des Ball Elevators prüfen', scope: 'lane_pair', sortOrder: 2 },

  { id: 'k4', maintenanceTypeId: 't100', code: 'wagon_chain', titleDe: 'String-Wagon-Kette und Kettenführungen auf Verschleiß prüfen', scope: 'lane', sortOrder: 1 },
  { id: 'k5', maintenanceTypeId: 't100', code: 'wagon_chain_lube', titleDe: 'String-Wagon-Kette und Pivot Link schmieren', scope: 'lane', sortOrder: 2 },
  { id: 'k6', maintenanceTypeId: 't100', code: 'cones_rollers', titleDe: 'Centering Cones und String Rollers auf Verschleiß prüfen', scope: 'lane', sortOrder: 3 },
  { id: 'k7', maintenanceTypeId: 't100', code: 'wagon_motor_belt', titleDe: 'Motorriemen des String Wagons auf Beschädigung oder Verschleiß prüfen', scope: 'lane', sortOrder: 4 },
  { id: 'k8', maintenanceTypeId: 't100', code: 'gate_string', titleDe: 'Gate String auf Verschleiß prüfen', scope: 'lane', sortOrder: 5 },

  { id: 'k9', maintenanceTypeId: 't500', code: 'cushion_board', titleDe: 'Ball Cushion Board und Impact Strips auf Schäden prüfen', scope: 'lane', sortOrder: 1 },
  { id: 'k10', maintenanceTypeId: 't500', code: 'pit_side_frames', titleDe: 'Pit Side Frames und Boards auf Schäden prüfen', scope: 'lane', sortOrder: 2 },
  { id: 'k11', maintenanceTypeId: 't500', code: 'pin_curtain', titleDe: 'Pin Curtain auf Verschleiß prüfen', scope: 'lane', sortOrder: 3 },
  { id: 'k12', maintenanceTypeId: 't500', code: 'return_rail_covers', titleDe: 'Ball Return Rail Covers auf Verschleiß prüfen', scope: 'lane_pair', sortOrder: 4 },
  { id: 'k13', maintenanceTypeId: 't500', code: 'dust_pan', titleDe: 'Pinsetter Dust Pan reinigen', scope: 'lane', sortOrder: 5 },
];

/** Gewünschter Zustand je Bahn, ausgedrückt in „Frames seit der letzten Wartung". */
interface LaneSpec {
  n: number;
  start: number;
  rate: number;
  since: { t25: number | null; t50: number | null; t100: number | null; t500: number | null };
  status?: DemoLane['status'];
  resetAfterWeek?: number;
}

const SPECS: LaneSpec[] = [
  { n: 1, start: 62_000, rate: 2_100, since: { t25: 15_700, t50: 31_200, t100: 45_200, t500: 289_600 } },
  { n: 2, start: 51_000, rate: 1_850, since: { t25: 8_400, t50: 44_100, t100: 62_000, t500: 210_000 } },
  { n: 3, start: 74_000, rate: 2_400, since: { t25: 26_900, t50: 38_000, t100: 71_000, t500: 331_000 } },
  { n: 4, start: 106_000, rate: 2_250, since: { t25: 3_100, t50: 21_400, t100: 26_100, t500: 126_100 } },
  { n: 5, start: 88_000, rate: 1_950, since: { t25: 11_200, t50: 26_800, t100: 51_300, t500: null } },
  { n: 6, start: 45_000, rate: 1_600, since: { t25: 6_900, t50: 19_400, t100: 34_800, t500: 148_000 } },
  { n: 7, start: 84_000, rate: 2_300, since: { t25: 27_450, t50: 31_700, t100: 100_000, t500: 405_000 } },
  { n: 8, start: 97_000, rate: 2_050, since: { t25: 12_800, t50: 51_900, t100: 78_400, t500: 268_000 } },
  { n: 9, start: 58_000, rate: 1_700, since: { t25: 17_300, t50: 22_100, t100: 40_600, t500: 191_000 } },
  { n: 10, start: 66_000, rate: 1_900, since: { t25: 4_200, t50: 12_600, t100: 55_900, t500: 233_000 } },
  { n: 11, start: 112_000, rate: 2_600, since: { t25: 19_100, t50: 33_500, t100: 61_700, t500: 318_000 }, resetAfterWeek: 5 },
  { n: 12, start: 93_000, rate: 2_150, since: { t25: 9_600, t50: 28_300, t100: 104_200, t500: 372_000 } },
  { n: 13, start: 39_000, rate: 1_450, since: { t25: 13_400, t50: 24_900, t100: 29_100, t500: 118_000 } },
  { n: 14, start: 71_000, rate: 1_800, since: { t25: 5_500, t50: 41_200, t100: 66_300, t500: 254_000 } },
  { n: 15, start: 83_000, rate: 2_000, since: { t25: 20_800, t50: 35_600, t100: 47_500, t500: 296_000 } },
  { n: 16, start: 90_000, rate: 2_200, since: { t25: 22_700, t50: 18_900, t100: 73_100, t500: 341_000 } },
  // Kaum bespielte Bahn: die Frames laufen nicht voll, das Kalenderintervall schon.
  { n: 17, start: 34_000, rate: 260, since: { t25: 7_500, t50: 9_100, t100: 14_200, t500: 61_000 } },
  { n: 18, start: 55_000, rate: 0, since: { t25: 8_000, t50: 16_000, t100: 32_000, t500: 160_000 }, status: 'renovation' },
];

const WEEKS = 10;

function mostRecentMonday(today: Date): ISODate {
  const iso = today.toISOString().slice(0, 10);
  const dow = (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // Montag = 0
  return addDays(iso, -dow);
}

export function buildDemoDb(today = new Date()): DemoDb {
  const lastMonday = mostRecentMonday(today);
  const dates: ISODate[] = Array.from({ length: WEEKS }, (_, i) => addDays(lastMonday, -(WEEKS - 1 - i) * 7));

  const pairs = Array.from({ length: 9 }, (_, i) => ({
    id: `p${i + 1}`,
    label: `Bahn ${i * 2 + 1}-${i * 2 + 2}`,
    sortOrder: i + 1,
  }));

  const lanes: DemoLane[] = SPECS.map((s) => ({
    id: `lane-${s.n}`,
    laneNumber: s.n,
    pairId: `p${Math.ceil(s.n / 2)}`,
    status: s.status ?? 'active',
  }));

  const epochs: CounterEpoch[] = [];
  const readings: DemoReading[] = [];
  const records: DemoRecord[] = [];

  for (const spec of SPECS) {
    const laneId = `lane-${spec.n}`;
    let epoch: CounterEpoch = {
      id: `${laneId}-e1`,
      laneId,
      effectiveFrom: dates[0],
      counterStart: 0,
      cumulativeOffset: 0,
      reason: 'initial',
    };
    epochs.push(epoch);

    dates.forEach((date, i) => {
      const cumulative = spec.start + spec.rate * i;

      if (spec.resetAfterWeek === i) {
        epoch = {
          id: `${laneId}-e2`,
          laneId,
          effectiveFrom: date,
          counterStart: 0,
          cumulativeOffset: cumulative,
          reason: 'counter_replaced',
        };
        epochs.push(epoch);
      }

      readings.push({
        id: `${laneId}-r${i}`,
        laneId,
        epochId: epoch.id,
        readingDate: date,
        rawValue: epoch.counterStart + (cumulative - epoch.cumulativeOffset),
        cumulativeFrames: cumulative,
        supersededById: null,
        correctionReason: null,
      });
    });

    // Anker als Erstaufnahme. „since: null" bedeutet unbekannt — es entsteht
    // bewusst kein Eintrag, damit die Bahn als ungeklärt gemeldet wird.
    const current = spec.start + spec.rate * (WEEKS - 1);
    for (const type of TYPES) {
      const since = spec.since[type.id as keyof LaneSpec['since']];
      if (since === null) continue;
      const anchorFrames = Math.max(0, current - since);
      const weeksAgo = spec.rate > 0 ? Math.min(200, Math.round(since / spec.rate)) : 20;
      records.push({
        id: `${laneId}-${type.id}-init`,
        laneId,
        maintenanceTypeId: type.id,
        performedOn: addDays(dates[WEEKS - 1], -weeksAgo * 7),
        cumulativeFrames: anchorFrames,
        employeeName: 'Erstaufnahme',
        notes: null,
        source: 'initial_import',
        derivedFromRecordId: null,
        hasDeviation: false,
        voidedAt: null,
        voidReason: null,
      });
    }
  }

  const issues: DemoIssue[] = [
    {
      id: 'i1',
      laneId: 'lane-12',
      title: 'Ball Elevator macht Geräusche',
      description: 'Rhythmisches Klopfen, wird bei höherer Auslastung lauter.',
      severity: 'medium',
      status: 'open',
      reportedBy: 'Marco',
      reportedAt: addDays(lastMonday, -5) + 'T09:20:00Z',
      resolutionNote: null,
    },
    {
      id: 'i2',
      laneId: 'lane-3',
      title: 'String an Pin 7 ausgefranst',
      description: 'Nächste Wartung tauschen, Ersatz liegt im Lager.',
      severity: 'low',
      status: 'in_progress',
      reportedBy: 'Marco',
      reportedAt: addDays(lastMonday, -12) + 'T16:40:00Z',
      resolutionNote: null,
    },
  ];

  return {
    version: 1,
    pairs,
    lanes,
    types: TYPES,
    tasks: TASKS,
    epochs,
    readings,
    records,
    recordTasks: [],
    issues,
    settings: {
      warningWeeks: 3,
      warningPercent: 0.2,
      plausibilityFactor: 3,
      plausibilityAbsMax: 20_000,
      counterUnitLabel: 'Frames',
    },
  };
}
