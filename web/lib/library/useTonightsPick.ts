"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { nextTonightsPick, pickDay, tonightsPick, type TonightsPickMemory } from "@shared/lib/tonightsPick";
import type { Recipe } from "@shared/types/recipe";

const STORAGE_KEY = "pinch:tonightsPick";
const listeners = new Set<() => void>();
/** When storage is blocked, the pick lasts until the page closes. */
let fallback: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(memory: TonightsPickMemory) {
  const raw = JSON.stringify(memory);
  fallback = raw;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Kept in `fallback` for this visit.
  }
  for (const listener of listeners) listener();
}

function parse(raw: string | null): TonightsPickMemory | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TonightsPickMemory>;
    return typeof value.day === "string" && typeof value.recipeId === "string" ? { day: value.day, recipeId: value.recipeId } : null;
  } catch {
    return null;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/**
 * Tonight's pick for the Library (PIN-161): chosen by the shared rule (shared/lib/tonightsPick.ts), remembered in
 * this browser for the day so a reload shows the same recipe, and moved on by "Show me another". `another` is null
 * when there is nothing else to offer.
 */
export function useTonightsPick(recipes: Recipe[]): { pick: Recipe | null; another: (() => void) | null } {
  // The day the page was opened on. A tab left open past midnight keeps yesterday's pick until it is reloaded.
  const [now] = useState(() => new Date());
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const memory = useMemo(() => parse(raw), [raw]);

  const pick = useMemo(() => tonightsPick(recipes, now, memory), [recipes, now, memory]);
  const next = useMemo(() => (pick ? nextTonightsPick(recipes, now, pick.id) : null), [recipes, now, pick]);

  // Remember what is showing, so it stays when more recipes load or the page is reloaded.
  const pickId = pick?.id;
  useEffect(() => {
    if (!pickId) return;
    const day = pickDay(now);
    if (memory?.day === day && memory.recipeId === pickId) return;
    write({ day, recipeId: pickId });
  }, [pickId, now, memory]);

  const nextId = next?.id;
  const another = useCallback(() => {
    if (nextId) write({ day: pickDay(now), recipeId: nextId });
  }, [nextId, now]);

  return { pick, another: nextId ? another : null };
}
