"use client";

import { Check, Clock, Link2, ShoppingBasket, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

const INGREDIENT_BARS = ["w-3/4", "w-1/2", "w-2/3", "w-2/5"];

/**
 * What Pinch does, in the browser it's used in: a link pasted into Snap becomes a recipe card, and its ingredients
 * land on the shopping list. Decoration only (the page says the same in words), drawn with the theme's colours so
 * it follows every theme and dark mode.
 */
export function WelcomeIllustration() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none lg:max-w-lg">
      <div className="absolute -inset-4 rounded-[3rem] bg-primary-soft opacity-70 blur-2xl sm:-inset-8" />

      <div className="relative overflow-hidden rounded-3xl border border-frosted-border bg-surface shadow-lift">
        <div className="flex items-center gap-1.5 border-b border-border bg-surface-soft px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <div dir="ltr" className="ms-3 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs text-muted">
            <span className="truncate">pinch-app.io/app</span>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <div dir="ltr" className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-bg px-4 text-sm text-muted">
              <Link2 className="h-4 w-4 shrink-0" />
              <span className="truncate">https://www.tiktok.com/@…/video/…</span>
            </div>
            <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary shadow-soft">
              <Sparkles className="h-4 w-4" />
              {t("tabs.snap")}
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-frosted-border bg-bg">
            <div className="relative grid h-32 place-items-center bg-linear-to-br from-accent-soft via-primary-soft to-surface-soft sm:h-36">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-surface shadow-soft sm:h-28 sm:w-28">
                <div className="relative h-16 w-16 rounded-full bg-accent-soft sm:h-20 sm:w-20">
                  <span className="absolute start-3 top-4 h-3 w-3 rounded-full bg-accent" />
                  <span className="absolute end-4 top-3 h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="absolute start-7 bottom-3 h-3.5 w-3.5 rounded-full bg-accent" />
                  <span className="absolute end-3 bottom-5 h-2 w-2 rounded-full bg-success" />
                </div>
              </div>
            </div>
            <div className="p-4">
              <p className="font-bold text-text">{t("web.welcome.sampleTitle")}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" />
                {t("web.welcome.sampleMeta")}
              </p>
              <ul className="mt-4 space-y-2.5">
                {INGREDIENT_BARS.map((width) => (
                  <li key={width} className="flex items-center gap-2.5">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className={`h-2 rounded-full bg-element ${width}`} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 end-3 flex max-w-[85%] items-center gap-2.5 rounded-2xl border border-frosted-border bg-surface px-4 py-3 text-sm font-semibold text-text shadow-lift motion-safe:animate-slide-up sm:-end-6">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <ShoppingBasket className="h-4 w-4" />
        </span>
        {t("web.welcome.sampleListed")}
      </div>
    </div>
  );
}
