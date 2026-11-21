"use client";

import { Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Recipe } from "@shared/types/recipe";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { refreshCredits } from "@/lib/credits/balance";
import { Spinner } from "@/components/ui/Spinner";
import { repairChange, type ContentChange } from "@/lib/recipe/actions/contentEdits";
import { applyRepair, declineRepair, findRepair, type RepairOffer } from "@/lib/recipe/actions/repair";

type Props = {
  open: boolean;
  recipe: Recipe;
  onClose: () => void;
  /** Saves the repaired recipe. Throws when saving failed. */
  onRepaired: (change: ContentChange) => Promise<void>;
  onOutOfCredits: (needed: number) => void;
};

type Stage =
  | { kind: "looking" }
  | { kind: "offer"; offer: RepairOffer; applying: boolean; error: string | null }
  | { kind: "failed"; message: string };

/**
 * Repair a partial import (ADR 019), in one dialog: Pinch looks for the missing details, says what it found, and the
 * reader applies it (one credit) or cancels (nothing is charged). Closing while it looks is blocked: the answer
 * holds a credit that has to be let go.
 */
export function RepairDialog(props: Props) {
  const { open, onClose } = props;
  const [locked, setLocked] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !locked && onClose()}>
      {open ? <Body {...props} onLock={setLocked} /> : null}
    </Dialog>
  );
}

function Body({ recipe, onClose, onRepaired, onOutOfCredits, onLock }: Props & { onLock: (locked: boolean) => void }) {
  const { t } = useTranslation();
  const [stage, setStageState] = useState<Stage>({ kind: "looking" });
  const setStage = (next: Stage) => {
    setStageState(next);
    onLock(next.kind === "looking" || (next.kind === "offer" && next.applying));
  };
  const offerRef = useRef<RepairOffer | null>(null);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    onLock(true);
    findRepair(recipe)
      .then((attempt) => {
        if (attempt.status === "no_credits") {
          onLock(false);
          onOutOfCredits(attempt.needed ?? 1);
          return;
        }
        if (attempt.status === "failed") {
          setStage({ kind: "failed", message: t(attempt.reason === "no_improvement" ? "recipe.repairNoImprovement" : "recipe.repairFailed") });
          return;
        }
        offerRef.current = attempt.offer;
        setStage({ kind: "offer", offer: attempt.offer, applying: false, error: null });
      })
      .catch(() => setStage({ kind: "failed", message: t("recipe.repairFailed") }));
    // Looks once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing with an offer still open lets its credit go.
  useEffect(
    () => () => {
      if (offerRef.current) void declineRepair(offerRef.current);
    },
    [],
  );

  async function apply(offer: RepairOffer) {
    setStage({ kind: "offer", offer, applying: true, error: null });
    try {
      const repaired = await applyRepair(offer);
      offerRef.current = null;
      if (!repaired) {
        setStage({ kind: "failed", message: t("recipe.repairFailed") });
        return;
      }
      // The credit is spent now, so every balance on the page catches up.
      refreshCredits();
      await onRepaired(repairChange(repaired));
      onLock(false);
      onClose();
    } catch {
      setStage({ kind: "failed", message: t("web.recipeActions.saveFailed") });
    }
  }

  if (stage.kind === "looking") {
    return (
      <DialogContent title={t("recipe.repairAction")}>
        <div aria-live="polite" className="flex justify-center py-8 text-sm">
          <Spinner label={t("web.recipeActions.repairing")} />
        </div>
      </DialogContent>
    );
  }

  if (stage.kind === "failed") {
    return (
      <DialogContent
        title={t("recipe.repairFailedTitle")}
        description={stage.message}
        footer={
          <DialogClose asChild>
            <Button>{t("common.close")}</Button>
          </DialogClose>
        }
      />
    );
  }

  return (
    <DialogContent
      title={t("recipe.repairApplyTitle")}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" disabled={stage.applying}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button busy={stage.applying} onClick={() => void apply(stage.offer)}>
            <Wrench aria-hidden className="h-4 w-4" />
            {t("recipe.repairApply")}
          </Button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed text-text">{stage.offer.summary ?? t("recipe.repairDefaultSummary")}</p>
      <p className="mt-3 text-sm text-muted">{t("recipe.repairHint")}</p>
      {stage.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {stage.error}
        </p>
      ) : null}
    </DialogContent>
  );
}
