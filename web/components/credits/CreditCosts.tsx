"use client";

import { Camera, Check, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { RECIPE_REMIX_LIMIT } from "@shared/lib/quotas";

import { Tile, TileBadge, TileLabel } from "@/components/ui/Tile";

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
    <Tile as="section" aria-labelledby="credits-costs" className="p-5 sm:p-6">
      <h2 id="credits-costs" className="text-xl font-bold text-text">
        {t("web.credits.costsTitle")}
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {PAID.map(({ icon: Icon, labelKey, noteKey }) => (
          <li key={labelKey} className="flex min-h-14 items-center gap-3 rounded-2xl bg-element p-2 pe-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-primary-text">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-text">{t(labelKey)}</span>
              {noteKey ? <span className="block text-[13px] text-muted">{t(noteKey)}</span> : null}
            </span>
            <TileBadge className="shrink-0 bg-accent-soft whitespace-nowrap text-accent-text">{t("web.credits.costOne")}</TileBadge>
          </li>
        ))}
      </ul>

      <TileLabel as="h3" className="mt-6">
        {t("web.credits.freeTitle")}
      </TileLabel>
      <ul className="mt-3 grid gap-x-6 gap-y-2.5 text-sm text-muted sm:grid-cols-2">
        {FREE_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{t(key, { limit: RECIPE_REMIX_LIMIT })}</span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
