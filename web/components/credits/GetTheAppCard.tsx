"use client";

import { ExternalLink, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { APP_STORE_URL, PLAY_STORE_URL } from "@shared/lib/appStoreLinks";

import { buttonClasses } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";

/**
 * While web sales are switched off: where to buy instead. Credits bought in the app are on the account, so they work
 * here too. Not an error, so it reads as a calm note.
 */
export function GetTheAppCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const links = [
    { href: APP_STORE_URL, label: t("web.credits.appStore") },
    { href: PLAY_STORE_URL, label: t("web.credits.googlePlay") },
  ];
  return (
    // On the credits page it is a tile of its own; in the out-of-credits dialog, a block inside the dialog.
    <Tile tone={compact ? "element" : "surface"} size={compact ? "sm" : "lg"} className={compact ? "p-4" : "p-5 sm:p-6"}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-primary-text", compact ? "bg-surface" : "bg-primary-soft")}
        >
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg leading-snug font-bold text-text">{t("web.credits.salesOffTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("credits.webOnlyBody")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("web.credits.salesOffNote")}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:ps-13">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            data-track="credits.open_app_store"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "outline", size: "sm", className: "pointer-coarse:h-11" })}
          >
            {link.label}
            <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
            <ExternalLink aria-hidden className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </a>
        ))}
      </div>
    </Tile>
  );
}
