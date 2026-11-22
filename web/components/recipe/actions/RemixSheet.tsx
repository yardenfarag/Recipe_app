"use client";

import {
  Bone,
  Carrot,
  ChevronRight,
  Dumbbell,
  Egg,
  Fish,
  Grape,
  Leaf,
  MilkOff,
  Salad,
  Sprout,
  WheatOff,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { RECIPE_REMIX_LIMIT } from "@shared/lib/quotas";
import { RECIPE_VARIANTS, type RecipeVariantKey } from "@shared/lib/recipeVariants";
import type { TransformedRecipePayload } from "@shared/lib/supabase/transformRecipe";

import type { RecipeDisplay } from "@/components/recipe/types";
import { Button } from "@/components/ui/Button";
import { Sheet, SheetContent } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { remixFailureMessage, runRemix, type RemixRequest } from "@/lib/recipe/actions/remix";

type StyleKey = Exclude<RecipeVariantKey, "custom">;

const STYLE_ICONS: Record<StyleKey, LucideIcon> = {
  healthier: Leaf,
  vegan: Sprout,
  vegetarian: Carrot,
  gluten_free: WheatOff,
  dairy_free: MilkOff,
  low_carb: Salad,
  high_protein: Dumbbell,
  keto: Egg,
  mediterranean: Grape,
  paleo: Bone,
  pescatarian: Fish,
};

const STYLES = RECIPE_VARIANTS.filter((variant) => variant.key !== "custom").map((variant) => variant.key as StyleKey);

/** The most a custom request can say; the server cuts it there too. */
const MAX_INSTRUCTION = 400;

type Props = {
  open: boolean;
  /** "Make it without these": run this request as soon as the sheet opens, and land on the result. */
  preset: string | null;
  /** The reader's allergies, added to every remix so an adapted recipe never brings one in. */
  allergies: string | null;
  /** A line under the result, such as the reminder to check labels. */
  notice?: string;
  display: RecipeDisplay;
  onClose: () => void;
  /**
   * Saves the version; `fix` is true for the "Make it without these" result. Throws when saving failed; the sheet
   * stays open and says so.
   */
  onApply: (result: TransformedRecipePayload, variant: RecipeVariantKey, fix: boolean) => Promise<void>;
  onOutOfCredits: (needed?: number) => void;
};

/**
 * Remix (healthier, vegan… or in your own words) and "Make it without these". The result is previewed with what
 * changed, and only replaces the recipe when the reader chooses "Use this version". A side panel on wide screens,
 * a sheet from the bottom on phones.
 */
export function RemixSheet(props: Props) {
  const { open, onClose } = props;
  const [locked, setLocked] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !locked && onClose()}>
      {open ? <Body {...props} onLock={setLocked} /> : null}
    </Sheet>
  );
}

type Stage =
  | { kind: "pick"; error: { message: string; retry: boolean } | null }
  | { kind: "working" }
  | { kind: "preview"; variant: RecipeVariantKey; fix: boolean; result: TransformedRecipePayload; saving: boolean; error: string | null };

