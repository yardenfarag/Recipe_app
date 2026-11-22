"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";

/**
 * A page outside the signed-in shell crashed (sign-in, welcome, onboarding, reset password, a Hub recipe or a shared
 * link): explain and offer to try again, instead of a blank page. Signed-in pages have their own, inside the shell.
 */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex flex-1 items-center justify-center bg-bg p-4">
      <Tile className="w-full max-w-md">
        <ErrorState trackId="error_boundary.page" onRetry={retry} className="py-12" />
      </Tile>
    </main>
  );
}
