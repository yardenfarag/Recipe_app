import { Suspense, type ReactNode } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { LoadingState } from "@/components/ui/States";

/**
 * The first-run questions need the account (answers are saved on it), but not the app shell: the page has its own
 * slim top bar so the questions have the whole window. Signed out, RequireAuth sends the visitor to sign-in and back.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <RequireAuth resumeOnboarding={false}>{children}</RequireAuth>
    </Suspense>
  );
}
