"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { HeardAboutSource } from "@shared/lib/productEvents";
import { markAccountOnboarded } from "@shared/lib/supabase/onboarding";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { OnboardingFrame } from "@/components/onboarding/OnboardingFrame";
import { AvoidStep, DietStep, HeardStep } from "@/components/onboarding/OnboardingSteps";
import { LoadingState } from "@/components/ui/States";
import { captureHeardAbout, captureOnboardingCompleted } from "@/lib/analytics";
import { finishOnboardingOnDevice } from "@/lib/onboarding/device";
import { afterOnboardingPath } from "@/lib/onboarding/paths";
import { nextStep, parseOnboardingStep, previousStep, stepPath, type OnboardingStep } from "@/lib/onboarding/steps";
import { useOnboardingStart } from "@/lib/onboarding/useOnboardingStart";
import { useKitchenSettings } from "@/lib/settings/useKitchenSettings";
import { getSupabase } from "@/lib/supabase";

/**
 * The first-run questions for a new account (PIN-140): diets, then allergies and dislikes, then how they heard about
 * Pinch. Answers save on the account as they're given, in the same places the mobile app and Settings use
 * (`profiles.kitchen`); finishing or skipping records it on the account (`user_metadata.onboarded_at`) so no other
 * device asks again, and goes on to `next` (the Library, where the first recipe starts).
 */
export function OnboardingFlow() {
  const { user } = useAuth();
  // The layout only shows this page signed in.
  if (!user) return <LoadingState className="min-h-dvh" />;
  return <Flow user={user} />;
}

function Flow({ user }: { user: User }) {
  const router = useRouter();
  const params = useSearchParams();
  const { language } = useLanguage();
  const next = afterOnboardingPath(params.get("next"));
  const step = parseOnboardingStep(params.get("step"));
  const start = useOnboardingStart(user, () => router.replace(next));
  const kitchen = useKitchenSettings();
  const [finishing, setFinishing] = useState(false);
  /** Steps this page pushed onto the browser's history, so Back can return through them. */
  const pushed = useRef(0);
  const shownStep = useRef<OnboardingStep | null>(null);

  // A new question: focus its heading, so a screen reader starts there and the keyboard goes on from it.
  useEffect(() => {
    if (start !== "asking") return;
    const first = shownStep.current === null;
    shownStep.current = step;
    if (first) return;
    const heading = document.querySelector<HTMLElement>("#main h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step, start]);

  function goTo(target: OnboardingStep) {
    pushed.current += 1;
    router.push(stepPath(target, next));
  }

  function goForward() {
    const target = nextStep(step);
    if (target) goTo(target);
  }

  function goBack() {
    const target = previousStep(step);
    if (!target) return;
    if (pushed.current > 0) {
      pushed.current -= 1;
      router.back();
    } else {
      router.replace(stepPath(target, next));
    }
  }

  function finish(source: HeardAboutSource | null = null) {
    if (finishing) return;
    setFinishing(true);
    if (source) captureHeardAbout({ source });
    captureOnboardingCompleted({ locale: language });
    finishOnboardingOnDevice();
    // This browser already knows; the account tells the other devices. A failure here only means the phone may ask.
    void markAccountOnboarded(getSupabase()).catch((error: unknown) =>
      console.warn("[onboarding] could not save on the account", error instanceof Error ? error.message : error),
    );
    router.replace(next);
  }

  if (start === "checking") return <LoadingState className="min-h-dvh" />;

  return (
    <OnboardingFrame step={step} onGoTo={goTo} onSkip={step === "heard" || finishing ? undefined : () => finish()}>
      {step === "diet" ? <DietStep kitchen={kitchen} onNext={goForward} /> : null}
      {step === "avoid" ? <AvoidStep kitchen={kitchen} onBack={goBack} onNext={goForward} /> : null}
      {step === "heard" ? <HeardStep onBack={goBack} onAnswer={finish} busy={finishing} /> : null}
    </OnboardingFrame>
  );
}
