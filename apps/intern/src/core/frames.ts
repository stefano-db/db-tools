import type { ISODate } from './types';

/**
 * Zähler-Epoche einer Bahn.
 *
 * Ein Maschinenzähler kann zurückgesetzt oder ausgetauscht werden. Damit die
 * Wartungshistorie das überlebt, wird intern ausschließlich mit kumulativen
 * Frames gerechnet:
 *
 *     kumulativ = cumulativeOffset + (abgelesen - counterStart)
 *
 * Der Austauschzähler startet dabei nicht zwingend bei 0 — deshalb ist
 * counterStart ein eigenes Feld und keine Annahme.
 */
export interface CounterEpoch {
  id: string;
  laneId: string;
  effectiveFrom: ISODate;
  counterStart: number;
  cumulativeOffset: number;
  reason:
    | 'initial'
    | 'counter_reset'
    | 'counter_replaced'
    | 'pinsetter_replaced'
    | 'correction';
}

export function toCumulative(rawValue: number, epoch: CounterEpoch): number {
  if (rawValue < epoch.counterStart) {
    throw new Error(
      `Abgelesener Wert ${rawValue} liegt unter dem Startwert der Zähler-Epoche (${epoch.counterStart}).`,
    );
  }
  return epoch.cumulativeOffset + (rawValue - epoch.counterStart);
}

export function toRawValue(cumulativeFrames: number, epoch: CounterEpoch): number {
  return epoch.counterStart + (cumulativeFrames - epoch.cumulativeOffset);
}

/**
 * Baut die neue Epoche nach einem Zählerwechsel.
 *
 * lastCumulativeFrames ist der letzte gültige kumulative Stand der Bahn; er wird
 * zum Offset, damit die Zeitachse lückenlos weiterläuft. newCounterValue ist der
 * Wert, den der neue oder zurückgesetzte Zähler jetzt anzeigt.
 */
export function buildResetEpoch(params: {
  id: string;
  laneId: string;
  effectiveFrom: ISODate;
  lastCumulativeFrames: number;
  newCounterValue: number;
  reason: CounterEpoch['reason'];
}): CounterEpoch {
  if (params.newCounterValue < 0) {
    throw new Error('Der neue Zählerstand darf nicht negativ sein.');
  }
  return {
    id: params.id,
    laneId: params.laneId,
    effectiveFrom: params.effectiveFrom,
    counterStart: params.newCounterValue,
    cumulativeOffset: params.lastCumulativeFrames,
    reason: params.reason,
  };
}

export function formatFrames(value: number): string {
  return new Intl.NumberFormat('de-DE').format(Math.round(value));
}
