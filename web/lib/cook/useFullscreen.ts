"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

/**
 * The browser's full screen, for cook mode on a laptop or tablet: no tabs or address bar, only the step.
 * `supported` is false where the page can't ask for it (iPhone Safari, some embedded browsers), so the button hides.
 */
export function useFullscreen() {
  const supported = useSyncExternalStore(
    subscribe,
    () => document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
  const active = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement != null,
    () => false,
  );

  const enter = useCallback(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  }, []);

  return { supported, active, enter, exit, toggle: active ? exit : enter };
}
