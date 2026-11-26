"use client";

import { ScreenCrashed } from "@/components/ScreenCrashed";

/** A screen crashed: keep the navigation, explain, and offer to try again instead of a blank page. */
export default function SignedInError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ScreenCrashed error={error} onRetry={reset} />;
}
