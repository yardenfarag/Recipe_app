"use client";

import { catchError, type ErrorInfo } from "next/error";
import { usePathname } from "next/navigation";
import { Activity, Suspense, useState, type ReactNode } from "react";

import { LibraryScreen } from "@/components/library/LibraryScreen";
import { ScreenCrashed } from "@/components/ScreenCrashed";

/** The layout's own error boundary: `(signed-in)/error.tsx` only catches the pages under it. */
const LibraryErrorBoundary = catchError((_props: object, { error, retry }: ErrorInfo) => (
  <ScreenCrashed error={error} onRetry={retry} />
));

// One element for the life of the layout, so a navigation elsewhere doesn't draw the hidden Library again.
const library = (
  <LibraryErrorBoundary>
    {/* useSearchParams needs a boundary. */}
    <Suspense>
      <LibraryScreen />
    </Suspense>
  </LibraryErrorBoundary>
);

/**
 * Keeps the Library alive in the other sections (PIN-175), as the mobile app keeps its tabs: once opened, it is
 * hidden rather than unmounted when you leave, so coming back needs no redraw (about 1.3 s with 300 recipes on a
 * slow phone) and finds the same filters and place. Its effects stop while hidden and run again when it shows.
 *
 * The Library's route (`/`) renders nothing itself; this draws it. Next.js does the same for every page with Cache
 * Components, which stay off here (OpenNext on Cloudflare doesn't fully support them yet).
 */
export function KeptLibrary({ children }: { children: ReactNode }) {
  const onLibrary = usePathname() === "/";
  const [opened, setOpened] = useState(onLibrary);
  if (onLibrary && !opened) setOpened(true);
  return (
    <>
      {opened ? <Activity mode={onLibrary ? "visible" : "hidden"}>{library}</Activity> : null}
      {children}
    </>
  );
}
