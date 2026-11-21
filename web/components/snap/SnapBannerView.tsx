"use client";

import { CircleAlert, Coins, Info, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { OutOfCreditsDialog } from "@/components/credits/OutOfCreditsDialog";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import type { SnapBanner } from "@/lib/snap/useSnap";

const tones = {
  error: { box: "bg-danger-soft", text: "text-danger", Icon: CircleAlert },
  info: { box: "bg-primary-soft", text: "text-primary", Icon: Info },
  partial: { box: "bg-warning-soft", text: "text-warning", Icon: Info },
  credits: { box: "bg-accent-soft", text: "text-accent", Icon: Coins },
} as const;

/**
 * Why the last Snap didn't give a recipe, in the mobile app's words. Errors are announced at once; the rest
 * politely. Out of credits opens the out-of-credits prompt, to buy a pack right here.
 */
export function SnapBannerView({ banner, onDismiss }: { banner: NonNullable<SnapBanner>; onDismiss: () => void }) {
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
      </div>
      <IconButton label={t("common.dismiss")} trackId="snap.banner.dismiss" icon={<X className="h-4 w-4" />} onClick={onDismiss} className="-me-2 -mt-1.5 h-9 w-9" />
    </div>
  );
}
