"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/States";

/** A screen crashed: keep the navigation, explain, and offer to try again instead of a blank page. */
export default function SignedInError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState onRetry={reset} className="flex-1 justify-center" />;
}
