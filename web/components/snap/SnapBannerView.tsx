"use client";

import { Camera, ChefHat, CircleAlert, Coins, Info, PenLine, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { OutOfCreditsDialog } from "@/components/credits/OutOfCreditsDialog";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import type { SnapBanner } from "@/lib/snap/useSnap";

const tones = {
  error: { box: "bg-danger-soft", text: "text-danger", Icon: CircleAlert },
  info: { box: "bg-primary-soft", text: "text-primary-text", Icon: Info },
  partial: { box: "bg-warning-soft", text: "text-warning", Icon: Info },
  credits: { box: "bg-accent-soft", text: "text-accent-text", Icon: Coins },
} as const;

/**
 * Why the last Snap didn't give a recipe, in the mobile app's words. Errors are announced at once; the rest
 * politely. Out of credits opens the out-of-credits prompt, to buy a pack right here.
 */
export function SnapBannerView({
  banner,
  onDismiss,
  failedLink,
}: {
  banner: NonNullable<SnapBanner>;
  onDismiss: () => void;
  /** Ways on after a link couldn't be read (shown when the banner has `failedUrl`). */
  failedLink?: { onRetry: (url: string) => void; onScreenshot: () => void; onGuess: (url: string) => void };
}) {
  const { t } = useTranslation();
  const tone = tones[banner.tone];
  const [buying, setBuying] = useState(false);
  return (
    <div
      role={banner.tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-2xl px-4 py-3.5 animate-fade-in", tone.box)}
    >
      <tone.Icon aria-hidden className={cn("mt-0.5 h-5 w-5 shrink-0", tone.text)} />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {banner.title ? <p className={cn("font-semibold", tone.text)}>{banner.title}</p> : null}
        <p className={banner.title ? "text-text" : cn("font-medium", tone.text)}>{banner.message}</p>
        {banner.tone === "credits" ? (
          <>
            <Button size="sm" className="mt-3" trackId="snap.credits.buy" onClick={() => setBuying(true)}>
              {t("credits.buyAction")}
            </Button>
            <OutOfCreditsDialog open={buying} onOpenChange={setBuying} needed={1} />
          </>
        ) : null}
        {banner.fillIn ? (
          <Link href="/recipe/edit?from=import" data-track="snap.partial.fill_in" className={buttonClasses({ size: "sm", className: "mt-3" })}>
            <PenLine aria-hidden className="h-4 w-4" />
            {t("snap.partialFillIn")}
          </Link>
        ) : null}
        {banner.failedUrl && failedLink ? (
          <FailedLinkActions url={banner.failedUrl} {...failedLink} />
        ) : null}
      </div>
      <IconButton label={t("common.dismiss")} trackId="snap.banner.dismiss" icon={<X className="h-4 w-4" />} onClick={onDismiss} className="-me-2 -mt-1.5 h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11" />
    </div>
  );
}

/**
 * Try again (a failed read doesn't use a credit), snap a screenshot of the recipe in the caption or comments, or
 * Guess the recipe from the dish.
 */
function FailedLinkActions({
  url,
  onRetry,
  onScreenshot,
  onGuess,
}: {
  url: string;
  onRetry: (url: string) => void;
  onScreenshot: () => void;
  onGuess: (url: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-muted">{t("snap.failedWaysOn")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" trackId="snap.failed.retry" onClick={() => onRetry(url)}>
          <RotateCcw aria-hidden className="h-4 w-4" />
          {t("snap.failedRetry")}
        </Button>
        <Button size="sm" variant="outline" trackId="snap.failed.screenshot" onClick={onScreenshot}>
          <Camera aria-hidden className="h-4 w-4" />
          {t("snap.failedScreenshot")}
        </Button>
        <Button size="sm" variant="outline" trackId="snap.failed.guess" onClick={() => onGuess(url)}>
          <ChefHat aria-hidden className="h-4 w-4" />
          {t("snap.failedGuess")}
        </Button>
      </div>
    </div>
  );
}
