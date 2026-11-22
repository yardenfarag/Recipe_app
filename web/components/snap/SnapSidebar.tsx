"use client";

import { ChevronRight, ClipboardPaste, Coins, MousePointerClick, PenLine } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";
import type { ProfileQuota } from "@shared/lib/supabase/profile";

import { OutOfCreditsDialog } from "@/components/credits/OutOfCreditsDialog";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Tile, TileLabel, tileClasses } from "@/components/ui/Tile";

/** Your credit balance, what an import costs, and where to buy more. */
export function CreditsCard({ quota }: { quota: ProfileQuota | null }) {
  const { t } = useTranslation();
  const empty = quota != null && quota.totalCredits <= 0;
  const [buying, setBuying] = useState(false);
  return (
    <Tile as="section" aria-labelledby="snap-credits" className={empty ? "border-accent bg-accent-soft p-5" : "p-5"}>
      <TileLabel as="h2" id="snap-credits" className="flex items-center gap-2">
        <Coins aria-hidden className="h-4 w-4 shrink-0 text-accent-text" />
        {t("settings.recipeCredits")}
      </TileLabel>
      {quota ? (
        <p className="mt-3 font-display text-lg leading-snug font-bold text-text" aria-live="polite">
          {t("snap.creditsRemaining", { total: quota.totalCredits, free: quota.freeExtractsRemaining, purchased: quota.purchasedCredits })}
        </p>
      ) : (
        <p aria-hidden className="mt-3 h-6 w-48 max-w-full rounded-lg bg-element motion-safe:animate-pulse" />
      )}
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {empty ? t("snap.creditLimitBody", { limit: FREE_MONTHLY_EXTRACT_LIMIT }) : t("credits.buyHint")}
      </p>
      {empty ? (
        // Out: buy a pack right here, without leaving Snap.
        <>
          <Button variant="outline" size="sm" className="mt-4" trackId="snap.credits.buy" onClick={() => setBuying(true)}>
            {t("credits.buyAction")}
          </Button>
          <OutOfCreditsDialog open={buying} onOpenChange={setBuying} />
        </>
      ) : (
        <Link href="/settings/credits" data-track="snap.credits.open" className={buttonClasses({ variant: "outline", size: "sm", className: "mt-4" })}>
          {t("credits.buyAction")}
        </Link>
      )}
    </Tile>
  );
}

/** Write a recipe by hand (ADR 018). */
export function WriteRecipeCard() {
  const { t } = useTranslation();
  return (
    <Link
      href="/recipe/edit"
      data-track="snap.write_recipe"
      className={tileClasses({ className: "group flex items-center gap-3 p-5 transition-colors hover:bg-element active:bg-selected" })}
    >
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
        <PenLine className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg leading-snug font-bold text-text">{t("recipeEditor.entry.write")}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{t("recipeEditor.entry.writeHint")}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
    </Link>
  );
}

const subscribeNothing = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The web's answer to mobile's "Share into Pinch": paste or drop straight onto the page. Not shown on phones. */
export function QuickTipsCard() {
  const { t } = useTranslation();
  const mac = useSyncExternalStore(subscribeNothing, isMac, () => false);
  return (
    <Tile as="section" aria-labelledby="snap-tips" className="hidden p-5 md:block">
      <TileLabel as="h2" id="snap-tips">
        {t("web.snap.tipsTitle")}
      </TileLabel>
      <ul className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted">
        <li className="flex items-center gap-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <ClipboardPaste className="h-5 w-5" />
          </span>
          <span>
            {t("web.snap.tipPaste", { shortcut: mac ? "⌘V" : "Ctrl+V" })}
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <MousePointerClick className="h-5 w-5" />
          </span>
          <span>{t("web.snap.tipDrop")}</span>
        </li>
      </ul>
    </Tile>
  );
}
