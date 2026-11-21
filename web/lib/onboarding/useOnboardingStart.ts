"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { shouldOfferOnboarding } from "@shared/lib/onboardingAccount";
import { fetchOnboardingAccount } from "@shared/lib/supabase/onboarding";

import { finishOnboardingOnDevice, setOnboardingPending } from "@/lib/onboarding/device";
import { getSupabase } from "@/lib/supabase";

export type OnboardingStart = "checking" | "asking";

/**
 * Decides whether this account gets the first-run questions, from the server's copy of the account (the stored
 * session may predate a finish on the phone). An account that finished anywhere, or that's older than a day, goes
 * straight on with `onNotNeeded`. Otherwise this browser remembers the questions are under way, so leaving halfway
 * comes back here.
 */
export function useOnboardingStart(
  user: Pick<User, "id" | "created_at" | "user_metadata">,
  onNotNeeded: () => void,
): OnboardingStart {
  const [state, setState] = useState<OnboardingStart>("checking");
  const leave = useRef(onNotNeeded);
  useEffect(() => {
    leave.current = onNotNeeded;
  });

  const userId = user.id;
  const sessionCopy = useRef(user);
  useEffect(() => {
    sessionCopy.current = user;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let account: Pick<User, "id" | "created_at" | "user_metadata"> = sessionCopy.current;
      try {
        account = (await fetchOnboardingAccount(getSupabase())) ?? account;
      } catch {
        // Offline or similar: the stored session's copy decides.
      }
      if (cancelled) return;
      if (shouldOfferOnboarding({ metadata: account.user_metadata, createdAt: account.created_at })) {
        setOnboardingPending(userId);
        setState("asking");
      } else {
        finishOnboardingOnDevice();
        leave.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
