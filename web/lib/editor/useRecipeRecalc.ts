"use client";

import { useEffect, useRef, useState } from "react";

import { RECALC_POLL_MS, recalcUpdatingFields, recipeRecalcState } from "@shared/lib/recipeRecalc";
import { fetchRecipeById } from "@shared/lib/supabase/recipes";
import { saveRecipeEdit } from "@shared/lib/supabase/saveRecipeEdit";
import type { RecalcField, Recipe } from "@shared/types/recipe";

import { useLanguage } from "@/components/LanguageProvider";

/**
 * The background recalculation after a hand edit (ADR 018), for the recipe page: the web's take on mobile's
 * src/hooks/useRecipeRecalc.ts.
 *
 * - While fields recalculate, re-reads the recipe every few seconds (while the tab is visible) until nothing is
 *   pending or two minutes have passed, and returns the fields to show as "Updating…" (recipeEditor.updating).
 * - When a recipe opens with fields left pending by a failed or capped run, asks the server once to retry them.
 *
 * `onRefreshed` gets the newer row each time it changes.
 */
export function useRecipeRecalc(recipe: Recipe | null | undefined, onRefreshed: (next: Recipe) => void): RecalcField[] {
  const { language } = useLanguage();
  const onRefreshedRef = useRef(onRefreshed);
  const recipeRef = useRef(recipe);
  useEffect(() => {
    onRefreshedRef.current = onRefreshed;
    recipeRef.current = recipe;
  });

  const id = recipe?.id ?? null;
  const runKey = `${id}:${recipe?.recalc_started_at ?? ""}`;
  /** When this tab first saw the current run, so a server clock ahead of ours can't stretch "Updating…". */
  const [seen, setSeen] = useState<{ key: string; at: number } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [limited, setLimited] = useState<string | null>(null);
  const retried = useRef(new Set<string>());

  useEffect(() => {
    // The clock is read once per run, after render (reading it while rendering would differ between renders).
    const at = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen((previous) => (previous?.key === runKey ? previous : { key: runKey, at }));
    setNow(at);
  }, [runKey]);

  const state =
    id && now !== null && limited !== id && seen?.key === runKey ? recipeRecalcState(recipe, now, seen.at) : ({ kind: "idle" } as const);

  // Retry once a run that had already failed when the recipe opened.
  const stale = state.kind === "stale";
  useEffect(() => {
    if (!id || !stale || retried.current.has(id)) return;
    retried.current.add(id);
    void saveRecipeEdit({ mode: "retry", recipe_id: id, app_language: language }).then((result) => {
      if (result.status !== "saved") return;
      if (result.recalculation === "limited") setLimited(id);
      onRefreshedRef.current(result.recipe);
    });
  }, [id, stale, language]);

  // Poll while something is updating.
  const updating = state.kind === "updating";
  useEffect(() => {
    if (!id || !updating) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") {
        setNow(Date.now());
        return;
      }
      fetchRecipeById(id)
        .then((fresh) => {
          if (cancelled || !fresh || JSON.stringify(fresh) === JSON.stringify(recipeRef.current)) return;
          onRefreshedRef.current(fresh);
        })
        .catch(() => {
          // Keep what we have; the next tick tries again.
        })
        // Even with nothing new, so the two-minute cut-off and the next poll happen.
        .finally(() => {
          if (!cancelled) setNow(Date.now());
        });
    }, RECALC_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, updating, now]);

  return recalcUpdatingFields(state);
}
