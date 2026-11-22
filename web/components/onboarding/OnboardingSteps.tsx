"use client";

import { ArrowRight, Bot, Check, Clapperboard, Ellipsis, Search, Store, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { avoidListIsEmpty } from "@shared/lib/avoidList";
import type { KitchenDietKey, KitchenProfile } from "@shared/lib/kitchenProfile";
import { HEARD_ABOUT_SOURCES, type HeardAboutSource } from "@shared/lib/productEvents";
import { RECIPE_VARIANTS } from "@shared/lib/recipeVariants";

import { StepFooter } from "@/components/onboarding/OnboardingFrame";
import { AvoidListEditor } from "@/components/settings/AvoidListEditor";
import { SaveStatusLine, SubHeading, SwitchRow } from "@/components/settings/controls";
import { MeasurementChoice, UnitsChoice } from "@/components/settings/RecipeSettings";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { hasSomethingToApply, MAX_DIETS } from "@/lib/onboarding/steps";
import type { SaveStatus } from "@/lib/settings/useKitchenSettings";

const DIET_KEYS = RECIPE_VARIANTS.map((variant) => variant.key).filter((key): key is KitchenDietKey => key !== "custom");

const HEARD_ICONS: Record<HeardAboutSource, LucideIcon> = {
  tiktok_instagram: Clapperboard,
  friend: Users,
  app_store: Store,
  google: Search,
  ai_assistant: Bot,
  other: Ellipsis,
};

/** The account's kitchen profile as the steps need it: what it holds, or why it isn't there. */
export type KitchenState = {
  profile: KitchenProfile | null;
  loadFailed: boolean;
  status: SaveStatus;
  save: (next: KitchenProfile) => void;
  retry: () => void;
};

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { t } = useTranslation();
  return <PageHeader title={title} subtitle={subtitle} tabTitle={t("web.onboarding.tabTitle")} />;
}

/** While the profile loads, or when it can't: answering waits, moving on doesn't (Settings has the same questions). */
function KitchenBody({ kitchen, children }: { kitchen: KitchenState; children: (profile: KitchenProfile) => ReactNode }) {
  const { t } = useTranslation();
  if (kitchen.profile) return <>{children(kitchen.profile)}</>;
  if (kitchen.loadFailed) {
    return (
      <div role="alert" className="rounded-3xl border border-frosted-border bg-surface p-6 shadow-soft">
        <p className="text-[15px] leading-relaxed text-muted">{t("web.onboarding.loadFailed")}</p>
        <Button variant="secondary" className="mt-4" trackId="onboarding.kitchen.retry" onClick={kitchen.retry}>
          {t("common.tryAgainAction")}
        </Button>
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-2 gap-2.5 motion-safe:animate-pulse sm:gap-3 xl:grid-cols-3">
      <span className="sr-only">{t("a11y.loading")}</span>
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} aria-hidden className="h-16 rounded-2xl border border-frosted-border bg-surface sm:h-20" />
      ))}
    </div>
  );
}

