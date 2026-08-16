import type { MaintenanceStatusKind } from '../core';

/**
 * Statusdarstellung.
 *
 * Grundregel aus der Spezifikation: niemals allein über Farbe. Jeder Status
 * trägt zusätzlich ein eigenes Symbol und einen Text, damit er auch bei
 * Farbsehschwäche, grellem Hallenlicht oder auf einem Ausdruck eindeutig bleibt.
 */

export const STATUS_STYLE: Record<
  MaintenanceStatusKind,
  { symbol: string; text: string; chip: string; dot: string; border: string }
> = {
  ok: {
    symbol: '●',
    text: 'text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: 'text-emerald-600',
    border: 'border-l-emerald-500',
  },
  due_soon: {
    symbol: '▲',
    text: 'text-amber-700',
    chip: 'bg-amber-50 text-amber-900 ring-amber-300',
    dot: 'text-amber-600',
    border: 'border-l-amber-500',
  },
  due: {
    symbol: '■',
    text: 'text-red-700',
    chip: 'bg-red-50 text-red-800 ring-red-300',
    dot: 'text-red-600',
    border: 'border-l-red-600',
  },
  unknown: {
    symbol: '?',
    text: 'text-slate-600',
    chip: 'bg-slate-100 text-slate-700 ring-slate-300',
    dot: 'text-slate-500',
    border: 'border-l-slate-400',
  },
  no_data: {
    symbol: '–',
    text: 'text-slate-600',
    chip: 'bg-slate-100 text-slate-700 ring-slate-300',
    dot: 'text-slate-500',
    border: 'border-l-slate-400',
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
