import type { MaintenanceStatusKind } from '../core';

/**
 * Statusdarstellung der Wartung.
 *
 * Grundregel aus der Spezifikation: niemals allein über Farbe. Jeder Status
 * trägt zusätzlich ein eigenes Symbol und einen Text, damit er auch bei
 * Farbsehschwäche, grellem Hallenlicht oder auf einem Ausdruck eindeutig bleibt.
 *
 * Die Wartung läuft auf hellem Grund — dort brauchen die Farben mehr Tiefe als
 * Leuchtkraft, sonst wirken sie blass.
 */

export const STATUS_STYLE: Record<
  MaintenanceStatusKind,
  { symbol: string; text: string; chip: string; dot: string; border: string; tile: string }
> = {
  ok: {
    symbol: '●',
    text: 'text-lw-ok',
    chip: 'bg-lw-ok/10 text-lw-ok ring-lw-ok/30',
    dot: 'text-lw-ok',
    border: 'border-l-lw-ok',
    tile: 'lw-tile lw-tile-ok',
  },
  due_soon: {
    symbol: '▲',
    text: 'text-lw-warn',
    chip: 'bg-lw-warn/10 text-lw-warn ring-lw-warn/35',
    dot: 'text-lw-warn',
    border: 'border-l-lw-warn',
    tile: 'lw-tile lw-tile-warn',
  },
  due: {
    symbol: '■',
    text: 'text-lw-bad',
    chip: 'bg-lw-bad/10 text-lw-bad ring-lw-bad/40',
    dot: 'text-lw-bad',
    border: 'border-l-lw-bad',
    tile: 'lw-tile lw-tile-bad',
  },
  unknown: {
    symbol: '?',
    text: 'text-lw-text2',
    chip: 'bg-lw-card2 text-lw-text2 ring-lw-line2',
    dot: 'text-lw-text3',
    border: 'border-l-lw-line2',
    tile: 'lw-tile',
  },
  no_data: {
    symbol: '–',
    text: 'text-lw-text2',
    chip: 'bg-lw-card2 text-lw-text2 ring-lw-line2',
    dot: 'text-lw-text3',
    border: 'border-l-lw-line2',
    tile: 'lw-tile',
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
