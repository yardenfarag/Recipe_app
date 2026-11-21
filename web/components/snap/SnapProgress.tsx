"use client";

import { FileText, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { detectPlatform } from "@shared/lib/platformUrls";

import { CookieMark } from "@/components/CookieMark";
import type { SnapJob } from "@/lib/snap/useSnap";

/** How long each line shows, as on mobile. */
export const STATUS_INTERVAL_MS = 2800;

/** What Pinch says it is doing, in order (the mobile app's lines). */
export function statusLineKeys(job: SnapJob): string[] {
  const reading =
    job.source.type === "photo"
      ? "snap.statusReadingPhoto"
      : job.source.type === "pdf"
        ? "snap.statusReadingPdf"
        : detectPlatform(job.source.url) === "web"
        ? "snap.statusReadingPage"
        : "snap.statusReadingVideo";
  return job.intent === "invent"
    ? [reading, "snap.statusFiguringDish", "snap.statusWritingHome"]
    : [reading, "snap.statusIngredients", "snap.statusWritingSteps", "snap.statusAlmost"];
}

/**
 * While Pinch reads the link or photo: the cookie beating, a line saying what it is doing, and what it is reading.
 * Each line is read out once; after that the loop is quiet, so it doesn't drown out everything else.
 */
export function SnapProgress({ job }: { job: SnapJob }) {
  const { t } = useTranslation();
  const lines = statusLineKeys(job);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => i + 1), STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const line = t(lines[index % lines.length]);
  const speak = index < lines.length;

  return (
    <section
      aria-busy="true"
      className="flex min-h-[22rem] flex-col items-center justify-center gap-8 rounded-3xl border border-frosted-border bg-surface px-6 py-12 text-center shadow-soft"
    >
      <div aria-hidden className="relative grid h-36 w-36 place-items-center">
        <span className="absolute h-32 w-32 rounded-full border-2 border-primary opacity-30 motion-safe:animate-ping" />
        <span className="absolute h-24 w-24 rounded-full bg-primary-soft" />
        <span className="relative text-primary motion-safe:animate-pulse">
          <CookieMark size={72} />
        </span>
      </div>

      <p role="status" aria-live={speak ? "polite" : "off"} className="text-xl font-semibold text-text md:text-2xl">
        <span key={index} className="inline-block animate-fade-in">
          {line}
        </span>
      </p>

      {job.source.type === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local photo, already shrunk
        <img
          src={`data:${job.source.mimeType};base64,${job.source.base64}`}
          alt=""
          className="h-28 w-28 rounded-2xl object-cover shadow-soft"
        />
      ) : job.source.type === "pdf" ? (
        <p className="flex max-w-full items-center gap-2 text-sm text-muted">
          <FileText aria-hidden className="h-4 w-4 shrink-0" />
          <span className="truncate">{job.source.name}</span>
        </p>
      ) : (
        <p className="flex max-w-full items-center gap-2 text-sm text-muted">
          <Link2 aria-hidden className="h-4 w-4 shrink-0" />
          <span dir="ltr" className="truncate">
            {job.source.url}
          </span>
        </p>
      )}
    </section>
  );
}
