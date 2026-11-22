"use client";

import { Check, Clock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  FIRST_RECIPES_MIN,
  fetchFirstRecipeChoices,
  fitsAllDiets,
  libraryIsEmpty,
  saveFirstRecipes,
} from "@shared/lib/firstRecipes";
import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { EMPTY_KITCHEN_PROFILE, type KitchenProfile } from "@shared/lib/kitchenProfile";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import { showToast } from "@shared/lib/toast";
import type { RecipeCard } from "@shared/types/recipeCard";

import { useAuth } from "@/components/AuthProvider";
import { PinchLogo } from "@/components/CookieMark";
import { RecipeThumb } from "@/components/cookbook/RecipeThumb";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { captureFirstRecipesPicked } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { afterOnboardingPath } from "@/lib/onboarding/paths";

type LoadState = { kind: "loading" } | { kind: "ready"; cards: RecipeCard[]; kitchen: KitchenProfile } | { kind: "error" };

/**
 * Right after the first-run questions: popular Hub recipes that fit the diets and avoid list just given, to save at
 * least one before the Library opens (as on mobile, src/app/first-recipes.tsx). Many new accounts never had a link at
 * hand and left with an empty Library. An account that already has recipes goes straight on to `next`.
 */
export function FirstRecipesPicker() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const next = afterOnboardingPath(params.get("next"));
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setState({ kind: "loading" });
    try {
      if (!(await libraryIsEmpty())) {
        router.replace(next);
        return;
      }
      const kitchen = await fetchCloudKitchenProfile(userId).catch(() => EMPTY_KITCHEN_PROFILE);
      const cards = await fetchFirstRecipeChoices(kitchen);
      // Nothing to offer: no reason to hold anyone here.
      if (cards.length === 0) {
        router.replace(next);
        return;
      }
      setState({ kind: "ready", cards, kitchen });
    } catch (error) {
      console.warn("[first-recipes] load failed", error);
      setState({ kind: "error" });
    }
  }, [next, router, userId]);

  useEffect(() => {
    // Loads from the network once the account is known; the result lands in state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function save() {
    if (saving || picked.length < FIRST_RECIPES_MIN || state.kind !== "ready") return;
    setSaving(true);
    const { saved } = await saveFirstRecipes(picked);
    if (saved === 0) {
      setSaving(false);
      showToast(t("firstRecipes.saveFailed"), "error");
      return;
    }
    captureFirstRecipesPicked({ count: saved, diets: state.kitchen.diets.length });
    showToast(t("firstRecipes.saved", { count: saved }));
    router.replace(next);
  }

  const hasDiets = state.kind === "ready" && state.kitchen.diets.length > 0;
  const canSave = picked.length >= FIRST_RECIPES_MIN && !saving;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-frosted-border bg-frosted backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-8">
          <PinchLogo />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-8 sm:px-8">
        <PageHeader
          title={t("firstRecipes.title")}
          subtitle={hasDiets ? t("firstRecipes.subtitleDiets") : t("firstRecipes.subtitle")}
        />

        {state.kind === "loading" ? <LoadingState label={t("a11y.loading")} /> : null}

        {state.kind === "error" ? (
          <div className="space-y-4">
            <ErrorState title={t("firstRecipes.loadFailed")} trackId="first_recipes.load_error" onRetry={() => void load()} />
            {/* Never a dead end: without the Hub, Snap is the way to a first recipe. */}
            <div className="text-center">
              <Button variant="ghost" trackId="first_recipes.continue_without" onClick={() => router.replace("/add")}>
                {t("firstRecipes.continueToSnap")}
              </Button>
            </div>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {state.cards.map((card) => (
              <li key={card.id}>
                <PickTile
                  card={card}
                  selected={picked.includes(card.id)}
                  fitsDiet={fitsAllDiets(card, state.kitchen)}
                  onToggle={() => toggle(card.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </main>

      {state.kind === "ready" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-frosted-border bg-frosted backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <p aria-live="polite" className="text-sm text-muted">
              {/* Before a pick, the button itself says "Pick at least one". */}
              {picked.length > 0 ? t("firstRecipes.pickedCount", { count: picked.length }) : null}
            </p>
            <Button size="lg" trackId="first_recipes.save" disabled={!canSave} busy={saving} onClick={() => void save()}>
              {picked.length > 0 ? t("firstRecipes.save", { count: picked.length }) : t("firstRecipes.pickOne")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PickTile({
  card,
  selected,
  fitsDiet,
  onToggle,
}: {
  card: RecipeCard;
  selected: boolean;
  fitsDiet: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const duration = card.estimated_time_minutes
    ? formatRecipeDuration(card.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })
    : null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-track="first_recipes.toggle"
      onClick={onToggle}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border-2 bg-surface text-start shadow-soft transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        selected ? "border-primary" : "border-transparent hover:border-border",
      )}
    >
      <RecipeThumb src={card.image_url} className="aspect-[4/3] w-full rounded-none" />
      <span
        aria-hidden
        className={cn(
          "absolute end-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-transparent",
        )}
      >
        <Check className="h-4 w-4" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="line-clamp-2 text-sm font-bold leading-snug text-text">{card.title}</span>
        <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {fitsDiet ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">{t("firstRecipes.fitsDiet")}</span>
          ) : null}
          {duration ? (
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {duration}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