function Body({ preset, allergies, notice, display, onClose, onApply, onOutOfCredits, onLock }: Props & { onLock: (locked: boolean) => void }) {
  const { t } = useTranslation();
  const [stage, setStageState] = useState<Stage>(preset ? { kind: "working" } : { kind: "pick", error: null });
  const [instruction, setInstruction] = useState("");
  const fieldId = useId();

  const setStage = (next: Stage) => {
    setStageState(next);
    onLock(next.kind === "working" || (next.kind === "preview" && next.saving));
  };

  async function run(variant: RecipeVariantKey, request: RemixRequest) {
    setStage({ kind: "working" });
    const outcome = await runRemix(display, request, allergies);
    if (outcome.status === "ok") {
      setStage({ kind: "preview", variant, fix: request.kind === "fix", result: outcome.result, saving: false, error: null });
      return;
    }
    if (outcome.reason === "no_credits") {
      setStage({ kind: "pick", error: null });
      onOutOfCredits(outcome.needed);
      return;
    }
    const [key, values] = remixFailureMessage(outcome.reason);
    setStage({ kind: "pick", error: { message: t(key, values), retry: outcome.reason !== "limit" } });
  }

  // "Make it without these" starts at once, once per opening.
  const started = useRef(false);
  useEffect(() => {
    if (!preset || started.current) return;
    started.current = true;
    void run("custom", { kind: "fix", instruction: preset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  function remixWithWords() {
    const words = instruction.trim();
    if (words) void run("custom", { kind: "remix", variant: "custom", instruction: words });
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter alone makes a new line; Ctrl/Cmd+Enter sends, as in most chat boxes.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      remixWithWords();
    }
  }

  async function use(preview: Extract<Stage, { kind: "preview" }>) {
    setStage({ ...preview, saving: true, error: null });
    try {
      await onApply(preview.result, preview.variant, preview.fix);
      onLock(false);
      onClose();
    } catch {
      setStage({ ...preview, saving: false, error: t("web.recipeActions.saveFailed") });
    }
  }

  const title = preset ? t("avoid.makeWithout") : t("recipe.remixTitle");

  return (
    <SheetContent
      title={title}
      description={display.title}
      footer={
        stage.kind === "preview" ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" trackId="recipe.remix.pick_different" disabled={stage.saving} onClick={() => setStage({ kind: "pick", error: null })}>
              {t("recipe.remixPickDifferent")}
            </Button>
            <Button trackId="recipe.remix.apply" busy={stage.saving} onClick={() => void use(stage)}>
              {t("recipe.remixUseVersion")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div aria-live="polite">
        {stage.kind === "working" ? (
          <div className="flex justify-center py-16 text-sm">
            <Spinner label={t("recipe.remixAdapting")} />
          </div>
        ) : null}

        {stage.kind === "preview" ? (
          <div>
            <div className="rounded-2xl bg-primary-soft px-4 py-4">
              <h3 className="font-sans text-[13px] font-semibold tracking-[0.06em] text-primary-text uppercase rtl:tracking-normal">{t("recipe.remixWhatChanged")}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-text">{stage.result.summary}</p>
            </div>
            {notice ? <p className="mt-3 text-xs leading-5 text-muted">{notice}</p> : null}
            {stage.error ? (
              <p role="alert" className="mt-4 text-sm font-medium text-danger">
                {stage.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {stage.kind === "pick" ? (
        <div className="flex flex-col gap-6">
          <p className="text-[15px] leading-relaxed text-muted">{t("recipe.remixHint", { limit: RECIPE_REMIX_LIMIT })}</p>

          {stage.error ? (
            <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm">
              <p className="font-medium text-danger">{stage.error.message}</p>
              {stage.error.retry ? (
                <Button variant="link" className="mt-1.5 -ms-1" trackId="recipe.remix.try_another" onClick={() => setStage({ kind: "pick", error: null })}>
                  {t("recipe.remixTryAnother")}
                </Button>
              ) : null}
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              remixWithWords();
            }}
          >
            <label htmlFor={fieldId} className="text-sm font-semibold text-text">
              {t("recipe.remixCustomTitle")}
            </label>
            <textarea
              id={fieldId}
              value={instruction}
              maxLength={MAX_INSTRUCTION}
              rows={3}
              placeholder={t("recipe.remixCustomPlaceholder")}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={onFieldKeyDown}
              className="mt-1.5 block w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <Button type="submit" variant="secondary" className="mt-2.5" trackId="recipe.remix.custom" disabled={!instruction.trim()} fullWidth>
              {t("recipe.remixCustomAction")}
            </Button>
          </form>

          <div>
            <h3 className="mb-2.5 text-sm font-semibold text-text">{t("web.recipeActions.pickStyle")}</h3>
            <ul className="flex flex-col gap-2">
              {STYLES.map((key) => {
                const Icon = STYLE_ICONS[key];
                return (
                  <li key={key}>
                    <button
                      type="button"
                      data-track={`recipe.remix.${key}`}
                      onClick={() => void run(key, { kind: "remix", variant: key })}
                      className={cn(
                        "flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface px-3.5 py-3 text-start transition-colors",
                        "hover:bg-element",
                      )}
                    >
                      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-text">{t(`recipe.variants.${key}.label`)}</span>
                        <span className="block text-sm text-muted">{t(`recipe.variants.${key}.description`)}</span>
                      </span>
                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </SheetContent>
  );
}
