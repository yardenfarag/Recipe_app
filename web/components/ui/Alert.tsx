import type { ReactNode } from "react";

/** An error the screen reader announces as soon as it appears. */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {children}
    </div>
  );
}

/** A success message read out politely, after what the reader is saying. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
      {children}
    </p>
  );
}
