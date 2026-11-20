import { Suspense, type ReactNode } from "react";

import { RequireAuth } from "@/components/RequireAuth";
import { Spinner } from "@/components/ui/Spinner";

/** Every page in this group needs an account. The app shell (navigation) arrives with PIN-130. */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    // RequireAuth reads the address bar to come back here after sign-in, which only exists in the browser.
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-6">
          <Spinner />
        </div>
      }
    >
      <RequireAuth>{children}</RequireAuth>
    </Suspense>
  );
}
