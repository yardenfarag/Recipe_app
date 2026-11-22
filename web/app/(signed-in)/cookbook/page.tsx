"use client";

import { Suspense } from "react";

import { CookbookScreen } from "@/components/cookbook/CookbookScreen";

/** The PDF cookbook (PIN-142). The same path as the mobile app's, so old links keep working. */
export default function CookbookPage() {
  return (
    // useSearchParams needs a boundary; the page itself loads after sign-in, in the browser.
    <Suspense>
      <CookbookScreen />
    </Suspense>
  );
}
