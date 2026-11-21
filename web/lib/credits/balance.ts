"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { fetchProfile, profileQuota, type ProfileQuota } from "@shared/lib/supabase/profile";
import { announceCreditsChanged, onCreditsChanged } from "@shared/lib/webCheckoutReturn";

import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";

/**
 * The signed-in person's recipe credits, read once and shared by everything that shows them (the account menu, the
 * credits page, the out-of-credits prompt). Any screen that spends or adds credits calls `refreshCredits()`, and
 * every balance on the page updates without a reload.
 *
 * It is read again when the tab comes back into view after a while, so credits bought on the phone show up too.
 */

type Snapshot = {
  userId: string | null;
  quota: ProfileQuota | null;
  /** Read at least once for this user (even if it failed). */
  settled: boolean;
  failed: boolean;
};

const EMPTY: Snapshot = { userId: null, quota: null, settled: false, failed: false };
/** Coming back to the tab after this long reads the balance again. */
const STALE_AFTER_MS = 60_000;

let snapshot: Snapshot = EMPTY;
let loadedAt = 0;
let inFlight: { userId: string; promise: Promise<void> } | null = null;
let queued = false;
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function read(userId: string): Promise<void> {
  try {
    getSupabase();
    const quota = profileQuota(await fetchProfile(userId));
    // Signed out or switched account meanwhile: this answer is for nobody.
    if (snapshot.userId !== userId) return;
    loadedAt = Date.now();
    emit({ userId, quota, settled: true, failed: false });
  } catch {
    if (snapshot.userId !== userId) return;
    // Keep showing the last balance we had; it is only out of date.
    emit({ userId, quota: snapshot.quota, settled: true, failed: true });
  }
}

function load(userId: string): Promise<void> {
  if (inFlight?.userId === userId) {
    // A change arrived while reading: read once more after this one, so the newest balance wins.
    queued = true;
    return inFlight.promise;
  }
  const promise: Promise<void> = read(userId).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
    if (queued && snapshot.userId === userId) {
      queued = false;
      void load(userId);
    }
  });
  inFlight = { userId, promise };
  return promise;
}

/** Starts (or switches to) reading `userId`'s balance. */
function track(userId: string | null) {
  if (snapshot.userId === userId) return;
  queued = false;
  emit({ ...EMPTY, userId });
  if (userId) void load(userId);
}

let stopWatching: (() => void) | null = null;

function watchPage() {
  const reload = () => {
    if (snapshot.userId) void load(snapshot.userId);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && Date.now() - loadedAt > STALE_AFTER_MS) reload();
  };
  const stopChanges = onCreditsChanged(reload);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopChanges();
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopWatching && typeof window !== "undefined") stopWatching = watchPage();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/**
 * Reads the balance again everywhere it is shown: call it after an action spends credits, or after a purchase.
 * Also tells other listeners on the page (`onCreditsChanged` in shared/lib/webCheckoutReturn.ts).
 */
export function refreshCredits(): void {
  announceCreditsChanged();
}

export type CreditBalance = {
  /** Free this month + purchased. Null while it loads, or if it couldn't be read. */
  quota: ProfileQuota | null;
  /** The first read hasn't finished. */
  loading: boolean;
  /** The last read failed (the last known balance, if any, is still in `quota`). */
  failed: boolean;
  /** Reads it again and waits for the answer. */
  refresh: () => Promise<void>;
};

export function useCreditBalance(): CreditBalance {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    track(userId);
  }, [userId]);

  const refresh = useCallback(async () => {
    if (userId) await load(userId);
  }, [userId]);

  // Never another account's balance, after switching.
  const mine = current.userId === userId ? current : EMPTY;
  return { quota: mine.quota, loading: Boolean(userId) && !mine.settled, failed: mine.failed, refresh };
}

/** For tests: forget everything. */
export function resetCreditBalance(): void {
  snapshot = EMPTY;
  loadedAt = 0;
  inFlight = null;
  queued = false;
}
