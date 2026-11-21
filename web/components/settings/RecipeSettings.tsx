"use client";

import { ArrowRight, Minus, Plus, Scale, UtensilsCrossed, X } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { avoidListIsEmpty } from "@shared/lib/avoidList";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import {
  MAX_PANTRY_STAPLES,
  addPantryStaple,
  removePantryStaple,
  type KitchenDietKey,
  type KitchenProfile,
} from "@shared/lib/kitchenProfile";
import { RECIPE_VARIANTS } from "@shared/lib/recipeVariants";

import { AvoidListEditor } from "@/components/settings/AvoidListEditor";
import { AddItemField, ChoiceGroup, RemovableChip, SaveStatusLine, SettingsCard, SubHeading, SwitchRow, ToggleChip } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useKitchenSettings } from "@/lib/settings/useKitchenSettings";

/** The mobile app's limits (src/app/settings/recipe.tsx and sanitizeKitchenProfile). */
const MAX_DIETS = 4;
const MAX_SWAPS = 8;
const MAX_SERVINGS = 24;

const DIET_KEYS = RECIPE_VARIANTS.map((variant) => variant.key as KitchenDietKey);

/**
 * How recipes come out for this cook: spoons or grams, diets, allergies and dislikes, swaps, pantry staples, what
 * happens after a Snap, and sharing imports to the Cooking Hub. Everything but spoons or grams is saved on the
 * account the moment it changes, so the mobile app shows it after a refresh.
 */
