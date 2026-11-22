"use client";

import { useEffect } from "react";

import { bootScript, themeCss } from "@/lib/theme";

import "./globals.css";

/**
 * The root layout itself crashed, so nothing else is on screen: no translations, no shell. A plain page in the
 * reader's theme, in English, with a way to try again. Pages normally fail into app/error.tsx instead.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Pinch</title>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body className="flex min-h-screen items-center justify-center bg-bg p-4 font-sans text-text">
        <main className="w-full max-w-md rounded-tile border border-border bg-surface px-6 py-12 text-center">
          <h1 className="font-display text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-muted">Pinch couldn’t open this page. Try again, or reload in a moment.</p>
          <button type="button" data-track="error_boundary.global.retry" onClick={() => retry()} className="mt-6 rounded-btn bg-primary px-5 py-3 font-semibold text-on-primary">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
