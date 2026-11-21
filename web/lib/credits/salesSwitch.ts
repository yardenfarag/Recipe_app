"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this site sells credit packs. Two switches turn web sales off, and the page treats both the same way
 * ("buy them in the Pinch app"), never as an error:
 *
 * - The build: `NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED` (the GitHub variable `EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED`,
 *   .github/workflows/deploy-web-app.yml). Previews build with it off (ADR 027).
 * - The server: polar-checkout answers `purchases_disabled` while `CREDIT_PURCHASES_ENABLED` is off. Once it has
 *   said so, this tab stops offering packs.
 */
export function salesOnInBuild(): boolean {
  // Written out in full so Next inlines it into the browser bundle.
  return process.env.NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED === "true";
}

let pausedByServer = false;
const listeners = new Set<() => void>();

/** polar-checkout said web sales are off. */
export function markSalesPausedByServer(): void {
  if (pausedByServer) return;
  pausedByServer = true;
  for (const listener of listeners) listener();
}

/** For tests. */
export function resetSalesSwitch(): void {
  pausedByServer = false;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function webSalesOn(): boolean {
  return salesOnInBuild() && !pausedByServer;
}

/** `webSalesOn()`, re-rendering when the server turns sales off mid-visit. */
export function useWebSalesOn(): boolean {
  return useSyncExternalStore(subscribe, webSalesOn, webSalesOn);
}