export function RecipeSettings() {
  const { t } = useTranslation();
  const kitchen = useKitchenSettings();

  return (
    <>
      <SettingsPageHeader id="recipe" actions={<SaveStatusLine status={kitchen.status} />} />
      <div className="flex flex-col gap-5">
        <MeasurementCard />
        {kitchen.loadFailed ? (
          <ErrorState body={t("common.tryAgain")} onRetry={() => void kitchen.retry()} />
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

function MeasurementCard() {
  const { t } = useTranslation();
  const { system, setSystem } = useMeasurementSystem();
  const options: { value: MeasurementSystem; label: string; Icon: typeof Scale }[] = [
    { value: "original", label: t("measurement.spoons"), Icon: UtensilsCrossed },
    { value: "metric", label: t("measurement.grams"), Icon: Scale },
  ];
  return (
    <SettingsCard title={t("settings.measurements")} hint={t("settings.measurementsHint")}>
      <ChoiceGroup
        label={t("settings.measurements")}
        value={system}
        onChange={setSystem}
        className="grid max-w-md grid-cols-2 gap-2 rounded-2xl bg-primary-soft p-1"
        optionClassName="flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:text-text data-[checked]:bg-surface data-[checked]:text-primary data-[checked]:shadow-soft"
        options={options.map(({ value, label, Icon }) => ({
          value,
          label,
          content: (
            <>
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </>
          ),
        }))}
      />
      {/* The mobile app keeps this choice on the phone, not the account, so each keeps its own. */}
      <p className="mt-3 text-sm text-muted">{t("web.settings.measurementsDeviceNote")}</p>
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
  const [pantryDraft, setPantryDraft] = useState("");
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

  function addPantry() {
    const next = addPantryStaple(profile, pantryDraft);
    if (next === profile) return;
    setPantryDraft("");
    onChange(next);
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

  const stepper =
    "grid h-10 w-10 place-items-center rounded-full bg-element text-text transition-colors hover:bg-selected aria-disabled:pointer-events-none aria-disabled:opacity-40";

  return (
    <>
      <SettingsCard title={t("settings.kitchenHowICook")} hint={t("settings.kitchenHint")}>
        <SubHeading>{t("settings.kitchenDiets")}</SubHeading>
        <div role="group" aria-label={t("settings.kitchenDiets")} className="flex flex-wrap gap-2">
          {DIET_KEYS.map((key) => {
            const on = profile.diets.includes(key);
            return (
              <ToggleChip key={key} pressed={on} disabled={dietsFull && !on} onToggle={() => toggleDiet(key)}>
                {t(`recipe.variants.${key}.label`)}
              </ToggleChip>
            );
          })}
        </div>
        {dietsFull ? <p className="mt-2 text-sm text-muted">{t("avoid.limit", { count: MAX_DIETS })}</p> : null}

        <div className="mt-6">
          <SubHeading id={servingsLabelId}>{t("settings.kitchenServings")}</SubHeading>
          <div role="group" aria-labelledby={servingsLabelId} className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={t("recipe.decreaseServings")}
              aria-disabled={servings == null}
              onClick={() => servings != null && setServings(servings - 1)}
              className={stepper}
            >
              <Minus aria-hidden className="h-[18px] w-[18px]" />
            </button>
            <output aria-live="polite" className="min-w-12 text-center text-lg font-bold tabular-nums text-text">
              {servings == null ? t("settings.kitchenServingsOff") : servings}
              {servings != null ? <span className="sr-only"> {t("settings.kitchenPreviewServings", { count: servings })}</span> : null}
            </output>
            <button
              type="button"
              aria-label={t("recipe.increaseServings")}
              aria-disabled={servings === MAX_SERVINGS}
              onClick={() => servings !== MAX_SERVINGS && setServings(servings == null ? 2 : servings + 1)}
              className={stepper}
            >
              <Plus aria-hidden className="h-[18px] w-[18px]" />
            </button>
            {servings != null ? (
              <button
                type="button"
                onClick={() => setServings(undefined)}
                aria-label={t("a11y.clearDefaultServings")}
                className="h-9 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
              >
                {t("common.clear")}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted">{t("settings.kitchenServingsHint")}</p>
        </div>
      </SettingsCard>

      <AvoidListEditor profile={profile} onChange={onChange} />

      <SettingsCard title={t("settings.kitchenAlwaysSwap")}>
        {profile.alwaysSwap.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {profile.alwaysSwap.map((swap, index) => (
              <li
                key={`${swap.from}-${swap.to}-${index}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2"
              >
                <span className="sr-only">{t("a11y.swapFromTo", { from: swap.from, to: swap.to })}</span>
                <span aria-hidden className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[15px] text-text">
                  <bdi>{swap.from}</bdi>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                  <bdi>{swap.to}</bdi>
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ ...profile, alwaysSwap: profile.alwaysSwap.filter((_, i) => i !== index) })}
                  aria-label={t("a11y.removeSwap", { from: swap.from, to: swap.to })}
                  className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-element hover:text-danger"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
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
              className={inputClass}
            />
            <ArrowRight aria-hidden className="hidden h-4 w-4 shrink-0 text-muted @md:block rtl:rotate-180" />
            <input
              type="text"
              aria-label={t("settings.kitchenSwapTo")}
              placeholder={t("settings.kitchenSwapTo")}
              value={swapTo}
              maxLength={60}
              onChange={(event) => setSwapTo(event.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={!swapFrom.trim() || !swapTo.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary-soft px-5 text-sm font-semibold text-primary transition-[filter] hover:brightness-97 disabled:opacity-45"
            >
              {t("settings.kitchenAddSwap")}
            </button>
          </form>
        )}
      </SettingsCard>

      <SettingsCard title={t("settings.kitchenPantry")} hint={t("settings.kitchenPantryHint")}>
        {profile.pantryStaples.length === 0 ? (
          <p className="mb-3 text-sm text-muted">{t("settings.kitchenPantryEmpty")}</p>
        ) : (
          <div className="mb-3 flex flex-wrap gap-2">
            {profile.pantryStaples.map((staple) => (
              <RemovableChip key={staple} label={staple} onRemove={() => onChange(removePantryStaple(profile, staple))} />
            ))}
          </div>
        )}
        {profile.pantryStaples.length >= MAX_PANTRY_STAPLES ? (
          <p className="text-sm text-muted">{t("avoid.limit", { count: MAX_PANTRY_STAPLES })}</p>
        ) : (
          <AddItemField
            label={t("settings.kitchenPantryPlaceholder")}
            value={pantryDraft}
            onChange={setPantryDraft}
            onAdd={addPantry}
            maxLength={60}
            addLabel={t("settings.kitchenPantryAdd")}
          />
        )}
      </SettingsCard>

      <SettingsCard title={t("settings.kitchenAfterSnap")}>
        <SwitchRow
          label={t("settings.kitchenAutoApply")}
          hint={t("settings.kitchenAutoApplyHint")}
          checked={profile.autoApplyOnExtract}
          onChange={(next) => onChange({ ...profile, autoApplyOnExtract: next })}
        />
        <p className="mt-3 text-sm leading-relaxed text-muted">{summary}</p>
      </SettingsCard>

      <SettingsCard title={t("hub.title")}>
        <SwitchRow label={t("settings.contributeToHub")} hint={t("settings.contributeToHubHint")} checked={contributeToHub} onChange={onContributeToHubChange} />
      </SettingsCard>

      {/* "My appliances" (PIN-139) has no place in the kitchen profile yet: the mobile app has no such setting. */}
    </>
  );
}

const inputClass =
  "h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-[15px] text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15";
