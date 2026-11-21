"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { purchasedCreditsSince } from "@shared/lib/supabase/creditPurchases";
import { checkoutIdFrom, checkoutSinceIso, withoutCheckoutId } from "@shared/lib/webCheckoutReturn";

import { useAuth } from "@/components/AuthProvider";
import { refreshCredits } from "@/lib/credits/balance";
import {
  clearCheckoutStarted,
  markHandled,
  readCheckoutStarted,
  readPendingReturn,
  RETURN_GIVE_UP_MS,
  savePendingReturn,
  wasHandled,
  type PendingReturn,
} from "@/lib/credits/checkout";
import { getSupabase } from "@/lib/supabase";

/** Past this, say the credits are on their way rather than keep a spinner going. */
export const SLOW_AFTER_MS = 40_000;

/**
 * How long to wait before checking again, `elapsed` ms after coming back: every 2 s at first (the webhook usually
 * lands within seconds), every 5 s once it's slow, and not at all after RETURN_GIVE_UP_MS.
 */
export function pollDelay(elapsed: number): number | null {
  if (elapsed < SLOW_AFTER_MS) return 2_000;
  if (elapsed < RETURN_GIVE_UP_MS) return 5_000;
  return null;
}

export type CheckoutReturnState =
  | { kind: "waiting" }
  | { kind: "slow" }
  | { kind: "added"; credits: number }
  | null;

/**
 * Notices a return from Polar's checkout and waits for polar-webhook to add the credits, then refreshes every balance
 * on the page. A reload while waiting carries on waiting. Cancelling the checkout comes back without
 * `?checkout_id=`, so nothing shows.
 *
 * Run it in one place only (see CheckoutReturnDialog). `onQuietlyAdded` is called when the credits land after the
 * dialog was closed.
 */
export function useCheckoutReturn({
  enabled,
  onQuietlyAdded,
}: {
  enabled: boolean;
  onQuietlyAdded: (credits: number) => void;
}): { state: CheckoutReturnState; dismiss: () => void } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<CheckoutReturnState>(null);
  const pending = useRef<PendingReturn | null>(null);
  const quietCallback = useRef(onQuietlyAdded);

  useEffect(() => {
    quietCallback.current = onQuietlyAdded;
  }, [onQuietlyAdded]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const now = Date.now();
    const href = window.location.href;
    const checkoutId = checkoutIdFrom(href);
    let current: PendingReturn | null;
    if (checkoutId) {
      // A reload or a shared address shouldn't start this again.
      window.history.replaceState(window.history.state, "", withoutCheckoutId(href));
      current = wasHandled(checkoutId)
        ? null
        : { checkoutId, since: checkoutSinceIso(readCheckoutStarted(), now), returnedAt: now, quiet: false };
      clearCheckoutStarted();
      savePendingReturn(current);
    } else {
      current = readPendingReturn(now);
    }
    pending.current = current;
    if (!current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (next: CheckoutReturnState) => {
      if (!cancelled && !pending.current?.quiet) setState(next);
    };

    const check = async () => {
      const active = pending.current;
      if (!active) return;
      let credits: number | null = null;
      try {
        getSupabase();
        credits = await purchasedCreditsSince(userId, active.since);
      } catch {
        // Offline for a moment: try again on the next tick.
      }
      if (cancelled) return;
      if (credits) {
        markHandled(active.checkoutId);
        savePendingReturn(null);
        pending.current = null;
        refreshCredits();
        if (active.quiet) quietCallback.current(credits);
        else setState({ kind: "added", credits });
        return;
      }
      const elapsed = Date.now() - active.returnedAt;
      const delay = pollDelay(elapsed);
      if (elapsed >= SLOW_AFTER_MS) show({ kind: "slow" });
      if (delay == null) {
        // Stop asking. The slow message already says to contact support if they don't show up.
        savePendingReturn(null);
        return;
      }
      timer = setTimeout(() => void check(), delay);
    };

    show(now - current.returnedAt >= SLOW_AFTER_MS ? { kind: "slow" } : { kind: "waiting" });
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, userId]);

  const dismiss = useCallback(() => {
    setState(null);
    const active = pending.current;
    if (active && !active.quiet) {
      active.quiet = true;
      savePendingReturn(active);
    }
  }, []);

  return { state, dismiss };
}
