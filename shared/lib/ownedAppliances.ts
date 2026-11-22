/**
 * "My appliances" (PIN-155): which kitchen appliances a cook has, so a recipe that needs one they don't have can say
 * so, and "Make it without these" can work around it.
 *
 * Where it lives: `auth.users.user_metadata.appliances`, `{ owned: string[], notOwned: string[], savedAt }`.
 * - Not the kitchen profile: released mobile builds rebuild that object with `sanitizeKitchenProfile`, which drops
 *   fields it doesn't know, so an older app would wipe the list on its next save. GoTrue merges `updateUser({ data })`
 *   one top-level key deep, so older apps (which only write `prefs`, `locale`…) leave `appliances` alone.
 * - Both lists are kept, not just `owned`: an appliance the catalog gains later was never offered, so it is neither,
 *   and never warns. Keys this build doesn't know (a newer catalog) are kept on write.
 *
 * Semantics:
 * - No `appliances` (or `null`): never answered. Recipes behave as before: no warnings, no marks.
 * - Once saved, a recipe's required appliance that is in `notOwned` is "missing", unless the recipe's own stand-in is
 *   something the cook has ("or a stick blender").
 * - Basics (stovetop, oven, microwave; ADR 017 tier `basic`) start ticked, and count as owned unless unticked.
 */
import {
  APPLIANCE_CATALOG,
  APPLIANCE_CATEGORIES,
  APPLIANCE_KEYS,
  isApplianceKey,
  type AlternativeKey,
  type ApplianceCategory,
  type ApplianceKey,
  type RecipeAppliance,
} from './appliances';

export const OWNED_APPLIANCES_METADATA_KEY = 'appliances';

/** What the cook said about their kitchen. `null` where it is used = never answered. */
export interface KitchenAppliances {
  /** Ticked: in the kitchen. Catalog order. */
  owned: ApplianceKey[];
  /** Offered and left unticked: not in the kitchen. Catalog order. */
  notOwned: ApplianceKey[];
}

/** One group of the settings checklist. `basics` holds stovetop, oven and microwave. */
export interface ApplianceChecklistGroup {
  id: ApplianceCategory | 'basics';
  keys: ApplianceKey[];
}

export const BASIC_APPLIANCE_KEYS: ApplianceKey[] = APPLIANCE_KEYS.filter((key) => APPLIANCE_CATALOG[key].tier === 'basic');

/**
 * The settings checklist: the special appliances by category (catalog order), then the basics, which start ticked.
 * Every key a recipe can flag is here, so nothing a recipe needs goes unasked.
 */
