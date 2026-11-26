import { Suspense, type ReactNode } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { KeptLibrary } from "@/components/library/KeptLibrary";
import { AppShell } from "@/components/shell/AppShell";
import { LoadingState } from "@/components/ui/States";

/**
 * Every page in this group needs an account, and sits in the app shell (navigation, account menu). The Library
 * stays alive while another section shows (PIN-175).
 */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    // RequireAuth reads the address bar to come back here after sign-in, which only exists in the browser.
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <RequireAuth>
        <AppShell>
          <KeptLibrary>{children}</KeptLibrary>
        </AppShell>
      </RequireAuth>
    </Suspense>
  );
}
