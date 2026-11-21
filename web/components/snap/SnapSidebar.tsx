"use client";

import { ChevronRight, ClipboardPaste, Coins, ExternalLink, MousePointerClick, PenLine } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";
import type { ProfileQuota } from "@shared/lib/supabase/profile";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { EXPO_WEB_LINKS } from "@/lib/snap/expoWebLinks";

const card = "rounded-3xl border border-frosted-border bg-surface p-5 shadow-soft";

/** Your credit balance, what an import costs, and where to buy more. */
export function CreditsCard({ quota }: { quota: ProfileQuota | null }) {
  const { t } = useTranslation();
  const empty = quota != null && quota.totalCredits <= 0;
  return (
    <section aria-labelledby="snap-credits" className={cn(card, empty && "border-accent bg-accent-soft")}>
      <h2 id="snap-credits" className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Coins aria-hidden className="h-4 w-4 text-accent" />
        {t("settings.recipeCredits")}
      </h2>
      {quota ? (
        <p className="mt-2 text-sm font-semibold text-text" aria-live="polite">
          {t("snap.creditsRemaining", { total: quota.totalCredits, free: quota.freeExtractsRemaining, purchased: quota.purchasedCredits })}
        </p>
      ) : (
        <p aria-hidden className="mt-2 h-5 w-48 max-w-full rounded-full bg-element motion-safe:animate-pulse" />
      )}
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {empty ? t("snap.creditLimitBody", { limit: FREE_MONTHLY_EXTRACT_LIMIT }) : t("credits.buyHint")}
      </p>
      <a
        href={EXPO_WEB_LINKS.credits}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses({ variant: empty ? "primary" : "outline", size: "sm", className: "mt-4" })}
      >
        {t("credits.buyAction")}
        <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
        <ExternalLink aria-hidden className="h-3.5 w-3.5 rtl:-scale-x-100" />
      </a>
    </section>
  );
}

/** Write a recipe by hand (ADR 018). In the Expo web app until the editor comes to the web (PIN-137). */
export function WriteRecipeCard() {
  const { t } = useTranslation();
  return (
    <a
      href={EXPO_WEB_LINKS.writeRecipe}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(card, "group flex items-center gap-3 transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-primary")}
    >
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
        <PenLine className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-text">{t("recipeEditor.entry.write")}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t("recipeEditor.entry.writeHint")}</span>
        <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
    </a>
  );
}

const subscribeNothing = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The web's answer to mobile's "Share into Pinch": paste or drop straight onto the page. Not shown on phones. */
export function QuickTipsCard() {
  const { t } = useTranslation();
  const mac = useSyncExternalStore(subscribeNothing, isMac, () => false);
  return (
    <section aria-labelledby="snap-tips" className={cn(card, "hidden bg-accent-soft md:block")}>
      <h2 id="snap-tips" className="text-sm font-semibold text-text">
        {t("web.snap.tipsTitle")}
      </h2>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
        <li className="flex gap-2.5">
          <ClipboardPaste aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>
            {t("web.snap.tipPaste", { shortcut: mac ? "⌘V" : "Ctrl+V" })}
          </span>
        </li>
        <li className="flex gap-2.5">
          <MousePointerClick aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{t("web.snap.tipDrop")}</span>
        </li>
      </ul>
    </section>
  );
}
