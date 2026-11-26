"use client";

import { ArrowRight, Flag, Scale, Thermometer, UtensilsCrossed, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { avoidListIsEmpty } from "@shared/lib/avoidList";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { type KitchenDietKey, type KitchenProfile } from "@shared/lib/kitchenProfile";
import { RECIPE_VARIANTS } from "@shared/lib/recipeVariants";
import type { UnitSystem } from "@shared/lib/unitSystem";

import { AppliancesSettings } from "@/components/settings/AppliancesSettings";
import { AvoidListEditor } from "@/components/settings/AvoidListEditor";
import {
  ChoiceGroup,
  SaveStatusLine,
  SettingsCard,
  SubHeading,
  SwitchRow,
  ToggleChip,
  inputClass,
  segmentedGroupClass,
  segmentedOptionClass,
} from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { Stepper } from "@/components/ui/Stepper";
import { cn } from "@/lib/cn";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";
import { useOwnedAppliances } from "@/lib/settings/ownedAppliances";
import { useKitchenSettings, type SaveStatus } from "@/lib/settings/useKitchenSettings";

/** The mobile app's limits (src/app/settings/recipe.tsx and sanitizeKitchenProfile). */
const MAX_DIETS = 4;
const MAX_SWAPS = 8;
const MAX_SERVINGS = 24;

const DIET_KEYS = RECIPE_VARIANTS.map((variant) => variant.key as KitchenDietKey);

/**
 * How recipes come out for this cook: spoons or grams, diets, allergies and dislikes, the appliances they have,
 * swaps, pantry staples, what happens after a Snap, and sharing imports to the Cooking Hub. Everything is saved on
 * the account the moment it changes, so the mobile app shows it after a refresh.
 */
export function RecipeSettings() {
  const { t } = useTranslation();
  const kitchen = useKitchenSettings();
  const appliancesStatus = useOwnedAppliances().status;

  return (
    <>
      <SettingsPageHeader id="recipe" actions={<SaveStatusLine status={combinedStatus(kitchen.status, appliancesStatus)} />} />
      <div className="flex flex-col gap-4">
        <MeasurementCard />
        <UnitsCard />
        {kitchen.loadFailed ? (
          <ErrorState body={t("common.tryAgain")} trackId="settings.kitchen.load_error" onRetry={() => void kitchen.retry()} />
        ) : !kitchen.profile ? (
          <LoadingState />
        ) : (
          <KitchenCards
            profile={kitchen.profile}
            onChange={kitchen.save}
            contributeToHub={kitchen.contributeToHub}
            onContributeToHubChange={(next) => void kitchen.saveContributeToHub(next)}
          />
        )}
      </div>
    </>
  );
}

/** Spoons or grams, as a two-way choice (Settings and the first onboarding question). */
export function MeasurementChoice({ trackId }: { trackId: string }) {
  const { t } = useTranslation();
  const { system, setSystem } = useMeasurementSystem();
  const options: { value: MeasurementSystem; label: string; Icon: typeof Scale }[] = [
    { value: "original", label: t("measurement.spoons"), Icon: UtensilsCrossed },
    { value: "metric", label: t("measurement.grams"), Icon: Scale },
  ];
  return (
    <SegmentedControl
      label={t("settings.measurements")}
      value={system}
      onChange={setSystem}
      fullWidth
      className="max-w-md"
      options={options.map(({ value, label, Icon }) => ({
        value,
        label,
        icon: <Icon aria-hidden className="h-4 w-4 shrink-0" />,
        trackId: `${trackId}.${value}`,
      }))}
    />
  );
}

function MeasurementCard() {
  const { t } = useTranslation();
  return (
    <SettingsCard title={t("settings.measurements")} hint={t("settings.measurementsHint")}>
      <MeasurementChoice trackId="settings.kitchen.measurement" />
    </SettingsCard>
  );
}

/** Metric (°C, g, cm) or US (°F, oz, in), saved on the account like spoons or grams (PIN-53). */
export function UnitsChoice({ trackId }: { trackId: string }) {
  const { t } = useTranslation();
  const { units, setUnits } = useUnitSystem();
  const options: { value: UnitSystem; label: string; Icon: typeof Scale }[] = [
    { value: "metric", label: t("measurement.unitsMetric"), Icon: Thermometer },
    { value: "us", label: t("measurement.unitsUs"), Icon: Flag },
  ];
  return (
    // Not the kit's SegmentedControl: "Metric (°C, g, cm)" has to wrap on a phone, and that one is a fixed height.
    <ChoiceGroup
      label={t("measurement.unitsTitle")}
      value={units}
      onChange={setUnits}
      trackId={trackId}
      className={cn(segmentedGroupClass, "max-w-md grid-cols-2")}
      optionClassName={segmentedOptionClass}
      options={options.map(({ value, label, Icon }) => ({
        value,
        label,
        content: (
          <>
            <Icon aria-hidden className="h-4 w-4 shrink-0" />
            <bdi>{label}</bdi>
          </>
        ),
      }))}
    />
  );
}

function UnitsCard() {
  const { t } = useTranslation();
  return (
    <SettingsCard title={t("measurement.unitsTitle")} hint={t("measurement.unitsHint")}>
      <UnitsChoice trackId="settings.kitchen.units" />
    </SettingsCard>
  );
}

function KitchenCards({
  profile,
  onChange,
  contributeToHub,
  onContributeToHubChange,
}: {
  profile: KitchenProfile;
  onChange: (next: KitchenProfile) => void;
  contributeToHub: boolean;
  onContributeToHubChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const servingsLabelId = useId();
  const [swapFrom, setSwapFrom] = useState("");
  const [swapTo, setSwapTo] = useState("");
  const dietsFull = profile.diets.length >= MAX_DIETS;
  const servings = profile.defaultServings;

  function toggleDiet(key: KitchenDietKey) {
    const diets = profile.diets.includes(key) ? profile.diets.filter((diet) => diet !== key) : [...profile.diets, key].slice(0, MAX_DIETS);
    onChange({ ...profile, diets });
  }

  function setServings(next: number | undefined) {
    onChange({ ...profile, defaultServings: next == null || next < 1 ? undefined : Math.min(MAX_SERVINGS, next) });
  }

  function addSwap() {
    const from = swapFrom.trim();
    const to = swapTo.trim();
    if (!from || !to || profile.alwaysSwap.length >= MAX_SWAPS) return;
    setSwapFrom("");
    setSwapTo("");
    onChange({ ...profile, alwaysSwap: [...profile.alwaysSwap, { from, to }].slice(0, MAX_SWAPS) });
  }

  const summary =
    profile.diets.length === 0 && profile.alwaysSwap.length === 0 && profile.defaultServings == null && avoidListIsEmpty(profile)
      ? t("settings.kitchenPreviewEmpty")
      : [
          ...profile.allergies.map((allergen) => t(`avoid.allergens.${allergen}`)),
          ...profile.otherAllergies,
          ...profile.diets.map((diet) => t(`recipe.variants.${diet}.label`)),
          ...profile.alwaysSwap.map((swap) => `${swap.from} → ${swap.to}`),
          profile.defaultServings ? t("settings.kitchenPreviewServings", { count: profile.defaultServings }) : null,
          ...profile.dislikes,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <>
      <SettingsCard title={t("settings.kitchenHowICook")} hint={t("settings.kitchenHint")}>
        <SubHeading>{t("settings.kitchenDiets")}</SubHeading>
        <div role="group" aria-label={t("settings.kitchenDiets")} className="flex flex-wrap gap-2">
          {DIET_KEYS.map((key) => {
            const on = profile.diets.includes(key);
            return (
              <ToggleChip key={key} pressed={on} disabled={dietsFull && !on} onToggle={() => toggleDiet(key)} trackId={`settings.kitchen.diet.${key}`}>
                {t(`recipe.variants.${key}.label`)}
              </ToggleChip>
            );
          })}
        </div>
        {dietsFull ? <p className="mt-2 text-sm text-muted">{t("avoid.limit", { count: MAX_DIETS })}</p> : null}

        <div className="mt-6">
          <SubHeading id={servingsLabelId}>{t("settings.kitchenServings")}</SubHeading>
          <div className="flex flex-wrap items-center gap-2">
            {/*
              "Off" (the recipe's own servings) sits below 1: minus is greyed there, plus goes to 2, and minus at 1
              turns it off again, as before.
            */}
            <Stepper
              value={servings ?? 1}
              onChange={setServings}
              min={servings == null ? 1 : 0}
              max={MAX_SERVINGS}
              labelledBy={servingsLabelId}
              decreaseLabel={t("recipe.decreaseServings")}
              increaseLabel={t("recipe.increaseServings")}
              spokenValue={servings == null ? undefined : t("settings.kitchenPreviewServings", { count: servings })}
              trackId="settings.kitchen.servings"
            >
              {servings == null ? t("settings.kitchenServingsOff") : servings}
            </Stepper>
            {servings != null ? (
              <Button variant="ghost" size="sm" trackId="settings.kitchen.servings.clear" onClick={() => setServings(undefined)} aria-label={t("a11y.clearDefaultServings")}>
                {t("common.clear")}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted">{t("settings.kitchenServingsHint")}</p>
        </div>
      </SettingsCard>

      <AvoidListEditor profile={profile} onChange={onChange} />

      <AppliancesSettings />

      <SettingsCard title={t("settings.kitchenAlwaysSwap")}>
        {profile.alwaysSwap.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {profile.alwaysSwap.map((swap, index) => (
              <li
                key={`${swap.from}-${swap.to}-${index}`}
                className="flex min-h-14 items-center gap-3 rounded-2xl bg-element py-1.5 ps-4 pe-1.5"
              >
                <span className="sr-only">{t("a11y.swapFromTo", { from: swap.from, to: swap.to })}</span>
                <span aria-hidden className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[15px] text-text">
                  <bdi>{swap.from}</bdi>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                  <bdi>{swap.to}</bdi>
                </span>
                <IconButton
                  trackId="settings.kitchen.swap.remove"
                  onClick={() => onChange({ ...profile, alwaysSwap: profile.alwaysSwap.filter((_, i) => i !== index) })}
                  label={t("a11y.removeSwap", { from: swap.from, to: swap.to })}
                  tooltip={false}
                  icon={<X aria-hidden className="h-[18px] w-[18px]" />}
                  className="hover:bg-selected hover:text-danger"
                />
              </li>
            ))}
          </ul>
        ) : null}
        {profile.alwaysSwap.length >= MAX_SWAPS ? (
          <p className="text-sm text-muted">{t("avoid.limit", { count: MAX_SWAPS })}</p>
        ) : (
          <form
            aria-label={t("settings.kitchenAddSwap")}
            className="flex flex-col gap-2 @md:flex-row @md:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              addSwap();
            }}
          >
            <input
              type="text"
              aria-label={t("settings.kitchenSwapFrom")}
              placeholder={t("settings.kitchenSwapFrom")}
              value={swapFrom}
              maxLength={60}
              onChange={(event) => setSwapFrom(event.target.value)}
              className={cn(inputClass, "@md:flex-1")}
            />
            <ArrowRight aria-hidden className="hidden h-4 w-4 shrink-0 text-muted @md:block rtl:rotate-180" />
            <input
              type="text"
              aria-label={t("settings.kitchenSwapTo")}
              placeholder={t("settings.kitchenSwapTo")}
              value={swapTo}
              maxLength={60}
              onChange={(event) => setSwapTo(event.target.value)}
              className={cn(inputClass, "@md:flex-1")}
            />
            <Button type="submit" variant="secondary" trackId="settings.kitchen.swap.add" disabled={!swapFrom.trim() || !swapTo.trim()}>
              {t("settings.kitchenAddSwap")}
            </Button>
          </form>
        )}
      </SettingsCard>

      {/* Staples moved to the Pantry page (PIN-181), next to everything else that's at home. */}
      <SettingsCard title={t("settings.kitchenPantry")} hint={t("pantry.staplesMoved")}>
        <Link href="/settings/pantry" data-track="settings.kitchen.pantry.open" className={buttonClasses({ variant: "secondary" })}>
          {t("pantry.title")}
          <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </SettingsCard>

      <SettingsCard title={t("settings.kitchenAfterSnap")}>
        <SwitchRow
          label={t("settings.kitchenAutoApply")}
          hint={t("settings.kitchenAutoApplyHint")}
          checked={profile.autoApplyOnExtract}
          onChange={(next) => onChange({ ...profile, autoApplyOnExtract: next })}
          trackId="settings.kitchen.auto_apply.toggle"
        />
        <p className="mt-3 text-sm leading-relaxed text-muted">{summary}</p>
      </SettingsCard>

      <SettingsCard title={t("hub.title")}>
        <SwitchRow label={t("settings.contributeToHub")} hint={t("settings.contributeToHubHint")} checked={contributeToHub} onChange={onContributeToHubChange} trackId="settings.kitchen.contribute_to_hub.toggle" />
      </SettingsCard>
    </>
  );
}

/** One line for the page's two stores (the kitchen profile, and "My appliances" on the account). */
function combinedStatus(a: SaveStatus, b: SaveStatus): SaveStatus {
  if (a === "saving" || b === "saving") return "saving";
  if (a === "failed" || b === "failed") return "failed";
  if (a === "saved" || b === "saved") return "saved";
  return "idle";
}
