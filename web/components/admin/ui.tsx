"use client";

import { useState, type ReactNode } from "react";

import { deltaOf } from "@shared/lib/adminDashboard";

import { Sparkline } from "@/components/admin/charts";
import { Button } from "@/components/ui/Button";
import { Tile, TileLabel } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";

/** A tile with an optional heading, a line under it, and actions at the end of the heading. */
export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Tile as="section" className={cn("min-w-0 p-5", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">{title}</h2>
            {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tile>
  );
}

/** A small heading inside a card. */
export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <TileLabel as="h3" className="mb-2">
      {children}
    </TileLabel>
  );
}

/** A quiet line when a list or chart has nothing in it. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted">{children}</p>;
}

/** An error inside a page that still shows the rest. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

/**
 * A headline number with its change from the previous period. `upIsGood` decides the colour: more sign-ups is
 * good, more failures is bad, and for cost neither (null).
 */
export function StatTile({
  label,
  value,
  current,
  previous,
  sub,
  spark,
  upIsGood = true,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  sub?: string;
  spark?: number[];
  upIsGood?: boolean | null;
}) {
  const delta = deltaOf(current, previous);
  const up = delta.direction === "up" || delta.direction === "new";
  const tone = delta.direction === "flat" || upIsGood === null ? "flat" : up === upIsGood ? "good" : "bad";
  const arrow = delta.direction === "flat" ? "" : up ? "↑" : "↓";
  return (
    <Tile size="md" role="group" aria-label={label} className="flex min-w-0 flex-col p-4">
      <div className="text-sm text-muted">{label}</div>
      <div data-stat-value className="mt-1 font-display text-2xl font-bold tracking-tight text-text tabular-nums">
        {value}
      </div>
      <div
        className={cn(
          "mt-1 text-xs font-semibold",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-muted",
        )}
      >
        {arrow ? <span aria-hidden>{arrow} </span> : null}
        {delta.text}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
      {spark ? (
        <div className="mt-auto pt-3">
          <Sparkline values={spark} tone={upIsGood === false ? "bad" : undefined} />
        </div>
      ) : null}
    </Tile>
  );
}

/** A plain figure: a label over a number, with an optional line under it. */
export function Figure({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-element px-3.5 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("text-text tabular-nums", strong ? "font-display text-xl font-bold" : "text-base font-semibold")}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

/** A label and its value on one line, for lists of facts (credit health, limits). */
export function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-b-0">
      <span className="min-w-0 text-muted">{label}</span>
      <span className={cn("shrink-0 font-semibold tabular-nums", tone === "bad" ? "text-danger" : "text-text")}>{value}</span>
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "good" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "good" ? "bg-success-soft text-success" : tone === "bad" ? "bg-danger-soft text-danger" : "bg-element text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** An initial and an email, with an optional line under it. */
export function PersonCell({ email, sub }: { email: string | null; sub?: ReactNode }) {
  const name = email ?? "No email";
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-start">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-text uppercase">
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-text">{name}</span>
        {sub ? <span className="block text-xs font-normal text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

/** A recipe photo, or a plain tile when there is none or it fails to load. */
export function Thumb({ src, className }: { src: string | null; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = cn("h-11 w-11 shrink-0 rounded-xl bg-element object-cover", className);
  if (!src || failedSrc === src) return <span aria-hidden className={cn(box, "block")} />;
  // Recipe photos come from other sites, already sized: nothing for next/image to do.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={box} src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden data-skeleton className={cn("rounded-3xl bg-element motion-safe:animate-pulse", className)} />;
}

export type SegmentOption<T extends string | number> = { value: T; label: ReactNode; trackName?: string };

/**
 * A row of buttons where one is chosen (a time range, a filter). Each is a toggle button, pressed when chosen.
 * `trackPrefix` names them for the activity log: "admin.dashboard.range" + ".30".
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  trackPrefix,
  className,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  trackPrefix: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-btn bg-element p-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          // The look of the kit's SegmentedControl; toggle buttons, as these have always been.
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            data-track={`${trackPrefix}.${option.trackName ?? String(option.value)}`}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors pointer-coarse:h-10",
              active ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A row in a short list that opens a person's details. */
export function MiniRow({ onClick, trackId, children }: { onClick: () => void; trackId: string; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      trackId={trackId}
      onClick={onClick}
      className="h-auto w-full justify-start gap-3 rounded-btn px-2 py-2 text-start font-normal whitespace-normal"
    >
      {children}
    </Button>
  );
}

/** A search box for a card's heading. */
export function SearchBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder ?? label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      className="h-10 w-56 max-w-full rounded-btn border border-border bg-surface px-3.5 text-sm text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
    />
  );
}

/** Tables fit a laptop screen; on a narrower one they scroll inside their card instead of widening the page. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

export const tableClass = "w-full border-collapse text-sm";
export const thClass = "border-b border-border px-2 py-2 text-start text-xs font-bold whitespace-nowrap text-muted";
export const tdClass = "border-b border-border/60 px-2 py-2 align-top text-text";
export const numClass = "text-end tabular-nums";
