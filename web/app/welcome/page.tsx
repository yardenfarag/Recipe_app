import type { Metadata } from "next";
import { Suspense } from "react";

import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = { title: "Welcome · Pinch" };

/** The front door for a first-time visitor (PIN-140). The address bar's `next` is read in the browser. */
export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <WelcomeScreen />
    </Suspense>
  );
}
