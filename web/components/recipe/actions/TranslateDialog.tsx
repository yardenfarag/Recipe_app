"use client";

import { Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RECIPE_LANGUAGES, type RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";

import type { RecipeDisplay } from "@/components/recipe/types";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { translateFailure, type TranslateOutcome } from "@/lib/recipe/actions/translate";

type Props = {
  open: boolean;
  display: RecipeDisplay;
  onClose: () => void;
  onTranslate: (language: RecipeLanguageCode) => Promise<TranslateOutcome>;
  onShowOriginal: () => void;
};

/**
 * Translate (ADR 012): every recipe language, each in its own name, with the one on screen ticked. A translation
 * is made from the recipe's own words and saved, so coming back to it is instant. While one is on screen, "Original
 * language" goes back.
 */
export function TranslateDialog({ open, display, onClose, onTranslate, onShowOriginal }: Props) {
  const [loading, setLoading] = useState<RecipeLanguageCode | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      {open ? <Body display={display} onClose={onClose} onTranslate={onTranslate} onShowOriginal={onShowOriginal} loading={loading} setLoading={setLoading} /> : null}
    </Dialog>
  );
}

function Body({
  display,
  onClose,
  onTranslate,
  onShowOriginal,
  loading,
  setLoading,
}: Omit<Props, "open"> & { loading: RecipeLanguageCode | null; setLoading: (language: RecipeLanguageCode | null) => void }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const source = resolveRecipeSourceLanguage(display.recipe);
  const showing = display.contentLanguage;

  async function choose(language: RecipeLanguageCode) {
    if (loading) return;
    if (language === showing) {
      onClose();
      return;
    }
    if (language === source) {
      onShowOriginal();
      onClose();
      return;
    }
    setLoading(language);
    setError(null);
    try {
      const outcome = await onTranslate(language);
      if (outcome.status === "failed") {
        setError(translateFailure(outcome, t));
        return;
      }
      onClose();
    } catch {
      setError(t("web.recipeActions.translateFailed"));
    } finally {
      setLoading(null);
    }
  }

  const row =
    "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <DialogContent title={t("recipe.translateTitle")} description={t("web.recipeActions.translateHint")} className="max-w-md">
      {error ? (
        <p role="alert" className="mb-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <ul className="-mx-1 flex max-h-[min(60dvh,30rem)] flex-col gap-2 overflow-y-auto px-1 pb-1">
        {display.translated ? (
          <li>
            <button
              type="button"
              disabled={loading != null}
              onClick={() => {
                onShowOriginal();
                onClose();
              }}
              className={cn(row, "border-border bg-surface hover:bg-surface-soft")}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-text">{t("recipe.originalLanguage")}</span>
                <span className="block text-[13px] text-muted">{t("recipe.originalLanguageHint")}</span>
              </span>
              <Undo2 aria-hidden className="h-[18px] w-[18px] shrink-0 text-primary rtl:-scale-x-100" />
            </button>
          </li>
        ) : null}
        {RECIPE_LANGUAGES.map((language) => {
          const current = language.code === showing;
          const busy = loading === language.code;
          const localName = t(`languages.${language.code}`);
          return (
            <li key={language.code}>
              <button
                type="button"
                lang={language.code}
                aria-current={current ? "true" : undefined}
                aria-busy={busy || undefined}
                disabled={loading != null && !busy}
                onClick={() => void choose(language.code)}
                className={cn(row, current ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-soft")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-text">{language.nativeLabel}</span>
                  {localName !== language.nativeLabel ? (
                    <span lang={i18n.language} className="block text-[13px] text-muted">
                      {localName}
                      {language.code === source ? ` · ${t("web.recipeActions.originalBadge")}` : ""}
                    </span>
                  ) : language.code === source ? (
                    <span lang={i18n.language} className="block text-[13px] text-muted">
                      {t("web.recipeActions.originalBadge")}
                    </span>
                  ) : null}
                </span>
                {busy ? (
                  <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-primary-soft border-t-primary" />
                ) : current ? (
                  <Check aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </DialogContent>
  );
}
