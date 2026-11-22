"use client";

import { ChefHat, Clock, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import type { Recipe } from "@shared/types/recipe";

import { RecipeThumb } from "@/components/cookbook/RecipeThumb";
import { buttonClasses } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

const DISMISSED_KEY = "pinch:cook-first-dismissed-at";
/** "Not now" hides the card for this long. */
const QUIET_DAYS = 3;

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * For someone with saved recipes who has never marked one cooked: one recipe to make tonight, at the top of the
 * Library (as on mobile). Cooking is what makes people come back and save more. `recipe` comes from
 * firstCookSuggestion (shared/lib/cookTonight.ts).
 */
export function CookFirstCard({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // The dismissal lives in this browser's storage, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(dismissedRecently());
  }, []);

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Hidden for this visit only.
    }
  }

  const title = recipe.display_title ?? recipe.title;
  const duration = recipe.estimated_time_minutes
    ? formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })
    : null;

  return (
    <section
      aria-labelledby="cook-first-title"
      className="mb-6 flex items-center gap-4 rounded-3xl border border-frosted-border bg-accent-soft p-4 shadow-soft sm:p-5"
    >
      <RecipeThumb src={recipe.image_url} className="h-16 w-16 rounded-2xl sm:h-20 sm:w-20" />
      <div className="min-w-0 flex-1">
        <h2 id="cook-first-title" className="text-sm font-semibold text-accent">
          {t("library.cookFirstTitle")}
        </h2>
        <p className="mt-0.5 truncate text-base font-bold text-text">{title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          {duration ? (
            <>
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {duration}
              <span aria-hidden>·</span>
            </>
          ) : null}
          {t("library.cookFirstBody")}
        </p>
      </div>
      <Link href={`/recipe/${recipe.id}`} data-track="library.cook_first.open" className={buttonClasses({ variant: "primary", size: "sm" })}>
        <ChefHat aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">{t("library.cookFirstAction")}</span>
      </Link>
      <IconButton label={t("common.notNow")} trackId="library.cook_first.dismiss" icon={<X className="h-4 w-4" />} onClick={dismiss} className="-me-1 h-9 w-9" />
    </section>
  );
}
