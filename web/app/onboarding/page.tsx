import type { Metadata } from "next";
import { Suspense } from "react";

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = { title: "Set up your kitchen · Pinch" };

/** First-run questions for a new account (PIN-140). `?step=` and `?next=` are read in the browser. */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <OnboardingFlow />
    </Suspense>
  );
}
