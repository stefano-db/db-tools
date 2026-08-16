import { addDays, daysBetween } from './dates';
import { formatFrames } from './frames';
import type {
  ISODate,
  LaneOverview,
  LaneReadingState,
  MaintenanceAnchor,
  MaintenanceSettings,
  MaintenanceStatus,
  MaintenanceStatusKind,
  MaintenanceType,
  DueReason,
} from './types';

/**
 * Kern der Wartungsberechnung.
 *
 * Grundregel:
 *     framesSeitWartung  = aktuellerStand − standBeiLetzterWartung
 *     fällig             = framesSeitWartung >= Intervall
 *
 * Gerechnet wird ausschließlich mit kumulativen Frames (siehe frames.ts), damit
 * ein zurückgesetzter Zähler die Rechnung nicht verfälscht. Jeder Wartungstyp
 * hat seinen eigenen Anker und wird völlig unabhängig von den anderen bewertet.
 */

const SEVERITY: Record<MaintenanceStatusKind, number> = {
  ok: 1,
  due_soon: 2,
  no_data: 3,
  unknown: 3,
  due: 4,
};

export function computeMaintenanceStatus(
  lane: LaneReadingState,
  type: MaintenanceType,
  anchor: MaintenanceAnchor | undefined,
  settings: MaintenanceSettings,
  today: ISODate,
): MaintenanceStatus {
  const base = {
    maintenanceTypeId: type.id,
    code: type.code,
    nameDe: type.nameDe,
    intervalFrames: type.intervalFrames,
    framesSince: null,
    framesRemaining: null,
    overdueFrames: 0,
    daysSince: null,
    daysRemaining: null,
    nextDueAtFrames: null,
    estimatedDueDate: null,
    weeksUntilDue: null,
    reason: null,
  } satisfies Omit<MaintenanceStatus, 'kind' | 'label' | 'detail'>;

  // Ohne Ablesung lässt sich nichts berechnen.
  if (lane.currentFrames === null) {
    return {
      ...base,
      kind: 'no_data',
      label: 'Keine Ablesung',
      detail: 'Noch keine Frame-Eingabe für diese Bahn',
    };
  }

  // Unbekannter Wartungsstand wird NIEMALS als 0 interpretiert. Sonst wäre jede
  // Bahn beim Start sofort „überfällig" und die Anzeige wertlos.
  if (!anchor || anchor.anchorFrames === null) {
    return {
      ...base,
      kind: 'unknown',
      label: 'Unbekannt',
      detail: 'Wartungsstand unbekannt — bitte manuell prüfen',
    };
  }

  const framesSince = lane.currentFrames - anchor.anchorFrames;
  const framesRemaining = type.intervalFrames - framesSince;
  const overdueFrames = Math.max(0, framesSince - type.intervalFrames);
  const nextDueAtFrames = anchor.anchorFrames + type.intervalFrames;

  const daysSince = anchor.anchorDate ? daysBetween(anchor.anchorDate, today) : null;
  const daysRemaining =
    type.maxIntervalDays !== null && daysSince !== null
      ? type.maxIntervalDays - daysSince
      : null;

  const dueByFrames = framesSince >= type.intervalFrames;
  const dueByTime = daysRemaining !== null && daysRemaining <= 0;

  // Prognose aus der gemessenen Wochenrate. Bezugspunkt ist der Tag der letzten
  // Ablesung, denn auf ihn bezieht sich der aktuelle Frame-Stand.
  const rate = lane.framesPerWeek !== null && lane.framesPerWeek > 0 ? lane.framesPerWeek : null;
  const weeksUntilDue = rate !== null && framesRemaining > 0 ? framesRemaining / rate : null;
  const estimatedDueDate =
    weeksUntilDue !== null && lane.lastReadingDate !== null
      ? addDays(lane.lastReadingDate, Math.ceil(weeksUntilDue * 7))
      : null;

  const common = {
    ...base,
    framesSince,
    framesRemaining,
    overdueFrames,
    daysSince,
    daysRemaining,
    nextDueAtFrames,
    estimatedDueDate,
    weeksUntilDue,
  };

  if (dueByFrames || dueByTime) {
    const reason: DueReason = dueByFrames && dueByTime ? 'both' : dueByFrames ? 'frames' : 'time';
    return {
      ...common,
      kind: 'due',
      reason,
      label: 'Fällig',
      detail: dueDetail(reason, overdueFrames, daysRemaining, settings),
    };
  }

  // Vorwarnung: bevorzugt zeitlich („wird vor der übernächsten Ablesung fällig"),
  // ersatzweise über den Prozentanteil des Intervalls. Rein prozentual wäre die
  // 500k-Wartung sonst über ein Jahr lang dauerhaft gelb — und damit wirkungslos.
  const soonByFrames =
    weeksUntilDue !== null
      ? weeksUntilDue <= settings.warningWeeks
      : framesRemaining <= type.intervalFrames * settings.warningPercent;
  const soonByTime = daysRemaining !== null && daysRemaining <= settings.warningWeeks * 7;

  if (soonByFrames || soonByTime) {
    const reason: DueReason = soonByFrames && soonByTime ? 'both' : soonByFrames ? 'frames' : 'time';
    return {
      ...common,
      kind: 'due_soon',
      reason,
      label: 'Bald fällig',
      detail: soonDetail(reason, framesRemaining, weeksUntilDue, daysRemaining, settings),
    };
  }

  return {
    ...common,
    kind: 'ok',
    reason: null,
    label: 'OK',
    detail: `Noch ${formatFrames(framesRemaining)} ${settings.counterUnitLabel}`,
  };
}

