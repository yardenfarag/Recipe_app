"use client";

import { ArrowLeft, Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PinchLogo } from "@/components/CookieMark";
import { LanguageSelect } from "@/components/onboarding/LanguageChoice";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ONBOARDING_STEPS, STEP_LABEL_KEYS, stepIndex, type OnboardingStep } from "@/lib/onboarding/steps";

/**
 * The first-run questions' page: a slim top bar (language, skip), and on a wide screen a rail that lists the
 * questions with the ones answered ticked off, beside the current one. On a phone the rail becomes a progress bar.
 * No app navigation: the only ways out are finishing and "Skip for now".
 */
export function OnboardingFrame({
  step,
  onGoTo,
  onSkip,
  children,
}: {
  step: OnboardingStep;
  onGoTo: (step: OnboardingStep) => void;
  /** Absent on the last step, whose own Skip ends it. */
  onSkip?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const current = stepIndex(step);
  const total = ONBOARDING_STEPS.length;

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
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-8">
          <span className="sm:hidden">
            <PinchLogo compact />
          </span>
          <span className="hidden sm:inline-flex">
            <PinchLogo />
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSelect />
            {onSkip ? (
              <Button variant="ghost" size="sm" trackId={`onboarding.${step}.skip`} onClick={onSkip}>
                {t("web.onboarding.skipForNow")}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 pt-6 sm:px-8 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-14 lg:pt-12">
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <p className="text-sm font-bold text-primary">{t("web.onboarding.tabTitle")}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-pretty text-muted">{t("web.onboarding.railBody")}</p>
            <ol className="mt-8 space-y-1" aria-label={t("web.onboarding.tabTitle")}>
              {ONBOARDING_STEPS.map((item, index) => {
                const done = index < current;
                const here = index === current;
                const content = (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                        done && "bg-primary text-on-primary",
                        here && "bg-primary-soft text-primary ring-2 ring-primary",
                        !done && !here && "bg-element text-muted",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className={cn("text-[15px]", here ? "font-bold text-text" : done ? "font-semibold text-text" : "text-muted")}>
                      {t(STEP_LABEL_KEYS[item])}
                    </span>
                  </>
                );
                return (
                  <li key={item}>
                    {done ? (
                      <Button
                        variant="ghost"
                        trackId={`onboarding.rail.${item}`}
                        onClick={() => onGoTo(item)}
                        className="h-auto w-full justify-start gap-3 rounded-2xl px-3 py-2.5 text-start whitespace-normal"
                      >
                        {content}
                      </Button>
                    ) : (
                      <div aria-current={here ? "step" : undefined} className="flex items-center gap-3 px-3 py-2.5">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-8 border-t border-frosted-border pt-5 text-sm leading-relaxed text-muted">{t("onboarding.changeLater")}</p>
          </div>
        </aside>

        <main id="main" tabIndex={-1} className="flex min-w-0 flex-col outline-none">
          <div className="mb-6 lg:hidden">
            <p className="text-sm font-semibold text-primary">{t("a11y.stepOf", { current: current + 1, total })}</p>
            <div aria-hidden className="mt-2 flex gap-1.5">
              {ONBOARDING_STEPS.map((item, index) => (
                <span
                  key={item}
                  className={cn("h-1.5 flex-1 rounded-full transition-colors", index <= current ? "bg-primary" : "bg-element")}
                />
              ))}
            </div>
          </div>
          <div key={step} className="flex flex-1 flex-col motion-safe:animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * The step's actions: Back at the start, the way on at the end. Pinned to the bottom on a phone so the next step is
 * always a thumb away; in the flow of the page on larger screens.
 */
export function StepFooter({
  step,
  onBack,
  status,
  children,
}: {
  step: OnboardingStep;
  onBack?: () => void;
  status?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-frosted-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:mx-0 sm:mt-10 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-12 sm:backdrop-blur-none">
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button variant="ghost" size="lg" trackId={`onboarding.${step}.back`} onClick={onBack} className="px-4">
            <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
            {t("common.back")}
          </Button>
        ) : null}
        <div className="hidden min-w-0 flex-1 sm:block">{status}</div>
        <div className="flex flex-1 justify-end sm:flex-none">{children}</div>
      </div>
    </div>
  );
}
