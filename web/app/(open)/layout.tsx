import { Suspense, type ReactNode } from "react";

import { OpenShell } from "@/components/shell/OpenShell";
import { LoadingState } from "@/components/ui/States";

/**
 * Pages anyone may open without an account: a Hub recipe (/hub/<id>), and later a shared recipe (/s/<token>).
 * Signed in, they sit in the normal app shell; signed out, in a slim bar that offers sign-in. Saving still needs an
 * account: the page sends the visitor to sign in and, back with `?save=1`, saves on its own (see `useSaveAfterSignIn`).
 */
export default function OpenLayout({ children }: { children: ReactNode }) {
  return (
    // The guest bar builds its sign-in link from the address bar, which only exists in the browser.
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <OpenShell>{children}</OpenShell>
    </Suspense>
  );
}