function dueDetail(
  reason: DueReason,
  overdueFrames: number,
  daysRemaining: number | null,
  settings: MaintenanceSettings,
): string {
  if (reason === 'time') {
    return `Zeitintervall überschritten (${Math.abs(daysRemaining ?? 0)} Tage)`;
  }
  const framesPart =
    overdueFrames > 0
      ? `${formatFrames(overdueFrames)} ${settings.counterUnitLabel} überfällig`
      : 'Intervall erreicht';
  if (reason === 'both') {
    return `${framesPart}, Zeitintervall ebenfalls überschritten`;
  }
  return framesPart;
}

function soonDetail(
  reason: DueReason,
  framesRemaining: number,
  weeksUntilDue: number | null,
  daysRemaining: number | null,
  settings: MaintenanceSettings,
): string {
  if (reason === 'time') {
    return `Zeitintervall in ${daysRemaining} Tagen erreicht`;
  }
  const parts = [`Noch ${formatFrames(framesRemaining)} ${settings.counterUnitLabel}`];
  if (weeksUntilDue !== null) parts.push(formatWeeks(weeksUntilDue));
  if (reason === 'both' && daysRemaining !== null) parts.push(`Zeitintervall in ${daysRemaining} Tagen`);
  return parts.join(' · ');
}

export function formatWeeks(weeks: number): string {
  if (weeks < 1) return 'voraussichtlich diese Woche';
  const rounded = Math.round(weeks);
  return rounded === 1 ? 'ca. 1 Woche' : `ca. ${rounded} Wochen`;
}

/** Bewertet eine Bahn über alle Wartungstypen hinweg. */
export function computeLaneOverview(
  lane: LaneReadingState,
  types: MaintenanceType[],
  anchors: MaintenanceAnchor[],
  settings: MaintenanceSettings,
  today: ISODate,
): LaneOverview {
  const byType = new Map(anchors.map((a) => [a.maintenanceTypeId, a]));
  const statuses = [...types]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => computeMaintenanceStatus(lane, t, byType.get(t.id), settings, today));

  const worst = statuses.reduce<MaintenanceStatusKind>(
    (acc, s) => (SEVERITY[s.kind] > SEVERITY[acc] ? s.kind : acc),
    'ok',
  );

  const remainings = statuses
    .filter((s) => s.kind === 'ok' || s.kind === 'due_soon')
    .map((s) => s.framesRemaining as number);

  return {
    lane,
    statuses,
    worst,
    dueCount: statuses.filter((s) => s.kind === 'due').length,
    dueSoonCount: statuses.filter((s) => s.kind === 'due_soon').length,
    unknownCount: statuses.filter((s) => s.kind === 'unknown').length,
    maxOverdueFrames: statuses.reduce((m, s) => Math.max(m, s.overdueFrames), 0),
    minFramesRemaining: remainings.length ? Math.min(...remainings) : null,
  };
}

