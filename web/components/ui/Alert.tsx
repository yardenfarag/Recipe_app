import { CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

/** An error the screen reader announces as soon as it appears. */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <CircleAlert aria-hidden className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** A success message read out politely, after what the reader is saying. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold text-success">
      <CircleCheck aria-hidden className="h-4 w-4" />
      {children}
    </p>
  );
}
