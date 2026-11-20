import { Suspense, type ReactNode } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";
import { LoadingState } from "@/components/ui/States";

/** Every page in this group needs an account, and sits in the app shell (navigation, account menu). */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    // RequireAuth reads the address bar to come back here after sign-in, which only exists in the browser.
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <RequireAuth>
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </Suspense>
  );
}
