"use client";

import {
  Amphora,
  Blender,
  Cake,
  Check,
  Citrus,
  Cog,
  CookingPot,
  Croissant,
  Drumstick,
  Droplets,
  EggFried,
  Fan,
  Flame,
  Gauge,
  GlassWater,
  Grid3x3,
  Haze,
  Heater,
  Hourglass,
  IceCreamCone,
  Lightbulb,
  Microwave,
  Pizza,
  Sandwich,
  Slice,
  Soup,
  Sun,
  Thermometer,
  TriangleAlert,
  UtensilsCrossed,
  Wand,
  Waves,
  Weight,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { convertStepAmounts } from "@shared/lib/convertStepAmounts";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";

import {
  applianceAlternativeKey,
  applianceNameKey,
  applianceSteps,
  groupAppliances,
  isBasicAppliance,
} from "@shared/lib/applianceDisplay";
import { isApplianceKey, recipeAppliancesOf, type ApplianceKey, type RecipeAppliance } from "@shared/lib/appliances";
import { applianceFit, checkKitchen, worthAskingAboutAppliances, type ApplianceFit, type KitchenCheck } from "@shared/lib/ownedAppliances";

import { useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import type { RecipeDisplay } from "@/components/recipe/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { useOwnedAppliances } from "@/lib/settings/ownedAppliances";

/** Where "My appliances" is edited (Settings → Recipe preferences). */
export const MY_APPLIANCES_HREF = "/settings/recipe#appliances";

/**
 * One icon per catalog key, the web's take on mobile's ApplianceIcon. A Record, so a new key without an icon is a
 * type error. Lucide has no oven, mixer or wok, so those borrow the nearest shape or a neutral utensil.
 */
const APPLIANCE_ICONS: Record<ApplianceKey, LucideIcon> = {
  stovetop: Flame,
  oven: Heater,
  microwave: Microwave,
  toaster: Sandwich,
  grill: Drumstick,
  air_fryer: Fan,
  deep_fryer: Droplets,
  slow_cooker: Hourglass,
  pressure_cooker: Gauge,
  rice_cooker: Soup,
  sous_vide: Waves,
  blender: Blender,
  immersion_blender: Wand,
  food_processor: Cog,
  stand_mixer: Croissant,
  hand_mixer: UtensilsCrossed,
  spice_grinder: Wheat,
  mortar_and_pestle: Amphora,
  kitchen_thermometer: Thermometer,
  kitchen_scale: Weight,
  zester: Citrus,
  mandoline: Slice,
  cast_iron_pan: EggFried,
  dutch_oven: CookingPot,
  wok: UtensilsCrossed,
  springform_pan: Cake,
  pizza_stone: Pizza,
  ice_cream_maker: IceCreamCone,
  waffle_maker: Grid3x3,
  juicer: GlassWater,
  dehydrator: Sun,
  smoker: Haze,
};

/** The catalog key's icon. Also used by Settings → My appliances. */
export function ApplianceIcon({ appliance, className }: { appliance: ApplianceKey; className?: string }) {
  const Icon = APPLIANCE_ICONS[appliance];
  return <Icon aria-hidden className={className} />;
}

/**
 * "What you'll need" (ADR 017): what the recipe can't be made without, then what makes it better, with Pinch's
 * tips last. Each appliance opens the steps it's used in. Nothing shows for a recipe that was never analysed; an
 * analysed recipe that needs nothing says so.
 *
 * Once the reader has saved "My appliances" (PIN-155), each one is marked as in their kitchen or not, and a required
 * one they don't have gets a note with "Make it without these" on a saved recipe. Before that, a recipe that needs
 * something special offers to set the list up, in one quiet line.
 */
export function RecipeAppliancesSection({ display, system }: { display: RecipeDisplay; system: MeasurementSystem }) {
  const { t } = useTranslation();
  const actions = useRecipeActions();
  const owned = useOwnedAppliances();
  const kitchen = owned.kitchen;
  const appliances = useMemo(() => recipeAppliancesOf(display.recipe), [display.recipe]);
  const check = useMemo(() => checkKitchen(appliances, kitchen), [appliances, kitchen]);
  const [open, setOpen] = useState<RecipeAppliance | null>(null);

  if (appliances === null) return null;

  const { required, better } = groupAppliances(appliances);
  const ask = owned.userId !== null && worthAskingAboutAppliances(appliances, kitchen);

  const describe = (item: RecipeAppliance) => {
    const parts: string[] = [];
    if (item.benefit) parts.push(t(`appliances.benefits.${item.benefit}`));
    const alternativeKey = applianceAlternativeKey(item.alternative);
    if (alternativeKey) parts.push(t("appliances.alternative", { alternative: t(alternativeKey) }));
    return parts.join(" · ");
  };

  const kindLabel = (item: RecipeAppliance) =>
    item.origin === "tip" ? t("appliances.pinchTip") : item.required ? t("appliances.required") : t("appliances.optional");

  const fitLabel = (fit: ApplianceFit | null) =>
    fit === "owned" ? t("myAppliances.inKitchen") : fit === "missing" || fit === "covered" ? t("myAppliances.notInKitchen") : null;

  const chip = (item: RecipeAppliance) => {
    const name = t(applianceNameKey(item.key));
    const basic = item.required && isBasicAppliance(item.key);
    const fit = applianceFit(item, kitchen);
    // A required appliance the reader doesn't have (and has no stand-in for) is the one thing worth a warning.
    const warn = fit === "missing" && item.required;
    const filled = item.required && !basic && !warn;
    return (
      <button
        key={item.key}
        type="button"
        aria-haspopup="dialog"
        aria-label={[name, kindLabel(item), fitLabel(fit), describe(item)].filter(Boolean).join(", ")}
        data-testid={`appliance-chip-${item.key}`}
        data-fit={fit ?? undefined}
        data-track="recipe.appliance.open"
        onClick={() => setOpen(item)}
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 transition-colors active:scale-[0.98]",
          warn
            ? "border-warning/50 bg-warning-soft text-[15px] font-semibold text-warning hover:border-warning"
            : filled
              ? "border-primary-soft bg-primary-soft text-[15px] font-semibold text-primary hover:border-primary/40"
              : "border-border text-sm font-medium text-muted hover:bg-element hover:text-text",
          fit === "missing" && !item.required && "border-dashed",
        )}
      >
        <ApplianceIcon appliance={item.key} className={basic ? "h-4 w-4" : "h-[18px] w-[18px]"} />
        {name}
        {fit === "owned" ? <Check aria-hidden className="-me-0.5 h-4 w-4 text-success" /> : null}
        {warn ? <TriangleAlert aria-hidden className="-me-0.5 h-4 w-4" /> : null}
      </button>
    );
  };

  const groupTitle = (label: string) => <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase">{label}</h3>;

  return (
    <section aria-labelledby="recipe-appliances-heading" className="mt-8" data-testid="recipe-appliances">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="recipe-appliances-heading" className="text-xl font-bold text-text">
          {t("appliances.title")}
        </h2>
        {check.ready ? (
          <span
            data-testid="appliances-ready"
            className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success"
          >
            <Check aria-hidden className="h-3.5 w-3.5" />
            {t("myAppliances.haveEverything")}
          </span>
        ) : null}
      </div>

      {appliances.length === 0 ? <p className="mt-2 text-[15px] text-muted">{t("appliances.none")}</p> : null}

      {required.length > 0 || better.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-x-12 gap-y-6">
          {required.length > 0 ? (
            <div data-testid="appliances-required" className="min-w-0">
              {groupTitle(t("appliances.required"))}
              <div className="flex flex-wrap gap-2">{required.map(chip)}</div>
            </div>
          ) : null}

          {better.length > 0 ? (
            <div data-testid="appliances-better" className="min-w-0 flex-1 basis-80">
              {groupTitle(t("appliances.better"))}
              <ul className="flex flex-col gap-2.5">
                {better.map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {chip(item)}
                    {item.origin === "tip" ? (
                      <span
                        data-testid={`appliance-tip-${item.key}`}
                        className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"
                      >
                        <Lightbulb aria-hidden className="h-3.5 w-3.5" />
                        {t("appliances.pinchTip")}
                      </span>
                    ) : null}
                    {describe(item) ? (
                      <span aria-hidden className="min-w-0 text-sm text-muted">
                        {describe(item)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <KitchenNote check={check} canFix={Boolean(actions?.canFix)} onFix={() => actions?.open({ kind: "fix" })} />

      {ask ? (
        <p data-testid="appliances-ask" className="mt-4 text-sm text-muted">
          <Link href={MY_APPLIANCES_HREF} data-track="recipe.appliances.ask" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t("myAppliances.askLink")}
          </Link>{" "}
          {t("myAppliances.askHint")}
        </p>
      ) : null}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open ? (
          <ApplianceDialog
            appliance={open}
            name={t(applianceNameKey(open.key))}
            kind={kindLabel(open)}
            detail={describe(open)}
            fit={fitLabel(applianceFit(open, kitchen))}
            display={display}
            system={system}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

/**
 * What the reader's kitchen is missing for this recipe, and the way round it: "Make it without these" on a saved
 * recipe, and a link to correct the list (they may have one after all). A stand-in they have is said quietly.
 */
function KitchenNote({ check, canFix, onFix }: { check: KitchenCheck; canFix: boolean; onFix: () => void }) {
  const { t } = useTranslation();
  if (check.missing.length === 0 && check.covered.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-3">
      {check.missing.length > 0 ? (
        <div data-testid="appliances-missing" role="note" className="flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3.5">
          <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-sm leading-relaxed">
            <p className="font-semibold text-warning">{t("myAppliances.missingTitle")}</p>
            <p className="mt-0.5 font-semibold text-text">{check.missing.map((key) => t(applianceNameKey(key))).join(", ")}</p>
            <p className="mt-1 text-muted">
              {canFix
                ? t("myAppliances.missingFix", { count: check.missing.length })
                : t("myAppliances.missingNoFix", { count: check.missing.length })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {canFix ? (
                <Button size="sm" variant="outline" aria-haspopup="dialog" onClick={onFix} trackId="recipe.appliances.make_without">
                  {t("avoid.makeWithout")}
                </Button>
              ) : null}
              <Link href={MY_APPLIANCES_HREF} data-track="recipe.appliances.edit" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                {t("myAppliances.editLink")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      {check.covered.length > 0 ? (
        <ul data-testid="appliances-covered" className="flex flex-col gap-1 text-sm text-muted">
          {check.covered.map(({ key, alternative }) => (
            <li key={key} className="flex items-center gap-2">
              <Check aria-hidden className="h-4 w-4 shrink-0 text-success" />
              <span>
                <span className="font-semibold text-text">{t(applianceNameKey(key))}: </span>
                {isApplianceKey(alternative)
                  ? t("myAppliances.standInWorks", { alternative: t(applianceNameKey(alternative)) })
                  : t("appliances.alternative", { alternative: t(`appliances.alternatives.${alternative}`) })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One appliance: what kind it is, why it helps, and the steps that use it, in the recipe's own direction. */
function ApplianceDialog({
  appliance,
  name,
  kind,
  detail,
  fit,
  display,
  system,
}: {
  appliance: RecipeAppliance;
  name: string;
  kind: string;
  detail: string;
  /** "In your kitchen" or "Not in your kitchen", once the reader has saved their list. */
  fit: string | null;
  display: RecipeDisplay;
  system: MeasurementSystem;
}) {
  const { t } = useTranslation();
  // Steps quote amounts ("3 tbsp butter"); show them in the chosen system, as the steps list does.
  const converted = display.instructions.map((step) => ({
    ...step,
    text: convertStepAmounts(step.text, display.ingredients, system, display.unitLanguage),
  }));
  const steps = applianceSteps(appliance, converted);

  return (
    <DialogContent title={name}>
      <div data-testid="appliance-dialog" className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-text">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <ApplianceIcon appliance={appliance.key} className="h-5 w-5" />
          </span>
          {kind}
          {fit ? <span className="font-normal text-muted">· {fit}</span> : null}
        </p>
        {detail ? <p className="text-[15px] leading-relaxed text-muted">{detail}</p> : null}
        {appliance.origin === "tip" ? <p className="text-[15px] leading-relaxed text-muted">{t("appliances.pinchTipExplainer")}</p> : null}
        {steps.length > 0 ? (
          <div>
            <h3 className="text-[15px] font-semibold text-text">
              {t(steps.length === 1 ? "appliances.usedInStepOne" : "appliances.usedInStepOther", {
                steps: steps.map((s) => s.step).join(", "),
              })}
            </h3>
            <ol dir={display.direction} lang={display.contentLanguage ?? undefined} role="list" className="mt-2 flex flex-col gap-2">
              {steps.map((s) => (
                <li
                  key={s.step}
                  data-testid={`appliance-step-${s.step}`}
                  className="flex gap-3 rounded-2xl bg-surface-soft px-3.5 py-3 text-start text-[15px] leading-relaxed text-text"
                >
                  <span className="shrink-0 font-bold tabular-nums text-primary">{s.step}.</span>
                  <span className="min-w-0">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </DialogContent>
  );
}
