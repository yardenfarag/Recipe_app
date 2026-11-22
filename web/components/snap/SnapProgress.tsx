"use client";

import { FileText, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  snapEtaAt,
  snapEtaText,
  snapProgressAt,
  snapStatusKeyAt,
  snapStatusLines,
  snapTimingKind,
} from "@shared/lib/snapProgress";

import { CookieMark } from "@/components/CookieMark";
import { Tile } from "@/components/ui/Tile";
import type { SnapJob } from "@/lib/snap/useSnap";

/** How often the ring and the countdown move. The ring eases between steps, so it looks continuous. */
export const TICK_MS = 250;

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** What is being read (the link, the PDF's name): a block inside the tile. */
const sourceLine = "flex max-w-full items-center gap-2 rounded-2xl bg-element px-4 py-2.5 text-sm text-muted";

/** Seconds since the wait started, updated every tick. */
function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}

/**
 * While Pinch reads the link or photo: a ring filling around the cookie, a line saying what it is doing, the time
 * left, and what it is reading. Nothing reports real progress, so the ring and the countdown follow how long this
 * kind of source usually takes (shared/lib/snapProgress.ts). `finished` fills the ring while the result opens.
 */
export function SnapProgress({ job, finished = false }: { job: SnapJob; finished?: boolean }) {
  const { t } = useTranslation();
  const url = job.source.type === "url" ? job.source.url : null;
  const pdf = job.source.type === "pdf";
  const kind = snapTimingKind(job.intent, url, pdf);
  const lines = useMemo(() => snapStatusLines(job.intent, url, pdf), [job.intent, url, pdf]);
  const elapsed = useElapsedSeconds();

  const progress = finished ? 1 : snapProgressAt(kind, elapsed);
  const line = t(snapStatusKeyAt(lines, progress));
  const eta = finished ? "" : snapEtaText(snapEtaAt(kind, elapsed), t);

  return (
    <Tile as="section" aria-busy="true" className="flex min-h-[26rem] flex-col items-center justify-center gap-7 px-6 py-12 text-center">
      <div
        role="progressbar"
        aria-label={line}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={eta || line}
        className="relative grid h-40 w-40 place-items-center"
      >
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="6" className="stroke-primary-soft" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            className={`transition-[stroke-dashoffset,stroke] duration-300 ease-linear ${finished ? "stroke-success" : "stroke-primary"}`}
          />
        </svg>
        <span aria-hidden className="relative text-primary-text motion-safe:animate-pulse">
          <CookieMark size={64} />
        </span>
      </div>

      <div className="grid gap-1.5">
        {/* The lines go in order and never loop, so each one is read out once. */}
        <p role="status" aria-live="polite" className="font-display text-xl font-bold text-balance text-text md:text-[26px] md:leading-tight">
          <span key={line} className="inline-block animate-fade-in">
            {line}
          </span>
        </p>
        <p className="min-h-5 text-sm text-muted tabular-nums">{eta}</p>
      </div>

      {job.source.type === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local photo, already shrunk
        <img
          src={`data:${job.source.mimeType};base64,${job.source.base64}`}
          alt=""
          className="h-28 w-28 rounded-[22px] object-cover"
        />
      ) : job.source.type === "pdf" ? (
        <p className={sourceLine}>
          <FileText aria-hidden className="h-4 w-4 shrink-0" />
          <span className="truncate">{job.source.name}</span>
        </p>
      ) : (
        <p className={sourceLine}>
          <Link2 aria-hidden className="h-4 w-4 shrink-0" />
          <span dir="ltr" className="truncate">
            {job.source.url}
          </span>
        </p>
      )}
    </Tile>
  );
}
