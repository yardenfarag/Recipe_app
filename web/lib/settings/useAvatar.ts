"use client";

import { useEffect, useSyncExternalStore } from "react";

import { fetchAvatarValue } from "@shared/lib/supabase/profile";

import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";

/** Each account's `avatar_url` as this page knows it: read once, then updated when Settings changes it. */
const known = new Map<string, string | null>();
const reads = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function load(userId: string): void {
  if (known.has(userId) || reads.has(userId)) return;
  reads.add(userId);
  void (async () => {
    try {
      getSupabase();
      const value = await fetchAvatarValue(userId);
      // A change announced while this read was out is newer than what it brought back.
      if (!known.has(userId)) {
        known.set(userId, value);
        emit();
      }
    } catch {
      // No picture is fine: the menu shows the email's first letter. The next page load tries again.
    } finally {
      reads.delete(userId);
    }
  })();
}

/** Tell every avatar on the page that the profile picture changed (Settings calls this after saving one). */
export function announceAvatar(userId: string, value: string | null): void {
  known.set(userId, value);
  emit();
}

/** For tests: forget what was read. */
export function forgetAvatars(): void {
  known.clear();
  reads.clear();
}

/** The signed-in account's `avatar_url` (a photo URL or a food avatar), or null while it loads or when there is none. */
export function useAvatar(): string | null {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (userId) load(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribe,
    () => (userId ? (known.get(userId) ?? null) : null),
    () => null,
  );
}
