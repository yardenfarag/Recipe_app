"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/components/AuthProvider";
import { PinchLogo } from "@/components/CookieMark";
import { AppShell } from "@/components/shell/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/States";
import { signInPathFor } from "@/lib/nextPath";

/** The sign-in (or sign-up) address that comes back to this page. */
export function useSignInHere(): (mode?: "signin" | "signup", extraQuery?: string) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (mode = "signin", extraQuery) => {
    const query = new URLSearchParams(searchParams.toString());
    if (extraQuery) for (const [key, value] of new URLSearchParams(extraQuery)) query.set(key, value);
    const here = query.toString() ? `${pathname}?${query.toString()}` : pathname;
    const path = signInPathFor(here);
    return mode === "signup" ? path.replace("mode=signin", "mode=signup") : path;
  };
}

/**
 * The frame for pages open to everyone. A signed-in visitor gets the full app shell; a guest gets the logo and a
 * way to sign in or create an account, which returns them to this same page.
 */
export function OpenShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const signInHere = useSignInHere();

  if (loading) return <LoadingState className="min-h-dvh" />;
  if (user) return <AppShell>{children}</AppShell>;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        data-track="nav.skip_to_content"
        className="fixed start-3 top-3 z-50 -translate-y-20 rounded-full bg-primary px-4 py-2.5 font-semibold text-on-primary shadow-lift transition-transform focus:translate-y-0"
      >
        {t("web.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-frosted-border bg-frosted backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <a href="https://pinch-app.io/" data-track="open_shell.logo" className="rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
            <PinchLogo />
          </a>
          <nav aria-label={t("web.account")} className="flex items-center gap-2">
            <Link href={signInHere("signin")} data-track="open_shell.sign_in" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {t("auth.signIn")}
            </Link>
            <Link href={signInHere("signup")} data-track="open_shell.sign_up" className={buttonClasses({ variant: "primary", size: "sm" })}>
              {t("auth.signUp")}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pt-6 pb-12 sm:px-8 md:pt-10">{children}</div>
      </main>
    </div>
  );
}
