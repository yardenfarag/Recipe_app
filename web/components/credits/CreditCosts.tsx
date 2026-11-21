"use client";

import { Camera, Check, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { RECIPE_REMIX_LIMIT } from "@shared/lib/quotas";

/**
 * What a credit buys, so nobody is surprised: imports cost one (ADR 012, 025), and so does a repair you keep. The
 * free list matters as much: most of Pinch costs nothing. Keep it in step with the Edge Functions that reserve
 * credits (extract-recipe, invent-recipe, repair-recipe).
 */
const PAID: { icon: LucideIcon; labelKey: string; noteKey?: string }[] = [
  { icon: Camera, labelKey: "web.credits.costSnap" },
  { icon: Sparkles, labelKey: "web.credits.costGuess" },
  { icon: Wrench, labelKey: "web.credits.costRepair", noteKey: "web.credits.costRepairNote" },
];

const FREE_KEYS = [
  "web.credits.freeFailed",
  "web.credits.freeRemix",
  "web.credits.freeSwap",
  "web.credits.freeTranslate",
  "web.credits.freeWrite",
  "web.credits.freeHub",
];

export function CreditCosts() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="credits-costs" className="rounded-3xl border border-frosted-border bg-surface p-5 shadow-soft sm:p-6">
      <h2 id="credits-costs" className="text-lg font-bold text-text">
        {t("web.credits.costsTitle")}
      </h2>
      <ul className="mt-4 divide-y divide-border">
        {PAID.map(({ icon: Icon, labelKey, noteKey }) => (
          <li key={labelKey} className="flex items-center gap-3 py-3 first:pt-0">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-text">{t(labelKey)}</span>
              {noteKey ? <span className="block text-xs text-muted">{t(noteKey)}</span> : null}
            </span>
            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold whitespace-nowrap text-accent">
              {t("web.credits.costOne")}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-sm font-semibold text-text">{t("web.credits.freeTitle")}</h3>
      <ul className="mt-2 grid gap-x-6 gap-y-2 text-sm text-muted sm:grid-cols-2">
        {FREE_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{t(key, { limit: RECIPE_REMIX_LIMIT })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