/**
 * Sortierung des Dashboards:
 *   1. überfällige Wartungen (am stärksten überfällig zuerst)
 *   2. exakt fällige Wartungen
 *   3. ungeklärte Bahnen (unbekannter Anker oder gar keine Ablesung)
 *   4. bald fällige Wartungen (knappste zuerst)
 *   5. alle übrigen Bahnen
 *   6. Bahnen außer Betrieb
 */
export function urgencyRank(o: LaneOverview): number {
  if (o.lane.status !== 'active') return 6;
  if (o.maxOverdueFrames > 0) return 0;
  if (o.dueCount > 0) return 1;
  if (o.unknownCount > 0 || o.worst === 'no_data') return 2;
  if (o.dueSoonCount > 0) return 3;
  return 4;
}

export function compareLanes(a: LaneOverview, b: LaneOverview): number {
  const rank = urgencyRank(a) - urgencyRank(b);
  if (rank !== 0) return rank;

  if (a.maxOverdueFrames !== b.maxOverdueFrames) {
    return b.maxOverdueFrames - a.maxOverdueFrames;
  }
  const ar = a.minFramesRemaining ?? Number.POSITIVE_INFINITY;
  const br = b.minFramesRemaining ?? Number.POSITIVE_INFINITY;
  if (ar !== br) return ar - br;

  return a.lane.laneNumber - b.lane.laneNumber;
}

export interface DashboardSummary {
  total: number;
  ok: number;
  dueSoon: number;
  due: number;
  unclear: number;
  outOfService: number;
}

export function summarize(overviews: LaneOverview[]): DashboardSummary {
  const summary: DashboardSummary = {
    total: overviews.length,
    ok: 0,
    dueSoon: 0,
    due: 0,
    unclear: 0,
    outOfService: 0,
  };
  for (const o of overviews) {
    if (o.lane.status !== 'active') summary.outOfService += 1;
    else if (o.dueCount > 0) summary.due += 1;
    else if (o.unknownCount > 0 || o.worst === 'no_data') summary.unclear += 1;
    else if (o.dueSoonCount > 0) summary.dueSoon += 1;
    else summary.ok += 1;
  }
  return summary;
}

/**
 * Wartungstypen, die beim Abschluss eines größeren Intervalls mit erledigt werden.
 * Der Mechaniker steht ohnehin an der Maschine; ohne Kaskade meldet das System
 * zwei Wochen später erneut die 25k-Wartung und verliert seine Glaubwürdigkeit.
 * Die Auswahl ist in der Oberfläche als Ganzes und je Aufgabe abwählbar.
 */
export function cascadeTargets(type: MaintenanceType, all: MaintenanceType[]): MaintenanceType[] {
  if (!type.cascadesToSmaller) return [];
  return all
    .filter((t) => t.id !== type.id && t.intervalFrames < type.intervalFrames)
    .sort((a, b) => b.intervalFrames - a.intervalFrames);
}

/**
 * Anker nach Abschluss einer Wartung. Gilt auch, wenn vorzeitig gewartet wurde:
 * der aktuelle Stand wird zum neuen Ausgangspunkt.
 */
export function anchorAfterCompletion(
  completedAtFrames: number,
  performedOn: ISODate,
  type: MaintenanceType,
): { anchor: MaintenanceAnchor; nextDueAtFrames: number } {
  return {
    anchor: {
      maintenanceTypeId: type.id,
      anchorFrames: completedAtFrames,
      anchorDate: performedOn,
    },
    nextDueAtFrames: completedAtFrames + type.intervalFrames,
  };
}

/** Alter der letzten Ablesung in Tagen — Grundlage für den Hinweis „Ablesung überfällig". */
export function readingAgeDays(lane: LaneReadingState, today: ISODate): number | null {
  return lane.lastReadingDate ? daysBetween(lane.lastReadingDate, today) : null;
}
