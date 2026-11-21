"use client";

import type { CreditPackId } from "@shared/lib/creditPacks";
import { CheckoutError, startCreditCheckout } from "@shared/lib/supabase/creditPurchases";
import { withoutCheckoutId } from "@shared/lib/webCheckoutReturn";

import { markSalesPausedByServer, webSalesOn } from "@/lib/credits/salesSwitch";
import { getSupabase } from "@/lib/supabase";

/**
 * Buying a pack: Polar's hosted checkout opens in this tab, and Polar sends the buyer back to the page they were on
 * with `?checkout_id=…` (see useCheckoutReturn). What survives the trip is kept in sessionStorage: it belongs to this
 * tab, and outlives the page reload that coming back is.
 */

/** The same key as the Expo web app, so a checkout started there and finished here still counts from its start. */
const STARTED_KEY = "pinch.webCheckoutStartedAt";
/** A return still waiting for its credits, so a reload keeps waiting instead of forgetting the payment. */
const PENDING_KEY = "pinch.webCheckoutReturn";
/** Checkouts already answered, so going back to an old `?checkout_id=` address doesn't announce it twice. */
const HANDLED_KEY = "pinch.webCheckoutHandled";

/** After this long without the credits, stop checking (the "slow" message has told them what to do). */
export const RETURN_GIVE_UP_MS = 10 * 60_000;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) storage()?.removeItem(key);
    else storage()?.setItem(key, value);
  } catch {
    // Storage blocked: the return still works in this page, from a 30-minute window.
  }
}

/**
 * Opens Polar's checkout for `packId` in this tab. Resolves just before the tab moves on; rejects with a
 * CheckoutError ("sales_off" also turns the packs off for this visit).
 */
export async function startCheckout(
  packId: CreditPackId,
  { now = Date.now, navigate = (url: string) => window.location.assign(url) }: { now?: () => number; navigate?: (url: string) => void } = {},
): Promise<void> {
  if (!webSalesOn()) throw new CheckoutError("sales_off");
  getSupabase();
  let url: string;
  try {
    url = await startCreditCheckout(packId, withoutCheckoutId(window.location.href));
  } catch (error) {
    if (error instanceof CheckoutError && error.reason === "sales_off") markSalesPausedByServer();
    throw error instanceof CheckoutError ? error : new CheckoutError("unavailable");
  }
  write(STARTED_KEY, String(now()));
  navigate(url);
}

export function readCheckoutStarted(): number | null {
  const value = Number(read(STARTED_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function clearCheckoutStarted(): void {
  write(STARTED_KEY, null);
}

export type PendingReturn = {
  checkoutId: string;
  /** Purchases from this time on count (ISO). */
  since: string;
  /** When the buyer came back (ms). */
  returnedAt: number;
  /** They closed the dialog: keep checking, and say it with a toast instead. */
  quiet: boolean;
};

function isPending(value: unknown): value is PendingReturn {
  const pending = value as Partial<PendingReturn> | null;
  return (
    typeof pending?.checkoutId === "string" &&
    typeof pending.since === "string" &&
    typeof pending.returnedAt === "number" &&
    typeof pending.quiet === "boolean"
  );
}

export function readPendingReturn(now: number = Date.now()): PendingReturn | null {
  try {
    const parsed: unknown = JSON.parse(read(PENDING_KEY) ?? "null");
    if (!isPending(parsed) || now - parsed.returnedAt > RETURN_GIVE_UP_MS || parsed.returnedAt > now + 60_000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingReturn(pending: PendingReturn | null): void {
  write(PENDING_KEY, pending ? JSON.stringify(pending) : null);
}

function handledIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(HANDLED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function wasHandled(checkoutId: string): boolean {
  return handledIds().includes(checkoutId);
}

export function markHandled(checkoutId: string): void {
  write(HANDLED_KEY, JSON.stringify([...handledIds().filter((id) => id !== checkoutId), checkoutId].slice(-10)));
}
