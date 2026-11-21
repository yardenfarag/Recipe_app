"use client";

import { CircleAlert, Info, Languages, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { AvoidHit } from "@shared/lib/avoidList";
import { recipeHasSource, recipeIsInvented } from "@shared/lib/recipeOrigin";

import type { AvoidMatches, RecipeDisplay } from "@/components/recipe/types";
import { cn } from "@/lib/cn";

type Tone = "danger" | "warning" | "accent" | "primary";

const tones: Record<Tone, { box: string; title: string }> = {
  danger: { box: "bg-danger-soft", title: "text-danger" },
  warning: { box: "bg-warning-soft", title: "text-warning" },
  accent: { box: "bg-accent-soft", title: "text-accent" },
  primary: { box: "bg-primary-soft", title: "text-primary" },
};

function Notice({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl px-4 py-3.5", tones[tone].box)}>
      <span aria-hidden className={cn("mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5", tones[tone].title)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <p className={cn("font-semibold", tones[tone].title)}>{title}</p>
        {children}
      </div>
    </div>
  );
}

/** "Peanuts: peanut butter, satay sauce". The ingredient names are the recipe's, so they keep their own direction. */
function HitList({ hits, label, direction }: { hits: AvoidHit[]; label: (hit: AvoidHit) => string; direction: "ltr" | "rtl" }) {
  return (
    <ul className="mt-1 space-y-0.5 text-text">
      {hits.map((hit) => (
        <li key={hit.item}>
          <span className="font-semibold">{label(hit)}: </span>
          <bdi dir={direction}>{hit.ingredients.join(", ")}</bdi>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the reader should know before cooking: ingredients from their allergies or dislikes, an import that missed
 * details or was guessed, a version adapted to their kitchen, and a translation. Text only for now; the actions
 * ("Make it without these", repair, show the original) arrive with PIN-133.
 */
export function RecipeNotices({ display, avoid }: { display: RecipeDisplay; avoid: AvoidMatches | null }) {
  const { t } = useTranslation();
  const { recipe } = display;
  const allergies = avoid?.allergies ?? [];
  const dislikes = avoid?.dislikes ?? [];
  const invented = recipeIsInvented(recipe);
  const partial = recipe.extraction_status === "partial";
  const adaptedSummary = recipe.kitchen_adapted_summary?.trim();

  const notices: ReactNode[] = [];

  if (allergies.length > 0) {
    notices.push(
      <Notice key="allergies" tone="danger" icon={<CircleAlert />} title={t("avoid.bannerAllergyTitle")}>
        <HitList hits={allergies} direction={display.direction} label={(hit) => (hit.allergen ? t(`avoid.allergens.${hit.allergen}`) : hit.item)} />
        <p className="mt-2 text-xs text-muted">{t("avoid.checkLabels")}</p>
      </Notice>,
    );
  }
  if (dislikes.length > 0) {
    notices.push(
      <Notice key="dislikes" tone="warning" icon={<TriangleAlert />} title={t("avoid.bannerDislikeTitle")}>
        <HitList hits={dislikes} direction={display.direction} label={(hit) => hit.item} />
      </Notice>,
    );
  }
  if (invented) {
    notices.push(
      <Notice key="invented" tone="accent" icon={<Sparkles />} title={t("recipe.inventedChip")}>
        <p className="text-muted">{partial ? t("recipe.inventedPartial") : t("recipe.inventedBanner")}</p>
      </Notice>,
    );
  } else if (partial && recipeHasSource(recipe)) {
    notices.push(<Notice key="partial" tone="warning" icon={<TriangleAlert />} title={t("recipe.partialExtraction")} />);
  }
  if (adaptedSummary) {
    notices.push(
      <Notice key="adapted" tone="primary" icon={<Info />} title={t("recipe.kitchenAdapted")}>
        <p className="text-text">{adaptedSummary}</p>
      </Notice>,
    );
  }
  if (display.translated && display.contentLanguage) {
    notices.push(
      <Notice
        key="translated"
        tone="primary"
        icon={<Languages />}
        title={t("recipe.showingLanguage", { language: t(`languages.${display.contentLanguage}`) })}
      />,
    );
  }

  if (notices.length === 0) return null;
  return <div className="mb-6 grid gap-3">{notices}</div>;
}
