"use client";

import { useEffect, useState } from "react";

export type WakeLockState = "on" | "off" | "unsupported";

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

function wakeLockApi(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

/**
 * Keeps the screen on while `active`, where the browser allows it (the Screen Wake Lock API). The browser drops
 * the lock when the tab is hidden, so it is asked for again when the tab comes back. "off" means it was refused
 * (battery saver, an iframe without permission), so the page can stay quiet about it.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>(() => (wakeLockApi() ? "off" : "unsupported"));

  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await api.request("screen");
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
        setState("on");
        next.addEventListener("release", () => {
          if (!cancelled) setState("off");
        });
      } catch {
        if (!cancelled) setState("off");
      }
    };

    const onVisibility = () => void request();
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release();
      setState("off");
    };
  }, [active]);

  return state;
}
