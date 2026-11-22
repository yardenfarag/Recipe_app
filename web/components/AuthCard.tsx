import type { ReactNode } from "react";

import { PinchLogo } from "@/components/CookieMark";
import { Tile } from "@/components/ui/Tile";

/** The frame around sign-in, reset and callback pages: one tile in the middle of the page (at the top on phones). */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center p-4 sm:items-center sm:p-6">
      <Tile className="w-full max-w-md animate-pop-in px-5 pt-8 pb-7 sm:px-9 sm:pt-10 sm:pb-8">{children}</Tile>
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
