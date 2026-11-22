"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { shouldOfferOnboarding } from "@shared/lib/onboardingAccount";

import { useAuth } from "@/components/AuthProvider";
import { LoadingState } from "@/components/ui/States";
import { clearOnboardingPending, isOnboardingPendingFor, isReturningBrowser, rememberReturningBrowser } from "@/lib/onboarding/device";
import { onboardingPathFor, WELCOME_PATH } from "@/lib/onboarding/paths";
import { signInPathFor } from "@/lib/nextPath";

/** Onboarding started on this browser and isn't finished, and the account still wants it (PIN-140). */
function unfinishedOnboarding(user: Pick<User, "id" | "created_at" | "user_metadata">): { pending: boolean; resume: boolean } {
  if (typeof window === "undefined" || !isOnboardingPendingFor(user.id)) return { pending: false, resume: false };
  return { pending: true, resume: shouldOfferOnboarding({ metadata: user.user_metadata, createdAt: user.created_at }) };
}

/**
 * Signed-in pages. A signed-out visitor goes to sign-in, then comes back to the page they asked for; a first-time
 * visitor at the front door (pinch-app.io/app/) sees the welcome page instead. A new account that left onboarding
 * half done on this browser goes back to finish it.
 * The session lives in the browser (ADR 026), so this check runs there, not on the server.
 */
export function RequireAuth({ children, resumeOnboarding = true }: { children: ReactNode; resumeOnboarding?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const here = query ? `${pathname}?${query}` : pathname;
  const onboarding = user && resumeOnboarding ? unfinishedOnboarding(user) : { pending: false, resume: false };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(pathname === "/" && !isReturningBrowser() ? WELCOME_PATH : signInPathFor(here));
      return;
    }
    // Signed in once here: next time it's signed out, this browser goes to sign-in, not the welcome page.
    rememberReturningBrowser();
    if (onboarding.resume) router.replace(onboardingPathFor(here));
    // Finished on another device, or the account is no longer new: don't hold on to it.
    else if (onboarding.pending) clearOnboardingPending();
  }, [loading, user, pathname, here, router, onboarding.resume, onboarding.pending]);

  if (!user || onboarding.resume) return <LoadingState className="min-h-dvh" />;
  return <>{children}</>;
}
