"use client";

import { Check, Clock, Link2, ShoppingBasket, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

const INGREDIENT_BARS = ["w-3/4", "w-1/2", "w-2/3"];

/**
 * What Pinch does, drawn softly: a link pasted into Snap becomes a recipe card, and its ingredients land on the
 * shopping list. Decoration only (the page says the same in words), drawn with the theme's colours so it follows
 * every theme and dark mode.
 */
export function WelcomeIllustration() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm select-none sm:max-w-md">
      <div className="absolute -inset-6 rounded-full bg-linear-to-br from-primary-soft to-accent-soft opacity-60 blur-3xl sm:-inset-10" />

      <div className="relative rounded-[2rem] border border-border bg-surface p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2">
          <div dir="ltr" className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-soft px-4 text-xs text-muted">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">tiktok.com/@…/video/…</span>
          </div>
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary">
            <Sparkles className="h-4 w-4" />
            {t("tabs.snap")}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <div className="grid h-36 place-items-center bg-linear-to-br from-accent-soft to-primary-soft sm:h-40">
            {/* A bowl seen from above: rim, food and a few bits of herb. */}
            <div className="grid h-28 w-28 place-items-center rounded-full bg-surface shadow-soft sm:h-32 sm:w-32">
              <div className="relative h-20 w-20 rounded-full bg-accent-soft sm:h-24 sm:w-24">
                <span className="absolute start-4 top-5 h-4 w-4 rounded-full bg-accent opacity-80" />
                <span className="absolute end-5 top-4 h-3 w-3 rounded-full bg-primary opacity-70" />
                <span className="absolute start-9 bottom-4 h-4.5 w-4.5 rounded-full bg-accent opacity-60" />
                <span className="absolute end-4 bottom-6 h-2.5 w-2.5 rounded-full bg-success opacity-80" />
                <span className="absolute start-6 top-11 h-2 w-2 rounded-full bg-success opacity-70" />
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <p className="font-semibold text-text">{t("web.welcome.sampleTitle")}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" />
              {t("web.welcome.sampleMeta")}
            </p>
            <ul className="mt-4 space-y-2.5">
              {INGREDIENT_BARS.map((width) => (
                <li key={width} className="flex items-center gap-2.5">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className={`h-2 rounded-full bg-element ${width}`} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 end-4 flex max-w-[85%] items-center gap-2.5 rounded-full border border-border bg-surface py-2 ps-2 pe-4 text-sm font-medium text-text shadow-soft motion-safe:animate-slide-up sm:-end-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <ShoppingBasket className="h-4 w-4" />
        </span>
        <span className="truncate">{t("web.welcome.sampleListed")}</span>
      </div>
    </div>
  );
}
