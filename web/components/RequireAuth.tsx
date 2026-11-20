"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/AuthProvider";
import { LoadingState } from "@/components/ui/States";
import { signInPathFor } from "@/lib/nextPath";

/**
 * Signed-in pages. A signed-out visitor goes to sign-in, then comes back to the page they asked for.
 * The session lives in the browser (ADR 026), so this check runs there, not on the server.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading || user) return;
    const query = searchParams.toString();
    router.replace(signInPathFor(query ? `${pathname}?${query}` : pathname));
  }, [loading, user, pathname, searchParams, router]);

  if (!user) return <LoadingState className="min-h-dvh" />;
  return <>{children}</>;
}