export const APPLIANCE_CHECKLIST: ApplianceChecklistGroup[] = [
  ...APPLIANCE_CATEGORIES.map((category) => ({
    id: category,
    keys: APPLIANCE_KEYS.filter((key) => APPLIANCE_CATALOG[key].category === category && APPLIANCE_CATALOG[key].tier === 'special'),
  })).filter((group) => group.keys.length > 0),
  { id: 'basics', keys: BASIC_APPLIANCE_KEYS },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function knownKeys(value: unknown): Set<ApplianceKey> {
  return new Set(Array.isArray(value) ? value.filter(isApplianceKey) : []);
}

function inCatalogOrder(keys: Set<ApplianceKey>): ApplianceKey[] {
  return APPLIANCE_KEYS.filter((key) => keys.has(key));
}

/** The cook's appliances from `user_metadata`, or null when they never saved a list. Bad values are ignored. */
export function readOwnedAppliances(metadata: unknown): KitchenAppliances | null {
  if (!isRecord(metadata)) return null;
  const stored = metadata[OWNED_APPLIANCES_METADATA_KEY];
  if (!isRecord(stored) || !Array.isArray(stored.owned)) return null;
  const owned = knownKeys(stored.owned);
  const notOwned = knownKeys(stored.notOwned);
  for (const key of owned) notOwned.delete(key);
  return { owned: inCatalogOrder(owned), notOwned: inCatalogOrder(notOwned) };
}

/**
 * Whether the cook has `key`: true, false, or null when that isn't known (never answered, or an appliance they were
 * never offered). A basic they didn't untick counts as owned.
 */
export function ownsAppliance(kitchen: KitchenAppliances | null, key: ApplianceKey): boolean | null {
  if (!kitchen) return null;
  if (kitchen.owned.includes(key)) return true;
  if (kitchen.notOwned.includes(key)) return false;
  return APPLIANCE_CATALOG[key].tier === 'basic' ? true : null;
}

/** The keys ticked in the settings checklist: what the cook has, and the basics they didn't untick. */
export function tickedAppliances(kitchen: KitchenAppliances | null): Set<ApplianceKey> {
  return new Set(APPLIANCE_KEYS.filter((key) => (kitchen ? ownsAppliance(kitchen, key) === true : APPLIANCE_CATALOG[key].tier === 'basic')));
}

/** The list once `key` is ticked or unticked. Starting from never answered, the basics start ticked. */
export function toggleAppliance(kitchen: KitchenAppliances | null, key: ApplianceKey): ApplianceKey[] {
  const ticked = tickedAppliances(kitchen);
  if (ticked.has(key)) ticked.delete(key);
  else ticked.add(key);
  return inCatalogOrder(ticked);
}

/** How many special appliances are ticked (the basics are a given, so they aren't counted). */
export function specialOwnedCount(kitchen: KitchenAppliances | null): number {
  return kitchen ? kitchen.owned.filter((key) => APPLIANCE_CATALOG[key].tier === 'special').length : 0;
}

/**
 * The `data` for `auth.updateUser` that saves `ticked` as the cook's kitchen. Every catalog key not ticked is saved as
 * not owned. Keys this build doesn't know stay in the list they were in, and other fields are kept, so a newer build's
 * additions survive an older one's save.
 */
export function ownedAppliancesUpdate(
  metadata: unknown,
  ticked: Iterable<ApplianceKey>,
  now: () => Date = () => new Date(),
): Record<string, unknown> {
  const existing = isRecord(metadata) && isRecord(metadata[OWNED_APPLIANCES_METADATA_KEY])
    ? (metadata[OWNED_APPLIANCES_METADATA_KEY] as Record<string, unknown>)
    : {};
  const unknown = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !isApplianceKey(item)) : [];
  const owned = new Set([...ticked].filter(isApplianceKey));
  return {
    [OWNED_APPLIANCES_METADATA_KEY]: {
      ...existing,
      owned: [...inCatalogOrder(owned), ...unknown(existing.owned)],
      notOwned: [...APPLIANCE_KEYS.filter((key) => !owned.has(key)), ...unknown(existing.notOwned)],
      savedAt: now().toISOString(),
    },
  };
}

/** The `data` that forgets the list: back to never answered, so recipes stop checking. */
export function clearOwnedAppliancesUpdate(): Record<string, unknown> {
  return { [OWNED_APPLIANCES_METADATA_KEY]: null };
}

export function sameKitchenAppliances(a: KitchenAppliances | null, b: KitchenAppliances | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.owned.join() === b.owned.join() && a.notOwned.join() === b.notOwned.join();
}

// ---------------------------------------------------------------------------------------------
// A recipe against the kitchen
// ---------------------------------------------------------------------------------------------

/** How one of the recipe's appliances stands in this kitchen. null = unknown, show it as before. */
export type ApplianceFit =
  /** In the kitchen. */
  | 'owned'
  /** Not in the kitchen, but the recipe's own stand-in is (or is a way, like "by hand"). */
  | 'covered'
  /** Not in the kitchen. For a required appliance, this is what the recipe page warns about. */
  | 'missing';

