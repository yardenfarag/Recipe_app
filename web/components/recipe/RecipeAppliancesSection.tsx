"use client";

import {
  Amphora,
  Blender,
  Cake,
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
  UtensilsCrossed,
  Wand,
  Waves,
  Weight,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { convertStepAmounts } from "@shared/lib/convertStepAmounts";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  applianceAlternativeKey,
  applianceNameKey,
  applianceSteps,
  groupAppliances,
  isBasicAppliance,
} from "@shared/lib/applianceDisplay";
import { recipeAppliancesOf, type ApplianceKey, type RecipeAppliance } from "@shared/lib/appliances";

import type { RecipeDisplay } from "@/components/recipe/types";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

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

function ApplianceIcon({ appliance, className }: { appliance: ApplianceKey; className?: string }) {
  const Icon = APPLIANCE_ICONS[appliance];
  return <Icon aria-hidden className={className} />;
}

/**
 * "What you'll need" (ADR 017): what the recipe can't be made without, then what makes it better, with Pinch's
 * tips last. Each appliance opens the steps it's used in. Nothing shows for a recipe that was never analysed; an
 * analysed recipe that needs nothing says so.
 */
export function RecipeAppliancesSection({ display, system }: { display: RecipeDisplay; system: MeasurementSystem }) {
  const { t } = useTranslation();
  const appliances = useMemo(() => recipeAppliancesOf(display.recipe), [display.recipe]);
  const [open, setOpen] = useState<RecipeAppliance | null>(null);

  if (appliances === null) return null;

  const { required, better } = groupAppliances(appliances);

  const describe = (item: RecipeAppliance) => {
    const parts: string[] = [];
    if (item.benefit) parts.push(t(`appliances.benefits.${item.benefit}`));
    const alternativeKey = applianceAlternativeKey(item.alternative);
    if (alternativeKey) parts.push(t("appliances.alternative", { alternative: t(alternativeKey) }));
    return parts.join(" · ");
  };

  const kindLabel = (item: RecipeAppliance) =>
    item.origin === "tip" ? t("appliances.pinchTip") : item.required ? t("appliances.required") : t("appliances.optional");

  const chip = (item: RecipeAppliance) => {
    const name = t(applianceNameKey(item.key));
    const basic = item.required && isBasicAppliance(item.key);
    const filled = item.required && !basic;
    return (
      <button
        key={item.key}
        type="button"
        aria-haspopup="dialog"
        aria-label={[name, kindLabel(item), describe(item)].filter(Boolean).join(", ")}
        data-testid={`appliance-chip-${item.key}`}
        onClick={() => setOpen(item)}
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 transition-colors active:scale-[0.98]",
          filled
            ? "border-primary-soft bg-primary-soft text-[15px] font-semibold text-primary hover:border-primary/40"
            : "border-border text-sm font-medium text-muted hover:bg-element hover:text-text",
        )}
      >
        <ApplianceIcon appliance={item.key} className={basic ? "h-4 w-4" : "h-[18px] w-[18px]"} />
        {name}
      </button>
    );
  };

  const groupTitle = (label: string) => <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase">{label}</h3>;

  return (
    <section aria-labelledby="recipe-appliances-heading" className="mt-8" data-testid="recipe-appliances">
      <h2 id="recipe-appliances-heading" className="text-xl font-bold text-text">
        {t("appliances.title")}
      </h2>

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

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open ? (
          <ApplianceDialog
            appliance={open}
            name={t(applianceNameKey(open.key))}
            kind={kindLabel(open)}
            detail={describe(open)}
            display={display}
            system={system}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

/** One appliance: what kind it is, why it helps, and the steps that use it, in the recipe's own direction. */
function ApplianceDialog({
  appliance,
  name,
  kind,
  detail,
  display,
  system,
}: {
  appliance: RecipeAppliance;
  name: string;
  kind: string;
  detail: string;
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
