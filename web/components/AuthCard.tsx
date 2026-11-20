import type { ReactNode } from "react";

import { PinchLogo } from "@/components/CookieMark";

/** The frame around sign-in, reset and callback pages: a card on larger screens, the full page on phones. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center sm:items-center sm:p-6">
      <div className="w-full max-w-md animate-pop-in bg-surface px-6 pt-10 pb-8 sm:rounded-3xl sm:border sm:border-frosted-border sm:px-9 sm:shadow-lift">
        {children}
      </div>
    </main>
  );
}

export function PinchMark() {
  return (
    <div className="mb-7 flex justify-center">
      <PinchLogo />
    </div>
  );
}
