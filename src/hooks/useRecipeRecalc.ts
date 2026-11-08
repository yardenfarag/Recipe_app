import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import {
  RECALC_POLL_MS,
  recalcUpdatingFields,
  recipeRecalcState,
  type RecipeRecalcState,
} from '@/lib/recipeRecalc';
import { fetchRecipeById } from '@/lib/supabase/recipes';
import { saveRecipeEdit } from '@/lib/supabase/saveRecipeEdit';
import type { RecalcField, Recipe } from '@/types/recipe';

/**
 * Background recalculation on the recipe detail screen (ADR 018).
 *
 * - While a field is recalculating, re-reads the row every few seconds until nothing is pending
 *   or two minutes have passed, and returns the fields to show as "Updating…".
 * - When the recipe opens with fields left pending by a failed or capped run, asks the server to
 *   retry them once. A `limited` answer (past the daily cap) shows the current values, no spinner.
 *
 * Saved recipes only: guest recipes never recalculate.
 */
export function useRecipeRecalc(
  recipe: Recipe | null | undefined,
  onRefreshed: (next: Recipe) => void,
): RecalcField[] {
  const { language } = useLanguagePreference();
  const focused = useIsFocused();
  const [tick, setTick] = useState(0);
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;
  /** The state each recipe had when it first opened on this screen. */
  const openedAs = useRef(new Map<string, RecipeRecalcState['kind']>());
  const retried = useRef(new Set<string>());
  const limited = useRef(new Set<string>());
  const seen = useRef<{ key: string; at: number } | null>(null);

  const id = recipe?.id;
  const cloud = Boolean(id && recipe?.user_id && !id.startsWith('guest-'));
  const runKey = `${id}:${recipe?.recalc_started_at ?? ''}`;
  if (seen.current?.key !== runKey) seen.current = { key: runKey, at: Date.now() };

  const state: RecipeRecalcState =
    cloud && id && !limited.current.has(id)
      ? recipeRecalcState(recipe, Date.now(), seen.current.at)
      : { kind: 'idle' };
  if (cloud && id && !openedAs.current.has(id)) openedAs.current.set(id, state.kind);

  // Retry once when the recipe opened with a run that had already failed.
  const shouldRetry = Boolean(id && openedAs.current.get(id) === 'stale' && !retried.current.has(id));
  useEffect(() => {
    if (!id || !shouldRetry) return;
    retried.current.add(id);
    void saveRecipeEdit({ mode: 'retry', recipe_id: id, app_language: language }).then((result) => {
      if (result.status !== 'saved') return;
      if (result.recalculation === 'limited') limited.current.add(id);
      onRefreshedRef.current(result.recipe);
    });
  }, [id, shouldRetry, language]);

  // Poll while something is updating and the screen is in front.
  const updating = state.kind === 'updating';
  useEffect(() => {
    if (!id || !updating || !focused) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchRecipeById(id)
        .then((fresh) => {
          if (!cancelled && fresh) onRefreshedRef.current(fresh);
        })
        .catch(() => {
          // Keep showing what we have; the next tick tries again.
        })
        // Re-render even when nothing changed, so the two-minute cut-off and the next poll happen.
        .finally(() => setTick((n) => n + 1));
    }, RECALC_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, updating, focused, tick]);

  return recalcUpdatingFields(state);
}
