"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";

/** A screen crashed: keep the navigation, explain, and offer to try again instead of a blank page. */
export default function SignedInError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-1 items-center justify-center">
      <Tile className="w-full max-w-md">
        <ErrorState trackId="error_boundary" onRetry={reset} className="py-12" />
      </Tile>
    </div>
  );
}
