"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * True for the first mounted instance of a component in the group `key`, false for the rest; when it unmounts the
 * next one takes over. For things that must happen once per page even though their component renders in more than
 * one place (the account menu is in the sidebar and the phone's top bar).
 */
const owners = new Map<string, symbol[]>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFirstMounted(key: string): boolean {
  const [id] = useState(() => Symbol(key));
  useEffect(() => {
    owners.set(key, [...(owners.get(key) ?? []), id]);
    emit();
    return () => {
      owners.set(
        key,
        (owners.get(key) ?? []).filter((owner) => owner !== id),
      );
      emit();
    };
  }, [id, key]);
  return useSyncExternalStore(
    subscribe,
    () => owners.get(key)?.[0] === id,
    () => false,
  );
}
