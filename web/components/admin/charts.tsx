"use client";

import { useEffect, useRef, useState } from "react";

import { formatDay, formatPercent, type DashboardDay } from "@shared/lib/adminDashboard";
import { barPath, niceTicks } from "@shared/lib/adminDashboardView";

import { cn } from "@/lib/cn";

/** The same quiet line as ui.tsx's EmptyLine (kept here so the two files don't import each other). */
function EmptyLine({ children }: { children: string }) {
  return <p className="py-3 text-sm text-muted">{children}</p>;
}

/*
 * The admin charts, drawn as plain SVG in the theme's colours: one colour for every mark (primary), red only for
 * failures. Time runs left to right in every language, so the charts are left-to-right on their own.
 */

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
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
  key: keyof Omit<DashboardDay, "day">;
  label: string;
  format: (value: number) => string;
  tone?: "bad";
};

/** One bar per day, with the exact number on hover and a table for screen readers. */
export function DailyBars({ days, metric, height = 230 }: { days: DashboardDay[]; metric: DayMetric; height?: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map((d) => Number(d[metric.key]) || 0);
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1] || 1;
  const axis = 48;
  const bottom = 26;
  const innerW = Math.max(0, width - axis);
  const innerH = height - bottom - 8;
  const band = days.length ? innerW / days.length : 0;
  const gap = Math.max(2, band * 0.22);
  const barW = Math.max(1, band - gap);
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(innerW / 70))));
  const markClass = metric.tone === "bad" ? "fill-danger" : "fill-primary";
  const total = values.reduce((sum, v) => sum + v, 0);

  return (
    <div dir="ltr" className="relative" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`${metric.label} per day, ${metric.format(total)} in total`}>
          {ticks.map((t) => {
            const y = 8 + innerH - (t / top) * innerH;
            return (
              <g key={t}>
                <line x1={axis} x2={width} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
                <text x={axis - 8} y={y + 4} textAnchor="end" className="fill-muted text-[11px]">
                  {metric.format(t)}
                </text>
              </g>
            );
          })}
          {days.map((d, i) => {
            const v = values[i];
            const h = (v / top) * innerH;
            const x = axis + i * band + gap / 2;
            const y = 8 + innerH - h;
            return (
              <g key={d.day}>
                {v > 0 ? (
                  <path d={barPath(x, y, barW, h)} className={markClass} opacity={hover === null || hover === i ? 1 : 0.45} />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[11px]">
                    {formatDay(d.day)}
                  </text>
                ) : null}
                <rect
                  x={axis + i * band}
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
          aria-hidden
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center rounded-xl bg-text px-2.5 py-1.5 text-xs text-surface shadow-soft"
          style={{
            insetInlineStart: axis + hover * band + band / 2,
            top: 8 + innerH - (values[hover] / top) * innerH - 8,
          }}
        >
          <span>{formatDay(days[hover].day)}</span>
          <strong className="text-sm">{metric.format(values[hover])}</strong>
          <span>{metric.label}</span>
        </div>
      ) : null}
      <table className="sr-only">
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

/** A small trend line for a headline number. */
export function Sparkline({ values, tone }: { values: number[]; tone?: "bad" }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0) || 1;
  const w = 100;
  const h = 32;
  const points = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)]);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const colour = tone === "bad" ? "danger" : "primary";
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} className={colour === "danger" ? "fill-danger" : "fill-primary"} opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        className={colour === "danger" ? "stroke-danger" : "stroke-primary"}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type RankItem = { label: string; value: number; sub?: string };

/** A ranked list with a bar for each value; anything past `limit` is summed into one "N more" row. */
export function RankBars({
  items,
  format,
  tone,
  empty = "Nothing yet.",
  limit = 8,
}: {
  items: RankItem[];
  format: (value: number) => string;
  tone?: "bad";
  empty?: string;
  limit?: number;
}) {
  if (items.length === 0) return empty ? <EmptyLine>{empty}</EmptyLine> : null;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const rows = rest.length ? [...shown, { label: `${rest.length} more`, value: rest.reduce((s, r) => s + r.value, 0) }] : shown;
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((item) => (
        <li key={item.label} title={`${item.label}: ${format(item.value)}`} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-text">{item.label}</span>
            <span className="shrink-0 text-end font-semibold text-text tabular-nums">
              {format(item.value)}
              {"sub" in item && item.sub ? <span className="ms-2 text-xs font-normal text-muted">{item.sub}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-element">
            <div
              className={cn("h-full rounded-full", tone === "bad" ? "bg-danger" : "bg-primary")}
              style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** How far a group got, step by step, as a share of the first step. */
export function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const base = steps[0]?.count ?? 0;
  if (!base) return <EmptyLine>No new sign-ups in this period.</EmptyLine>;
  return (
    <ul className="flex flex-col gap-3">
      {steps.map((step) => (
        <li key={step.label} title={`${step.label}: ${step.count}`} className="grid grid-cols-[9.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
          <span className="text-text">{step.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-element">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(step.count / base) * 100}%` }} />
          </div>
          <span className="text-end tabular-nums">
            <b className="text-text">{step.count}</b> <span className="text-xs text-muted">{formatPercent(step.count, base)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A share of the whole as a short bar and its percentage. */
export function ShareBar({ share }: { share: number }) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span className="flex items-center gap-2" aria-label={`${Math.round(pct)}%`}>
      <span className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-primary-soft">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-end text-xs text-muted tabular-nums">{Math.round(pct)}%</span>
    </span>
  );
}
