"use client";

import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { displayIngredientAmount } from "@shared/lib/displayIngredientAmount";
import type { SubstitutionAlternative } from "@shared/lib/supabase/suggestSubstitution";
import type { Instruction } from "@shared/types/recipe";

import type { RecipeDisplay } from "@/components/recipe/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { findAlternatives, stepsAfterSwap, type SwapTarget } from "@/lib/recipe/actions/swap";

type Props = {
  target: SwapTarget | null;
  display: RecipeDisplay;
  system: MeasurementSystem;
  onClose: () => void;
  /** Saves the swap. Throws when saving failed; the dialog stays open and says so. */
  onApply: (target: SwapTarget, alternative: SubstitutionAlternative, instructions: Instruction[]) => Promise<void>;
};

/**
 * Swap one ingredient (ADR 005): what it replaces at the top, then two or three alternatives, each with why it
 * works and "Use this". Using one rewrites the steps to match before anything is saved, so a failure leaves the
 * recipe as it was.
 */
export function SwapDialog({ target, display, system, onClose, onApply }: Props) {
  const [applying, setApplying] = useState(false);
  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && !applying && onClose()}>
      {target ? (
        <Body
          key={`${target.index}:${target.ingredient.name}`}
          target={target}
          display={display}
          system={system}
          onApplying={setApplying}
          onApplied={onClose}
          onApply={onApply}
        />
      ) : null}
    </Dialog>
  );
}

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; alternatives: SubstitutionAlternative[] };

function Body({
  target,
  display,
  system,
  onApplying,
  onApplied,
  onApply,
}: Omit<Props, "target" | "onClose"> & { target: SwapTarget; onApplying: (busy: boolean) => void; onApplied: () => void }) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Suggestions match the supermarket of the language on screen when a translation is showing (as on mobile).
  const language = display.translated ? display.contentLanguage : null;
  const amount = (item: Parameters<typeof displayIngredientAmount>[0]) => displayIngredientAmount(item, { system, language: display.unitLanguage });

  useEffect(() => {
    let cancelled = false;
    findAlternatives(target, { title: display.title, ingredients: display.ingredients, language }).then((alternatives) => {
      if (cancelled) return;
      setLoad(alternatives ? { status: "ready", alternatives } : { status: "failed" });
    });
    return () => {
      cancelled = true;
    };
    // One request per opening (and per "Try again"); the recipe changing under it doesn't ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function use(alternative: SubstitutionAlternative) {
    if (applying) return;
    setApplying(alternative.name);
    onApplying(true);
    setError(null);
    try {
      const steps = await stepsAfterSwap(target, alternative, { title: display.title, instructions: display.instructions, language });
      await onApply(target, alternative, steps);
      onApplying(false);
      onApplied();
    } catch {
      setError(t("web.recipeActions.saveFailed"));
      setApplying(null);
      onApplying(false);
    }
  }

  const original = `${amount(target.ingredient)} ${target.ingredient.name}`.trim();

  return (
    <DialogContent title={t("recipe.swapTitle")} className="max-w-lg">
      <div className="rounded-2xl bg-surface-soft px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t("recipe.swapInsteadOf")}</p>
        <p dir={display.direction} className="mt-0.5 text-start text-lg font-bold text-text">
          <bdi>{original}</bdi>
        </p>
      </div>

      <div aria-live="polite" className="mt-4">
        {load.status === "loading" ? (
          <div className="flex justify-center py-10 text-sm">
            <Spinner label={t("recipe.swapFinding")} />
          </div>
        ) : null}

        {load.status === "failed" ? (
          <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm">
            <p className="font-semibold text-danger">{t("recipe.swapFailed")}</p>
            <Button
              variant="link"
              className="mt-2 -ms-1"
              onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              {t("common.tryAgainAction")}
            </Button>
          </div>
        ) : null}

        {load.status === "ready" ? (
          <>
            <p className="sr-only">{t("a11y.suggestionsReady")}</p>
            <ul className="-mx-1 flex max-h-[min(55dvh,26rem)] flex-col gap-3 overflow-y-auto px-1 pb-1">
              {load.alternatives.map((alternative) => {
                const busy = applying === alternative.name;
                return (
                  <li key={alternative.name} className="rounded-2xl border border-border p-4">
                    <p dir={display.direction} className="text-start text-base font-bold text-text">
                      <bdi>{`${amount(alternative)} ${alternative.name}`.trim()}</bdi>
                    </p>
                    {alternative.reason ? <p className="mt-1 text-sm leading-relaxed text-muted">{alternative.reason}</p> : null}
                    <Button
                      size="sm"
                      className="mt-3"
                      busy={busy}
                      disabled={applying != null && !busy}
                      aria-label={busy ? t("recipe.swapUpdatingSteps") : t("a11y.useSubstitute", { name: alternative.name })}
                      onClick={() => void use(alternative)}
                    >
                      {busy ? null : <ArrowLeftRight aria-hidden className="h-4 w-4 rtl:rotate-180" />}
                      {busy ? t("recipe.swapUpdatingSteps") : t("recipe.swapUseThis")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </DialogContent>
  );
}
