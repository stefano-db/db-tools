import type { MaintenanceStatusKind } from '../core';

/**
 * Statusdarstellung der Wartung.
 *
 * Grundregel aus der Spezifikation: niemals allein über Farbe. Jeder Status
 * trägt zusätzlich ein eigenes Symbol und einen Text, damit er auch bei
 * Farbsehschwäche, grellem Hallenlicht oder auf einem Ausdruck eindeutig bleibt.
 *
 * Auf dunklem Grund brauchen die Farben mehr Leuchtkraft als auf hellem —
 * gedeckte Töne verschwinden sonst im Untergrund.
 */

export const STATUS_STYLE: Record<
  MaintenanceStatusKind,
  { symbol: string; text: string; chip: string; dot: string; border: string }
> = {
  ok: {
    symbol: '●',
    text: 'text-db-ok',
    chip: 'bg-db-ok/15 text-db-ok ring-db-ok/40',
    dot: 'text-db-ok',
    border: 'border-l-db-ok',
  },
  due_soon: {
    symbol: '▲',
    text: 'text-db-warn',
    chip: 'bg-db-warn/15 text-db-warn ring-db-warn/40',
    dot: 'text-db-warn',
    border: 'border-l-db-warn',
  },
  due: {
    symbol: '■',
    text: 'text-db-bad',
    chip: 'bg-db-bad/15 text-db-bad ring-db-bad/50',
    dot: 'text-db-bad',
    border: 'border-l-db-bad',
  },
  unknown: {
    symbol: '?',
    text: 'text-db-text2',
    chip: 'bg-db-card2 text-db-text2 ring-db-line',
    dot: 'text-db-text3',
    border: 'border-l-db-text3',
  },
  no_data: {
    symbol: '–',
    text: 'text-db-text2',
    chip: 'bg-db-card2 text-db-text2 ring-db-line',
    dot: 'text-db-text3',
    border: 'border-l-db-text3',
  },
};

export function StatusChip({
  kind,
  label,
  className = '',
}: {
  kind: MaintenanceStatusKind;
  label: string;
  className?: string;
}) {
  const s = STATUS_STYLE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold ring-1 ring-inset ${s.chip} ${className}`}
    >
      <span aria-hidden="true">{s.symbol}</span>
      {label}
    </span>
  );
}

export function StatusDot({ kind }: { kind: MaintenanceStatusKind }) {
  return (
    <span className={`${STATUS_STYLE[kind].dot} text-xs`} aria-hidden="true">
      {STATUS_STYLE[kind].symbol}
    </span>
  );
}