/** A choice that is on or off, as a card with room for a line about it. */
function ChoiceCard({
  pressed,
  disabled,
  onToggle,
  trackId,
  title,
  body,
}: {
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  trackId: string;
  title: string;
  body?: string;
}) {
  return (
    <Button
      variant="outline"
      aria-pressed={pressed}
      disabled={disabled}
      trackId={trackId}
      onClick={onToggle}
      className={cn(
        "h-auto min-h-14 w-full items-start justify-start gap-3 rounded-2xl px-4 py-3 text-start whitespace-normal disabled:opacity-45",
        pressed && "border-primary bg-primary-soft hover:bg-primary-soft active:bg-primary-soft",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] leading-snug font-semibold", pressed ? "text-primary" : "text-text")}>{title}</span>
        {body ? <span className="mt-1 hidden text-sm leading-snug font-normal text-muted sm:block">{body}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
          pressed ? "border-primary bg-primary text-on-primary" : "border-border",
        )}
      >
        {pressed ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
      </span>
    </Button>
  );
}

function NextButton({ label, trackId, onClick }: { label: string; trackId: string; onClick: () => void }) {
  return (
    <Button size="lg" trackId={trackId} onClick={onClick} className="w-full sm:w-auto sm:min-w-44">
      {label}
      <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
    </Button>
  );
}

/** Diets: up to four, saved on the account as they're picked (Settings → Recipe preferences shows the same). */
export function DietStep({ kitchen, onNext }: { kitchen: KitchenState; onNext: () => void }) {
  const { t } = useTranslation();
  const diets = kitchen.profile?.diets ?? [];
  const full = diets.length >= MAX_DIETS;

  function toggle(profile: KitchenProfile, key: KitchenDietKey) {
    const next = profile.diets.includes(key)
      ? profile.diets.filter((diet) => diet !== key)
      : [...profile.diets, key].slice(0, MAX_DIETS);
    kitchen.save({ ...profile, diets: next });
  }

  return (
    <>
      <StepHeader title={t("onboarding.cookTitle")} subtitle={t("onboarding.cookSubtitle")} />
      <KitchenBody kitchen={kitchen}>
        {(profile) => (
          <>
            <div role="group" aria-label={t("onboarding.cookTitle")} className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
              {DIET_KEYS.map((key) => {
                const pressed = profile.diets.includes(key);
                return (
                  <ChoiceCard
                    key={key}
                    pressed={pressed}
                    disabled={full && !pressed}
                    onToggle={() => toggle(profile, key)}
                    trackId={`onboarding.diet.${key}`}
                    title={t(`recipe.variants.${key}.label`)}
                    body={t(`recipe.variants.${key}.description`)}
                  />
                );
              })}
            </div>
            {full ? (
              <p role="status" className="mt-3 text-sm text-muted">
                {t("onboarding.dietLimit", { count: MAX_DIETS })}
              </p>
            ) : null}
          </>
        )}
      </KitchenBody>
      <MeasureChoices />
      <StepFooter step="diet" status={<SaveStatusLine status={kitchen.status} />}>
        <NextButton
          label={diets.length === 0 ? t("onboarding.cookEverything") : t("onboarding.continue")}
          trackId={diets.length === 0 ? "onboarding.diet.everything" : "onboarding.diet.next"}
          onClick={onNext}
        />
      </StepFooter>
    </>
  );
}

/**
 * How recipes measure, under the diets: spoons or grams, and Metric or US (PIN-53). Both save on the account at once
 * and start from good defaults (the language's), so a cook can pass them by.
 */
function MeasureChoices() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="onboarding-measure" className="mt-8 rounded-3xl border border-frosted-border bg-surface p-5 shadow-soft">
      <h2 id="onboarding-measure" className="text-base font-bold text-text">
        {t("onboarding.measureTitle")}
      </h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-muted">{t("measurement.unitsHint")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <SubHeading>{t("settings.measurements")}</SubHeading>
          <MeasurementChoice trackId="onboarding.measurement" />
        </div>
        <div>
          <SubHeading>{t("measurement.unitsTitle")}</SubHeading>
          <UnitsChoice trackId="onboarding.units" />
        </div>
      </div>
    </section>
  );
}

/** Allergies and dislikes: the same editor as Settings, so the rules (and the allergy notice) are the same. */
export function AvoidStep({ kitchen, onBack, onNext }: { kitchen: KitchenState; onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation();
  const empty = !kitchen.profile || avoidListIsEmpty(kitchen.profile);

  return (
    <>
      <StepHeader title={t("avoid.stepTitle")} subtitle={t("avoid.stepSubtitle")} />
      <KitchenBody kitchen={kitchen}>
        {(profile) => (
          <>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <AvoidListEditor profile={profile} onChange={kitchen.save} trackPrefix="onboarding.avoid" />
            </div>
            {hasSomethingToApply(profile) ? (
              <div className="mt-4">
                <SwitchRow
                  label={t("avoid.autoApplyTitle")}
                  trackId="onboarding.avoid.auto_apply.toggle"
                  hint={t("avoid.autoApplyHint")}
                  checked={profile.autoApplyOnExtract}
                  onChange={(next) => kitchen.save({ ...profile, autoApplyOnExtract: next })}
                />
              </div>
            ) : null}
          </>
        )}
      </KitchenBody>
      <StepFooter step="avoid" onBack={onBack} status={<SaveStatusLine status={kitchen.status} />}>
        <NextButton
          label={empty ? t("avoid.nothing") : t("onboarding.continue")}
          trackId={empty ? "onboarding.avoid.nothing" : "onboarding.avoid.next"}
          onClick={onNext}
        />
      </StepFooter>
    </>
  );
}

/** "How did you hear about Pinch?": one press answers and finishes; Skip finishes without an answer. */
export function HeardStep({
  onBack,
  onAnswer,
  busy,
}: {
  onBack: () => void;
  onAnswer: (source: HeardAboutSource | null) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <StepHeader title={t("onboarding.heardTitle")} subtitle={t("onboarding.heardSubtitle")} />
      <ul className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
        {HEARD_ABOUT_SOURCES.map((source) => {
          const Icon = HEARD_ICONS[source];
          return (
            <li key={source}>
              <Button
                variant="outline"
                trackId={`onboarding.heard.${source}`}
                disabled={busy}
                onClick={() => onAnswer(source)}
                className="h-auto min-h-16 w-full justify-start gap-3 rounded-2xl px-4 py-3 text-start whitespace-normal"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-text">
                  {t(`onboarding.heardSources.${source}`)}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      <StepFooter step="heard" onBack={onBack}>
        <Button variant="ghost" size="lg" trackId="onboarding.heard.skip" disabled={busy} onClick={() => onAnswer(null)}>
          {t("onboarding.skip")}
        </Button>
      </StepFooter>
    </>
  );
}
