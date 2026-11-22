"use client";

import { ArrowRight, ChefHat, PiggyBank, Timer } from "lucide-react";
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
import { Tile, TileBadge } from "@/components/ui/Tile";
import { LEGAL_URLS } from "@/lib/legal";
import { setOnboardingPending } from "@/lib/onboarding/device";
import { afterOnboardingPath, signInFromWelcome, signUpFromWelcome } from "@/lib/onboarding/paths";

const BENEFITS = [
  { icon: Timer, title: "web.welcome.timeTitle", body: "web.welcome.timeBody" },
  { icon: PiggyBank, title: "web.welcome.moneyTitle", body: "web.welcome.moneyBody" },
  { icon: ChefHat, title: "web.welcome.easeTitle", body: "web.welcome.easeBody" },
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
    <div className="flex min-h-dvh flex-col overflow-x-clip">
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
        <Link href={signInFromWelcome(next)} data-track="welcome.header_sign_in" className={buttonClasses({ variant: "ghost", size: "sm" })}>
          {t("auth.signIn")}
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-6 pb-14 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14 lg:pt-12 lg:pb-16">
          <section className="min-w-0 animate-fade-in">
            <p className="flex">
              <TileBadge className="bg-accent-soft py-2 leading-tight text-accent-text">{t("web.welcome.eyebrow")}</TileBadge>
            </p>
            <h1 className="mt-5 font-display text-5xl leading-[0.95] font-bold tracking-tight text-balance wrap-break-word text-text rtl:leading-[1.15] rtl:tracking-normal sm:text-6xl xl:text-7xl">
              {t("web.welcome.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">{t("web.welcome.body")}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={signUpFromWelcome(next)}
                data-track="welcome.get_started"
                onClick={() => setOnboardingPending()}
                className={buttonClasses({ variant: "primary", size: "lg", className: "sm:min-w-52" })}
              >
                {t("web.welcome.getStarted")}
                <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <Link href={signInFromWelcome(next)} data-track="welcome.have_account" className={buttonClasses({ variant: "outline", size: "lg" })}>
                {t("web.welcome.haveAccount")}
              </Link>
            </div>

            <LanguagePills trackPrefix="onboarding.welcome.language" className="mt-8" />
          </section>

          <div className="pb-6 lg:pb-0">
            <WelcomeIllustration />
          </div>
        </div>

        <section aria-labelledby="welcome-benefits">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-8 lg:pb-16">
            <h2 id="welcome-benefits" className="text-[26px] leading-tight font-bold text-text">
              {t("web.welcome.benefitsTitle")}
            </h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <Tile as="li" key={title} className="p-5 sm:p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-text">{t(title)}</h3>
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