export interface KitchenCheck {
  /** Required by the recipe, not in the kitchen, and no stand-in the cook has. Recipe order. */
  missing: ApplianceKey[];
  /** Required and not in the kitchen, but the recipe names a stand-in the cook has. */
  covered: { key: ApplianceKey; alternative: ApplianceKey | AlternativeKey }[];
  /** True when the cook's list is known and every required appliance is there (or covered). */
  ready: boolean;
}

export const EMPTY_KITCHEN_CHECK: KitchenCheck = Object.freeze({ missing: [], covered: [], ready: false }) as KitchenCheck;

function usableAlternative(kitchen: KitchenAppliances, item: RecipeAppliance): ApplianceKey | AlternativeKey | null {
  const { alternative } = item;
  if (!alternative) return null;
  if (!isApplianceKey(alternative)) return alternative;
  return ownsAppliance(kitchen, alternative) === true ? alternative : null;
}

export function applianceFit(item: RecipeAppliance, kitchen: KitchenAppliances | null): ApplianceFit | null {
  const owns = ownsAppliance(kitchen, item.key);
  if (owns === null || !kitchen) return null;
  if (owns) return 'owned';
  return usableAlternative(kitchen, item) ? 'covered' : 'missing';
}

/** The recipe's required appliances against the kitchen. Never answered, or a recipe never analysed: nothing. */
export function checkKitchen(appliances: RecipeAppliance[] | null, kitchen: KitchenAppliances | null): KitchenCheck {
  if (!kitchen || !appliances) return EMPTY_KITCHEN_CHECK;
  const missing: ApplianceKey[] = [];
  const covered: KitchenCheck['covered'] = [];
  for (const item of appliances) {
    if (!item.required || item.origin !== 'source') continue;
    const fit = applianceFit(item, kitchen);
    if (fit === 'missing') missing.push(item.key);
    else if (fit === 'covered') covered.push({ key: item.key, alternative: usableAlternative(kitchen, item)! });
  }
  const required = appliances.some((item) => item.required && item.origin === 'source');
  return { missing, covered, ready: required && missing.length === 0 };
}

/** True when the recipe needs a special appliance and the cook hasn't said what they have: worth a gentle nudge. */
export function worthAskingAboutAppliances(appliances: RecipeAppliance[] | null, kitchen: KitchenAppliances | null): boolean {
  if (kitchen || !appliances) return false;
  return appliances.some((item) => item.required && item.origin === 'source' && APPLIANCE_CATALOG[item.key].tier === 'special');
}

// ---------------------------------------------------------------------------------------------
// "Make it without these" (English, for the model)
// ---------------------------------------------------------------------------------------------

/** "stand mixer", "mortar and pestle": the catalog key read as English, which is what the model needs. */
export function applianceEnglishName(key: ApplianceKey): string {
  return key.replace(/_/g, ' ');
}

function englishList(names: string[], joiner: 'or' | 'and'): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${joiner} ${names[names.length - 1]}`;
}

const MAX_HELPERS = 4;

/**
 * "My kitchen has no stand mixer: change the steps so I can make it without it. I can use my hand mixer" for the remix
 * model, or null when nothing is missing. The appliances the cook has in the same groups as the missing ones are named,
 * so the workaround uses them rather than guessing.
 */
export function applianceWorkaroundInstruction(missing: ApplianceKey[], kitchen: KitchenAppliances | null): string | null {
  if (missing.length === 0) return null;
  const names = missing.map(applianceEnglishName);
  const it = missing.length === 1 ? 'it' : 'them';
  const sentence = `My kitchen has no ${englishList(names, 'or')}: change the steps so I can make it without ${it}`;
  const categories = new Set(missing.map((key) => APPLIANCE_CATALOG[key].category));
  const helpers = (kitchen?.owned ?? [])
    .filter((key) => categories.has(APPLIANCE_CATALOG[key].category) && !missing.includes(key))
    .slice(0, MAX_HELPERS)
    .map(applianceEnglishName);
  return helpers.length > 0 ? `${sentence}. I can use my ${englishList(helpers, 'and')}` : sentence;
}
