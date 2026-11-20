import type { ReactNode } from "react";

/** The frame around sign-in, reset and callback pages: a card on larger screens, the full page on phones. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center sm:items-center sm:p-6">
      <div className="w-full max-w-md bg-surface px-6 py-10 sm:rounded-3xl sm:border sm:border-border sm:px-8 sm:shadow-sm">
        {children}
      </div>
    </main>
  );
}

export function PinchMark() {
  return <p className="mb-6 text-center text-2xl font-semibold tracking-wide text-primary">Pinch</p>;
}
