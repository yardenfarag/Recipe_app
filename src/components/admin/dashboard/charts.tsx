import { useEffect, useRef, useState } from 'react';

import { formatDay, formatPercent, type DashboardDay } from '@shared/lib/adminDashboard';
import { barPath, niceTicks } from '@shared/lib/adminDashboardView';

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type DayMetric = {
  key: keyof Omit<DashboardDay, 'day'>;
  label: string;
  format: (value: number) => string;
  tone?: 'bad';
};

export function DailyBars({ days, metric, height = 230 }: { days: DashboardDay[]; metric: DayMetric; height?: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map((d) => Number(d[metric.key]) || 0);
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1] || 1;
  const left = 48;
  const bottom = 26;
  const innerW = Math.max(0, width - left);
  const innerH = height - bottom - 8;
  const band = days.length ? innerW / days.length : 0;
  const gap = Math.max(2, band * 0.22);
  const barW = Math.max(1, band - gap);
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(innerW / 70))));
  const fill = metric.tone === 'bad' ? 'var(--bad-mark)' : 'var(--mark)';
  const total = values.reduce((sum, v) => sum + v, 0);

  return (
    <div className="pd-chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`${metric.label} per day, ${metric.format(total)} in total`}>
          {ticks.map((t) => {
            const y = 8 + innerH - (t / top) * innerH;
            return (
              <g key={t}>
                <line x1={left} x2={width} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} />
                <text x={left - 8} y={y + 4} textAnchor="end" className="pd-axis">
                  {metric.format(t)}
                </text>
              </g>
            );
          })}
          {days.map((d, i) => {
            const v = values[i];
            const h = (v / top) * innerH;
            const x = left + i * band + gap / 2;
            const y = 8 + innerH - h;
            return (
              <g key={d.day}>
                {v > 0 ? (
                  <path
                    d={barPath(x, y, barW, h)}
                    fill={fill}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="pd-axis">
                    {formatDay(d.day)}
                  </text>
                ) : null}
                <rect
                  x={left + i * band}
                  y={0}
                  width={band}
                  height={height - bottom}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hover !== null && days[hover] ? (
        <div
          className="pd-tip"
          style={{
            left: left + hover * band + band / 2,
            top: 8 + innerH - (values[hover] / top) * innerH - 8,
          }}
        >
          <span>{formatDay(days[hover].day)}</span>
          <strong>{metric.format(values[hover])}</strong>
          <span>{metric.label}</span>
        </div>
      ) : null}
      <table className="pd-sr">
        <caption>{metric.label} per day</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{metric.format(values[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkline({ values, tone }: { values: number[]; tone?: 'bad' }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0) || 1;
  const w = 100;
  const h = 32;
  const points = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)]);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const stroke = tone === 'bad' ? 'var(--bad-mark)' : 'var(--mark)';
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={stroke} opacity={0.12} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export type RankItem = { label: string; value: number; sub?: string };

export function RankBars({
  items,
  format,
  tone,
  empty = 'Nothing yet.',
  limit = 8,
}: {
  items: RankItem[];
  format: (value: number) => string;
  tone?: 'bad';
  empty?: string;
  limit?: number;
}) {
  if (items.length === 0) return <div className="pd-empty">{empty}</div>;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const rows = rest.length
    ? [...shown, { label: `${rest.length} more`, value: rest.reduce((s, r) => s + r.value, 0) }]
    : shown;
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <div className="pd-rank">
      {rows.map((item) => (
        <div className="pd-rank-row" key={item.label} title={`${item.label}: ${format(item.value)}`}>
          <span className="pd-ellipsis">{item.label}</span>
          <span className="v">
            {format(item.value)}
            {item.sub ? <span className="s">{item.sub}</span> : null}
          </span>
          <div className="pd-rank-bar">
            <i data-tone={tone} style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const base = steps[0]?.count ?? 0;
  if (!base) return <div className="pd-empty">No new sign-ups in this period.</div>;
  return (
    <div className="pd-funnel">
      {steps.map((step) => (
        <div className="pd-funnel-row" key={step.label} title={`${step.label}: ${step.count}`}>
          <span>{step.label}</span>
          <div className="pd-funnel-track">
            <i style={{ width: `${(step.count / base) * 100}%` }} />
          </div>
          <span className="n">
            <b>{step.count}</b>
            <span>{formatPercent(step.count, base)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
