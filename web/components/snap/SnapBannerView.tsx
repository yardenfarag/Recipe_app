"use client";

import { CircleAlert, Coins, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buttonClasses } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { EXPO_WEB_LINKS } from "@/lib/snap/expoWebLinks";
import type { SnapBanner } from "@/lib/snap/useSnap";

const tones = {
  error: { box: "bg-danger-soft", text: "text-danger", Icon: CircleAlert },
  info: { box: "bg-primary-soft", text: "text-primary", Icon: Info },
  partial: { box: "bg-warning-soft", text: "text-warning", Icon: Info },
  credits: { box: "bg-accent-soft", text: "text-accent", Icon: Coins },
} as const;

/**
 * Why the last Snap didn't give a recipe, in the mobile app's words. Errors are announced at once; the rest
 * politely. Out of credits links to buying more (the Expo web app's credits page until PIN-141).
 */
export function SnapBannerView({ banner, onDismiss }: { banner: NonNullable<SnapBanner>; onDismiss: () => void }) {
  const { t } = useTranslation();
  const tone = tones[banner.tone];
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
          <a
            href={EXPO_WEB_LINKS.credits}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "primary", size: "sm", className: "mt-3" })}
          >
            {t("credits.buyAction")}
            <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
          </a>
        ) : null}
      </div>
      <IconButton label={t("common.dismiss")} icon={<X className="h-4 w-4" />} onClick={onDismiss} className="-me-2 -mt-1.5 h-9 w-9" />
    </div>
  );
}
