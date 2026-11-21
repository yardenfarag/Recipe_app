"use client";

import { useEffect, useState } from "react";

import { createEditorState, type RecipeEditorState } from "@shared/lib/recipeEditor";
import { fetchRecipeById } from "@shared/lib/supabase/recipes";

export type EditorLoad =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; initial: RecipeEditorState };

type Loaded = { id: string; result: "missing" | "error" | RecipeEditorState };

/**
 * The form's starting state: a blank recipe to write (no id), or a saved recipe to edit, loaded once. It is never
 * reloaded behind the cook's back (a language change, a focus), which would wipe what they typed. The recipe is
 * edited in its own language, as on mobile: a translation is only for reading.
 */
export function useEditorRecipe(id: string | null): EditorLoad {
  const [blank] = useState(() => createEditorState());
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchRecipeById(id)
      .then((recipe) => (recipe ? createEditorState(recipe) : ("missing" as const)))
      .catch(() => "error" as const)
      .then((result) => {
        if (!cancelled) setLoaded({ id, result });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (!id) return { status: "ready", initial: blank };
  if (!loaded || loaded.id !== id) return { status: "loading" };
  if (loaded.result === "missing") return { status: "missing" };
  if (loaded.result === "error") {
    return {
      status: "error",
      retry: () => {
        setLoaded(null);
        setAttempt((n) => n + 1);
      },
    };
  }
  return { status: "ready", initial: loaded.result };
}
