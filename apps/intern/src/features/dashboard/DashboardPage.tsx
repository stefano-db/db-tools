import { Link } from 'react-router-dom';
import {
  formatDateDe,
  formatFrames,
  readingAgeDays,
  urgencyRank,
  type LaneOverview,
} from '../../core';
import { useData } from '../../app/DataContext';
import { StatusChip, StatusDot, STATUS_STYLE } from '../../ui/status';

export function DashboardPage() {
  const { overviews, summary, snapshot, today, loading } = useData();

  if (loading && !snapshot) return <p className="text-slate-500">Wird geladen…</p>;
  if (!snapshot) return null;

  const openIssues = snapshot.issues.filter((i) => i.status !== 'resolved');
  const stale = overviews.filter((o) => {
    if (o.lane.status !== 'active') return false;
    const age = readingAgeDays(o.lane, today);
    return age === null || age > 8;
  });

  const actionable = overviews.filter((o) => urgencyRank(o) <= 3);
  const rest = overviews.filter((o) => urgencyRank(o) > 3);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="sr-only">Wartungsübersicht</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile value={summary.total} label="Bahnen" tone="neutral" />
          <Tile value={summary.due} label="Fällig" tone="due" />
          <Tile value={summary.dueSoon} label="Bald fällig" tone="due_soon" />
          <Tile value={summary.ok} label="OK" tone="ok" />
          <Tile value={summary.unclear + summary.outOfService} label="Ungeklärt / außer Betrieb" tone="unknown" />
        </div>
      </section>

      {(stale.length > 0 || openIssues.length > 0) && (
        <section className="space-y-2">
          {stale.length > 0 && (
            <Banner
              tone="amber"
              text={`${stale.length} ${stale.length === 1 ? 'Bahn hat' : 'Bahnen haben'} seit über einer Woche keine Ablesung`}
              action={{ to: '/wartung/eingabe', label: 'Frame-Stände eintragen' }}
            />
          )}
          {openIssues.length > 0 && (
            <Banner
              tone="slate"
              text={`${openIssues.length} offene ${openIssues.length === 1 ? 'Defektmeldung' : 'Defektmeldungen'}: ${openIssues
                .slice(0, 2)
                .map((i) => `Bahn ${i.laneNumber ?? '–'} – ${i.title}`)
                .join(' · ')}`}
            />
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Diese Woche relevant
        </h2>
        {actionable.length === 0 ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            ● Keine Wartung fällig oder in Vorbereitung.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {actionable.map((o) => (
              <LaneCard key={o.lane.laneId} overview={o} />
            ))}
          </div>
        )}
      </section>

      {rest.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Übrige Bahnen
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {rest.map((o) => (
              <CompactRow key={o.lane.laneId} overview={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'neutral' | 'ok' | 'due_soon' | 'due' | 'unknown';
}) {
  const accent =
    tone === 'due' ? 'text-red-700' :
    tone === 'due_soon' ? 'text-amber-700' :
    tone === 'ok' ? 'text-emerald-700' :
    'text-slate-700';
  const symbol = tone === 'neutral' ? '' : STATUS_STYLE[tone === 'unknown' ? 'unknown' : tone].symbol;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className={`tabular text-3xl font-bold ${accent}`}>
        {symbol && <span className="mr-1.5 align-middle text-lg">{symbol}</span>}
        {value}
      </div>
      <div className="mt-0.5 text-sm text-slate-600">{label}</div>
    </div>
  );
}

function Banner({
  tone,
  text,
  action,
}: {
  tone: 'amber' | 'slate';
  text: string;
  action?: { to: string; label: string };
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-slate-300 bg-slate-50 text-slate-800';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded border px-4 py-2.5 text-sm ${cls}`}>
      <span>{text}</span>
      {action && (
        <Link to={action.to} className="ml-auto font-semibold underline underline-offset-2">
          {action.label} →
        </Link>
      )}
    </div>
  );
}

function LaneCard({ overview }: { overview: LaneOverview }) {
  const { lane, statuses, worst, dueCount } = overview;
  const attention = statuses.filter((s) => s.kind === 'due' || s.kind === 'unknown' || s.kind === 'no_data');
  const calm = statuses.filter((s) => !attention.includes(s));

  const headline =
    dueCount > 0
      ? `${dueCount} ${dueCount === 1 ? 'Wartung' : 'Wartungen'} fällig`
      : worst === 'due_soon'
        ? 'Wartung in Vorbereitung'
        : 'Wartungsstand prüfen';

  return (
    <Link
      to={`/wartung/bahn/${lane.laneNumber}`}
      className={`block rounded-lg border border-l-4 border-slate-200 bg-white p-4 transition hover:border-slate-400 ${STATUS_STYLE[worst].border}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot kind={worst} />
            <span className="text-xl font-bold">Bahn {lane.laneNumber}</span>
            {lane.status !== 'active' && (
              <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {lane.status === 'renovation' ? 'Renovierung' : 'Außer Betrieb'}
              </span>
            )}
          </div>
          <div className={`mt-0.5 text-sm font-semibold ${STATUS_STYLE[worst].text}`}>{headline}</div>
        </div>
        <div className="text-right">
          <div className="tabular text-2xl font-bold text-slate-900">
            {lane.currentFrames === null ? '—' : formatFrames(lane.currentFrames)}
          </div>
          <div className="text-xs text-slate-500">
            {lane.lastReadingDate ? `abgelesen ${formatDateDe(lane.lastReadingDate)}` : 'keine Ablesung'}
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {attention.map((s) => (
          <li key={s.maintenanceTypeId} className="flex flex-wrap items-baseline gap-2 text-sm">
            <StatusChip kind={s.kind} label={s.code} />
            <span className={`font-medium ${STATUS_STYLE[s.kind].text}`}>{s.label}</span>
            <span className="text-slate-600">— {s.detail}</span>
          </li>
        ))}
        {calm.length > 0 && (
          <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-slate-500">
            {calm.map((s) => (
              <span key={s.maintenanceTypeId}>
                <StatusDot kind={s.kind} /> {s.code} — {s.detail}
              </span>
            ))}
          </li>
        )}
      </ul>
    </Link>
  );
}

function CompactRow({ overview }: { overview: LaneOverview }) {
  const { lane, statuses, worst } = overview;
  return (
    <Link
      to={`/wartung/bahn/${lane.laneNumber}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50"
    >
      <span className="flex w-24 items-center gap-2 font-semibold">
        <StatusDot kind={worst} />
        Bahn {lane.laneNumber}
      </span>
      <span className="tabular w-24 text-right text-slate-700">
        {lane.currentFrames === null ? '—' : formatFrames(lane.currentFrames)}
      </span>
      <span className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {statuses.map((s) => (
          <span key={s.maintenanceTypeId}>
            <StatusDot kind={s.kind} /> {s.code}
            {s.kind !== 'ok' && <> — {s.detail}</>}
          </span>
        ))}
      </span>
      {lane.status !== 'active' && (
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {lane.status === 'renovation' ? 'Renovierung' : 'Außer Betrieb'}
        </span>
      )}
    </Link>
  );
}
