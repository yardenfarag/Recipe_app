"use client";

import { useEffect } from "react";

import { logScreen, logTap, startActivityLog } from "@/lib/activity/activityLog";
import { useScreenName } from "@/lib/activity/screenName";
import { tapNameFor } from "@/lib/activity/tapName";

let warned = false;

/**
 * Mounted once, for every page (app/providers.tsx): logs a page view per route change and every press (ADR 020).
 * Renders nothing, and is its own component so a navigation re-renders only it.
 */
export function ActivityTracker() {
  const screen = useScreenName();

  useEffect(() => {
    startActivityLog();
    // Capture phase, so a handler that stops the click doesn't hide it from the log.
    const onClick = (event: MouseEvent) => {
      const name = tapNameFor(event.target);
      if (!name) return;
      if (name === "unnamed" && process.env.NODE_ENV === "development" && !warned) {
        warned = true;
        console.warn('[activity] A press without a trackId (or data-track) is logged as "unnamed".', event.target);
      }
      logTap(name);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    logScreen(screen);
  }, [screen]);

  return null;
}
