"use client";

import { ArrowRight, ChefHat, Heart, PiggyBank, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/components/AuthProvider";
import { PinchLogo } from "@/components/CookieMark";
import { LanguagePills } from "@/components/onboarding/LanguageChoice";
import { WelcomeIllustration } from "@/components/onboarding/WelcomeIllustration";
import { buttonClasses } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";
import { LEGAL_URLS } from "@/lib/legal";
import { setOnboardingPending } from "@/lib/onboarding/device";
import { afterOnboardingPath, signInFromWelcome, signUpFromWelcome } from "@/lib/onboarding/paths";

const BENEFITS = [
  { icon: Timer, title: "web.welcome.timeTitle", body: "web.welcome.timeBody", tone: "bg-primary-soft text-primary-text" },
  { icon: PiggyBank, title: "web.welcome.moneyTitle", body: "web.welcome.moneyBody", tone: "bg-accent-soft text-accent-text" },
  { icon: ChefHat, title: "web.welcome.easeTitle", body: "web.welcome.easeBody", tone: "bg-success-soft text-success" },
] as const;

/**
 * The front door for someone new (PIN-140): what Pinch saves them, the language picked on the way in, and two clear
 * ways on: create an account (then the first-run questions) or sign in. Signed-in visitors go straight to the app.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading } = useAuth();
  const next = params.get("next");
  usePageTitle(t("web.welcome.tabTitle"));

  useEffect(() => {
    if (!loading && user) router.replace(afterOnboardingPath(next));
  }, [loading, user, next, router]);

  if (loading || user) return <LoadingState className="min-h-dvh" />;

  return (
    // The illustration's glow and floating badge reach past its edges; on narrow screens that must not scroll sideways.
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      {/* Soft colour behind the page, so the first screen feels warm rather than stark. Decoration only. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] overflow-hidden">
        <div className="absolute -start-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary-soft opacity-70 blur-3xl" />
        <div className="absolute -end-24 top-24 h-[24rem] w-[24rem] rounded-full bg-accent-soft opacity-60 blur-3xl" />
      </div>

      <a
        href="#main"
        data-track="nav.skip_to_content"
        className="fixed start-3 top-3 z-50 -translate-y-20 rounded-btn bg-primary px-4 py-2.5 font-display font-bold text-on-primary shadow-lift transition-transform focus:translate-y-0"
      >
        {t("web.skipToContent")}
      </a>
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
        <a href="https://pinch-app.io/" data-track="welcome.logo" className="rounded-btn focus-visible:outline-2 focus-visible:outline-primary">
          <PinchLogo />
        </a>
        <Link
          href={signInFromWelcome(next)}
          data-track="welcome.header_sign_in"
          className={buttonClasses({ variant: "ghost", size: "sm", className: "rounded-full" })}
        >
          {t("auth.signIn")}
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {/* One column on phones and tablets: without `grid-cols-1` the implicit column grows to the illustration's
            width and the page runs off the side of a phone. */}
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-8 pb-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-16 lg:pb-20">
          <section className="min-w-0 animate-fade-in">
            <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted">
              <Heart aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-text" />
              {t("web.welcome.eyebrow")}
            </p>
            <h1 className="mt-6 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance wrap-break-word text-text rtl:leading-[1.25] rtl:tracking-normal sm:text-5xl lg:text-[3.375rem]">
              {t("web.welcome.title")}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-pretty text-muted sm:text-lg">{t("web.welcome.body")}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={signUpFromWelcome(next)}
                data-track="welcome.get_started"
                onClick={() => setOnboardingPending()}
                className={buttonClasses({ variant: "primary", size: "lg", className: "rounded-full sm:min-w-52" })}
              >
                {t("web.welcome.getStarted")}
                <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <Link
                href={signInFromWelcome(next)}
                data-track="welcome.have_account"
                className={buttonClasses({ variant: "outline", size: "lg", className: "rounded-full" })}
              >
                {t("web.welcome.haveAccount")}
              </Link>
            </div>

            <LanguagePills trackPrefix="onboarding.welcome.language" className="mt-8" />
          </section>

          <div className="min-w-0 pb-8 lg:pb-0">
            <WelcomeIllustration />
          </div>
        </div>

        <section aria-labelledby="welcome-benefits">
          <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-8 lg:pb-20">
            <h2 id="welcome-benefits" className="text-2xl leading-tight font-semibold text-text">
              {t("web.welcome.benefitsTitle")}
            </h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, title, body, tone }) => (
                <Tile as="li" key={title} className="p-6">
                  <span className={`grid h-11 w-11 place-items-center rounded-full ${tone}`}>
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-text">{t(title)}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-pretty text-muted">{t(body)}</p>
                </Tile>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl justify-center gap-4 px-4 py-6 text-sm text-muted sm:px-8">
        <a className="hover:underline" data-track="welcome.legal.privacy" href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">
          {t("auth.privacy")}
        </a>
        <span aria-hidden>·</span>
        <a className="hover:underline" data-track="welcome.legal.terms" href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">
          {t("auth.terms")}
        </a>
      </footer>
    </div>
  );
}
