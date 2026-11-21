"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The fewest and the most servings the stepper offers. A recipe that already serves more keeps its own count. */
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 99;

const keyFor = (recipeId: string) => `pinch:servings:${recipeId}`;
const listeners = new Set<() => void>();
/** When storage is blocked, the choice lasts until the page closes. */
const memory = new Map<string, number>();
let storageFailed = false;

function readSaved(recipeId: string): number | null {
  if (storageFailed) return memory.get(recipeId) ?? null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(keyFor(recipeId));
  } catch {
    return memory.get(recipeId) ?? null;
  }
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= MIN_SERVINGS ? value : null;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/** Keeps a count between 1 and 99, or the recipe's own count when that is higher. */
export function clampServings(servings: number, recipeServings: number): number {
  const max = Math.max(MAX_SERVINGS, recipeServings);
  return Math.min(max, Math.max(MIN_SERVINGS, Math.round(servings)));
}

/**
 * The serving count the reader chose for this recipe, remembered in this browser. Like the mobile app, it never
 * changes the recipe itself: amounts always scale from the recipe's own count. Null until that count is known.
 */
export function useServings(recipeId: string, recipeServings: number | null): { servings: number | null; setServings: (servings: number) => void } {
  const saved = useSyncExternalStore(
    subscribe,
    () => readSaved(recipeId),
    () => null,
  );

  const setServings = useCallback(
    (next: number) => {
      if (recipeServings == null) return;
      const value = clampServings(next, recipeServings);
      // Back at the recipe's own count, forget the choice so the page follows the recipe if it is edited.
      const forget = value === recipeServings;
      if (forget) memory.delete(recipeId);
      else memory.set(recipeId, value);
      try {
        if (forget) window.localStorage.removeItem(keyFor(recipeId));
        else window.localStorage.setItem(keyFor(recipeId), String(value));
      } catch {
        storageFailed = true; // Kept in memory instead.
      }
      for (const listener of listeners) listener();
    },
    [recipeId, recipeServings],
  );

  const own = recipeServings == null ? null : Math.max(MIN_SERVINGS, recipeServings);
  const servings = own == null ? null : saved == null ? own : clampServings(saved, own);
  return { servings, setServings };
}
