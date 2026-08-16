/**
 * Domänentypen der Wartungsplanung.
 *
 * Dieses Verzeichnis ist bewusst frei von React, Supabase und jedem Framework.
 * Alle Funktionen sind rein: gleiche Eingabe, gleiche Ausgabe, keine Uhr, kein Netz.
 * Damit ist die Wartungslogik vollständig testbar — und später ohne Änderung in
 * ein anderes Modul der internen Plattform übernehmbar.
 */

/** ISO-Datum ohne Zeitanteil, z. B. '2026-08-14'. */
export type ISODate = string;

export type LaneStatus = 'active' | 'out_of_service' | 'renovation';

export type TaskResult = 'done' | 'not_applicable' | 'open';

export type TaskScope = 'lane' | 'lane_pair' | 'center';

export interface MaintenanceType {
  id: string;
  /** '25k', '50k', '100k', '500k' */
  code: string;
  nameDe: string;
  intervalFrames: number;
  /** Zusätzliches Kalenderintervall. Fällig ist, was zuerst eintritt. */
  maxIntervalDays: number | null;
  cascadesToSmaller: boolean;
  sortOrder: number;
}

export interface MaintenanceTask {
  id: string;
  maintenanceTypeId: string;
  code: string;
  titleDe: string;
  scope: TaskScope;
  sortOrder: number;
}

/**
 * Letzter bekannter Wartungsstand einer Bahn für genau einen Wartungstyp.
 *
 * anchorFrames === null bedeutet UNBEKANNT und niemals 0. Ein unbekannter Anker
 * darf nie zu „fällig" führen, sondern muss als ungeklärt gemeldet werden.
 */
export interface MaintenanceAnchor {
  maintenanceTypeId: string;
  anchorFrames: number | null;
  anchorDate: ISODate | null;
}

export interface LaneReadingState {
  laneId: string;
  laneNumber: number;
  status: LaneStatus;
  /** Kumulativer Frame-Stand der letzten gültigen Ablesung. null = noch keine. */
  currentFrames: number | null;
  lastReadingDate: ISODate | null;
  /** Gleitender Mittelwert der letzten Ablesungen. null = noch keine Basis. */
  framesPerWeek: number | null;
  pairLabel?: string | null;
}

export interface MaintenanceSettings {
  /** Gelb, wenn die Wartung voraussichtlich innerhalb dieser Wochenzahl fällig wird. */
  warningWeeks: number;
  /** Ersatzregel, solange keine Wochenrate bekannt ist (Anteil des Intervalls). */
  warningPercent: number;
  plausibilityFactor: number;
  plausibilityAbsMax: number;
  counterUnitLabel: string;
}

export const DEFAULT_SETTINGS: MaintenanceSettings = {
  warningWeeks: 3,
  warningPercent: 0.2,
  plausibilityFactor: 3,
  plausibilityAbsMax: 20000,
  counterUnitLabel: 'Frames',
};

export type MaintenanceStatusKind =
  /** Für diese Bahn liegt noch keine Frame-Ablesung vor. */
  | 'no_data'
  /** Wartungsstand unbekannt — muss manuell geprüft werden. */
  | 'unknown'
  | 'ok'
  | 'due_soon'
  | 'due';

export type DueReason = 'frames' | 'time' | 'both';

export interface MaintenanceStatus {
  maintenanceTypeId: string;
  code: string;
  nameDe: string;
  intervalFrames: number;
  kind: MaintenanceStatusKind;
  /** Frames seit der letzten Durchführung. */
  framesSince: number | null;
  /** Verbleibende Frames bis zur Fälligkeit. Negativ bedeutet überfällig. */
  framesRemaining: number | null;
  /** 0, wenn nicht überfällig. */
  overdueFrames: number;
  daysSince: number | null;
  daysRemaining: number | null;
  /** Kumulativer Stand, bei dem die nächste Wartung fällig wird. */
  nextDueAtFrames: number | null;
  /** Prognose aus der Wochenrate. null, wenn nicht berechenbar oder bereits fällig. */
  estimatedDueDate: ISODate | null;
  weeksUntilDue: number | null;
  /** Warum fällig bzw. bald fällig: über Frames, über Zeit oder beides. */
  reason: DueReason | null;
  label: string;
  detail: string;
}

export interface LaneOverview {
  lane: LaneReadingState;
  statuses: MaintenanceStatus[];
  /** Dringlichster Status der Bahn. */
  worst: MaintenanceStatusKind;
  dueCount: number;
  dueSoonCount: number;
  unknownCount: number;
  maxOverdueFrames: number;
  /** Kleinster positiver Restwert über alle Intervalle, für die Feinsortierung. */
  minFramesRemaining: number | null;
}
