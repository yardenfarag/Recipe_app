import type { Metadata } from "next";
import { Suspense } from "react";

import { FirstRecipesPicker } from "@/components/onboarding/FirstRecipesPicker";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = { title: "Pick your first recipes · Pinch" };

/** After the first-run questions: save at least one Hub recipe that fits them. `?next=` is read in the browser. */
export default function FirstRecipesPage() {
  return (
    <Suspense fallback={<LoadingState className="min-h-dvh" />}>
      <FirstRecipesPicker />
    </Suspense>
  );
}
