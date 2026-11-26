"use client";

import { CircleAlert, Info, Languages, Sparkles, TriangleAlert, Undo2, WandSparkles, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { AvoidHit } from "@shared/lib/avoidList";
import { recipeHasSource, recipeIsInvented } from "@shared/lib/recipeOrigin";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";

import { useRecipeActions, type RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import type { AvoidMatches, RecipeDisplay } from "@/components/recipe/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Tone = "danger" | "warning" | "accent" | "primary";

/** "Show original language" and back, on a page that only shows a saved translation (a Hub card). */
export type LanguageToggle = {
  showingOriginal: boolean;
  setShowOriginal: (original: boolean) => void;
  /** The translation's language (the app's). */
  language: string;
};

const tones: Record<Tone, { box: string; title: string }> = {
  danger: { box: "bg-danger-soft", title: "text-danger" },
  warning: { box: "bg-warning-soft", title: "text-warning" },
  accent: { box: "bg-accent-soft", title: "text-accent-text" },
  primary: { box: "bg-primary-soft", title: "text-primary-text" },
};

function Notice({
  tone,
  icon,
  title,
  children,
  action,
  testId,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  /** A button that acts on what the notice says ("Make it without these", "Repair recipe"). */
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn("flex items-start gap-3 rounded-3xl px-5 py-4", tones[tone].box)}>
      <span aria-hidden className={cn("mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5", tones[tone].title)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <p className={cn("font-semibold", tones[tone].title)}>{title}</p>
        {children}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

/** A small button inside a notice, in the notice's colour family. */
function NoticeButton({
  icon,
  children,
  onClick,
  busy,
  strong,
  haspopup,
  trackId,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  busy?: boolean;
  /** The main action (an allergy fix); otherwise a quieter one. */
  strong?: boolean;
  haspopup?: boolean;
  /** Activity-log id (ADR 020). */
  trackId?: string;
}) {
  return (
    <Button size="sm" variant={strong ? "primary" : "outline"} trackId={trackId} busy={busy} onClick={onClick} aria-haspopup={haspopup ? "dialog" : undefined}>
      {busy ? null : <span aria-hidden className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </Button>
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
 * details or was guessed, a version adapted to their kitchen or remixed, and a translation. On a saved recipe each
 * one offers its fix: "Make it without these", Repair, "Revert to original", "Show original language", and
 * "Translate" when the recipe is in another language than the app's (PIN-135).
 */
export function RecipeNotices({
  display,
  avoid,
  languageToggle,
}: {
  display: RecipeDisplay;
  avoid: AvoidMatches | null;
  /**
   * A recipe without actions (a Hub card) that has a saved translation into the app language: "Show original
   * language" on it, and the way back to the translation once the original is showing.
   */
  languageToggle?: LanguageToggle | null;
}) {
  const { t } = useTranslation();
  const actions = useRecipeActions();
  const { recipe } = display;
  const allergies = avoid?.allergies ?? [];
  const dislikes = avoid?.dislikes ?? [];
  const invented = recipeIsInvented(recipe);
  const partial = recipe.extraction_status === "partial";
  const adaptedSummary = recipe.kitchen_adapted_summary?.trim();
  const fixButton =
    actions?.canFix && (allergies.length > 0 || dislikes.length > 0) ? (
      <NoticeButton icon={<WandSparkles />} strong={allergies.length > 0} haspopup trackId="recipe.avoid.make_without" onClick={() => actions.open({ kind: "fix" })}>
        {t("avoid.makeWithout")}
      </NoticeButton>
    ) : null;

  const notices: ReactNode[] = [];

  if (allergies.length > 0) {
    notices.push(
      <Notice key="allergies" tone="danger" icon={<CircleAlert />} title={t("avoid.bannerAllergyTitle")} action={fixButton}>
        <HitList hits={allergies} direction={display.direction} label={(hit) => (hit.allergen ? t(`avoid.allergens.${hit.allergen}`) : hit.item)} />
        <p className="mt-2 text-xs text-muted">{t("avoid.checkLabels")}</p>
      </Notice>,
    );
  }
  if (dislikes.length > 0) {
    notices.push(
      <Notice
        key="dislikes"
        tone="warning"
        icon={<TriangleAlert />}
        title={t("avoid.bannerDislikeTitle")}
        action={allergies.length > 0 ? null : fixButton}
      >
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
    notices.push(
      <Notice
        key="partial"
        tone="warning"
        icon={<TriangleAlert />}
        title={t("recipe.partialExtraction")}
        action={
          actions?.canRepair ? (
            <NoticeButton icon={<Wrench />} haspopup trackId="recipe.repair" busy={actions.busy.repair} onClick={() => actions.open({ kind: "repair" })}>
              {t("recipe.repairAction")}
            </NoticeButton>
          ) : null
        }
      >
        {actions?.canRepair ? <p className="text-muted">{t("recipe.repairHint")}</p> : null}
      </Notice>,
    );
  }
  if (actions) {
    const adapted = adaptationNotice(actions, t);
    if (adapted) notices.push(adapted);
  } else if (adaptedSummary) {
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
        action={
          actions || languageToggle ? (
            <NoticeButton
              icon={<Undo2 className="rtl:-scale-x-100" />}
              trackId="recipe.show_original_language"
              onClick={actions ? actions.showOriginalLanguage : () => languageToggle?.setShowOriginal(true)}
            >
              {t("recipe.showOriginal")}
            </NoticeButton>
          ) : null
        }
      />,
    );
  } else if (!actions && languageToggle?.showingOriginal) {
    const source = resolveRecipeSourceLanguage(recipe);
    notices.push(
      <Notice
        key="translate"
        tone="primary"
        icon={<Languages />}
        title={t("web.recipeActions.inOtherLanguage", { language: t(`languages.${source}`, { defaultValue: source }) })}
        action={
          <NoticeButton icon={<Languages />} trackId="recipe.show_translation" onClick={() => languageToggle.setShowOriginal(false)}>
            {t("web.recipeActions.translateTo", { language: t(`languages.${languageToggle.language}`) })}
          </NoticeButton>
        }
      />,
    );
  } else if (actions?.translateOffer) {
    const source = resolveRecipeSourceLanguage(recipe);
    const target = t(`languages.${actions.translateOffer}`);
    notices.push(
      <Notice
        key="translate"
        testId="translate-offer"
        tone="primary"
        icon={<Languages />}
        title={t("web.recipeActions.inOtherLanguage", { language: t(`languages.${source}`, { defaultValue: source }) })}
        action={
          <NoticeButton icon={<Languages />} trackId="recipe.translate_to_app_language" busy={actions.busy.translate} onClick={actions.translateToAppLanguage}>
            {t("web.recipeActions.translateTo", { language: target })}
          </NoticeButton>
        }
      />,
    );
  }

  if (notices.length === 0) return null;
  return <div className="grid gap-3">{notices}</div>;
}

/** A remix made on this visit, or a saved kitchen adaptation, with what changed and the way back. */
function adaptationNotice(actions: RecipeActions, t: (key: string, values?: Record<string, unknown>) => string): ReactNode {
  const { adaptation } = actions;
  if (!adaptation) return null;
  const title =
    adaptation.kind === "remix"
      ? t("recipe.variantVersion", { variant: t(`recipe.variants.${adaptation.variant}.label`) })
      : t("recipe.kitchenAdapted");
  return (
    <Notice
      key="adapted"
      testId="adaptation-notice"
      tone="primary"
      icon={adaptation.kind === "remix" ? <WandSparkles /> : <Info />}
      title={title}
      action={
        actions.canRevert ? (
          <NoticeButton icon={<Undo2 className="rtl:-scale-x-100" />} trackId="recipe.remix.revert" busy={actions.busy.revert} onClick={actions.revert}>
            {t("recipe.revertOriginal")}
          </NoticeButton>
        ) : null
      }
    >
      {adaptation.summary ? <p className="text-text">{adaptation.summary}</p> : null}
    </Notice>
  );
}
