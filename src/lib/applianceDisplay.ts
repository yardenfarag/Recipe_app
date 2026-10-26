import {
  APPLIANCE_CATALOG,
  type ApplianceKey,
  isApplianceKey,
  isSpecialAppliance,
  numberedSteps,
  type RecipeAppliance,
} from '@/lib/appliances';

/** How "What you'll need" splits a recipe's appliances (ADR 017 decision 4). */
export type ApplianceGroups = {
  /** Can't make the recipe without these. */
  required: RecipeAppliance[];
  /** Optional items from the recipe, then Pinch tips last. */
  better: RecipeAppliance[];
};

export function groupAppliances(appliances: RecipeAppliance[]): ApplianceGroups {
  const required = appliances.filter((a) => a.required && a.origin === 'source');
  const optional = appliances.filter((a) => !a.required && a.origin === 'source');
  const tips = appliances.filter((a) => a.origin === 'tip');
  return { required, better: [...optional, ...tips] };
}

/**
 * Keys for a list card's "Needs: …" line: special, required, from the recipe. Never basics (an oven
 * is noise) and never tips (Yarden's guardrail). At most `max`, in the recipe's order.
 */
export function cardApplianceKeys(appliances: RecipeAppliance[] | null, max = 2): ApplianceKey[] {
  if (!appliances) return [];
  return appliances
    .filter((a) => a.required && a.origin === 'source' && isSpecialAppliance(a.key))
    .map((a) => a.key)
    .slice(0, max);
}

/** The steps an appliance is used in, with their text, for the "used in step …" sheet. */
export function applianceSteps(
  appliance: RecipeAppliance,
  instructions: unknown,
): { step: number; text: string }[] {
  const byNumber = new Map(numberedSteps(instructions).map((s) => [s.step, s.text]));
  return appliance.steps.flatMap((step) => {
    const text = byNumber.get(step);
    return text ? [{ step, text }] : [];
  });
}

/** i18n key for an appliance name, e.g. appliances.names.stand_mixer. */
export function applianceNameKey(key: ApplianceKey): string {
  return `appliances.names.${key}`;
}

/** i18n key for the "or …" workaround: another appliance's name, or a fixed workaround phrase. */
export function applianceAlternativeKey(alternative: RecipeAppliance['alternative']): string | null {
  if (!alternative) return null;
  return isApplianceKey(alternative) ? applianceNameKey(alternative) : `appliances.alternatives.${alternative}`;
}

export function isBasicAppliance(key: ApplianceKey): boolean {
  return APPLIANCE_CATALOG[key].tier === 'basic';
}
