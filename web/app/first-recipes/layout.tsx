import { Suspense, type ReactNode } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { LoadingState } from "@/components/ui/States";

/**
 * The first-recipes picker comes straight after the first-run questions, so it is laid out like them: the account,
 * but no app shell. Signed out, RequireAuth sends the visitor to sign-in and back.
 */
export default function FirstRecipesLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <RequireAuth resumeOnboarding={false}>{children}</RequireAuth>
    </Suspense>
  );
}
