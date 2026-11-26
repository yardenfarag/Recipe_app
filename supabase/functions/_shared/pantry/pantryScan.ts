// PIN-181: reads one photo of a fridge, freezer or cupboard and lists the food in it. One call per photo; the
// app merges the photos of a scan. The model also judges the photo itself, so a bad one gets a "retake" hint
// without a second call.

import { generateLlmJson, sanitizeLlmText } from '../llm/llmClient.ts';
import type { LlmUsageSnapshot } from '../llm/pricing.ts';

const TIMEOUT_MS = 45_000;
/** A very crowded shelf is cut off here; the app then suggests one shelf per photo. */
export const MAX_ITEMS_PER_PHOTO = 40;
const MAX_NAME_CHARS = 60;

export const PANTRY_PLACES = ['fridge', 'freezer', 'cupboard', 'other'] as const;
export type PantryPlace = (typeof PANTRY_PLACES)[number];

export const PHOTO_QUALITIES = ['ok', 'too_dark', 'blurry', 'too_far', 'not_kitchen'] as const;
export type PhotoQuality = (typeof PHOTO_QUALITIES)[number];

/** The shopping list's aisles (shared/lib/shoppingAisles.ts). Deno can't import shared/, so they are repeated. */
export const PANTRY_AISLES = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'other',
] as const;
export type PantryAisle = (typeof PANTRY_AISLES)[number];

export type PantryScanItem = {
  /** Plain ingredient name in the user's app language. */
  name: string;
  /** The same name in English, lower case. Used to match recipes in either language. */
  nameEn: string;
  /** Brand when the model recognised one, else ''. Shown as a note, never part of the name. */
  brand: string;
  aisle: PantryAisle;
  /** 'low' items arrive unticked in the review list. */
  confidence: 'high' | 'low';
  /** A tub, bag or jar whose contents can't be told. */
  containerUnknown: boolean;
};

export type PantryScanResult = {
  quality: PhotoQuality;
  items: PantryScanItem[];
  /** The model listed more than MAX_ITEMS_PER_PHOTO. */
  truncated: boolean;
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  he: 'Hebrew',
  ar: 'Arabic',
  ru: 'Russian',
  es: 'Spanish',
};

const PLACE_HINTS: Record<PantryPlace, string> = {
  fridge: 'their fridge',
  freezer: 'their freezer',
  cupboard: 'a kitchen cupboard or pantry shelf',
  other: 'somewhere else in their kitchen (a counter, a spice rack, a fruit bowl)',
};

const SYSTEM_PROMPT = `You look at one photo from a home kitchen and list the food and drink in it, so a cooking app knows what the person has at home. The person will check your list, but most people skim it and approve, so an item you made up ends up as a lie in their pantry.

What to list
- Only what you can see in THIS photo. Never add what a kitchen usually has. If you can't see it, it isn't there.
- Food, drink and cooking ingredients, including wine, beer and spirits. Skip plain water.
- One entry per product. No amounts, no counts. If the same product appears twice, list it once.
- Use what you know about products and brands from every country. A package you recognise by its shape, colours or logo counts even when the name is turned away or half hidden. Read labels in any language.
- At most ${MAX_ITEMS_PER_PHOTO} items. If there are more, keep the ones you are surest of.

Never list
- Medicine, vitamins and supplements.
- Pet food, pet treats and pet supplements.
- Cleaning products, air fresheners, cosmetics and toiletries.
- Things that aren't food: dishes, pots, appliances, paper goods, foil, bags, straws, toothpicks, ice packs.
- Empty bottles, jars and containers.

Each item
- name: what a recipe would call it, in the language named in the message. Plain and short: "ketchup", not "Heinz Tomato Ketchup 500 g". Keep a detail only when it changes how you cook with it: "brown sugar", "soy milk", "smoked paprika", "canned chickpeas".
- name_en: the same plain name in English, lower case.
- brand: the brand if you recognised it, otherwise "".
- aisle: produce, dairy, meat, seafood, bakery, pantry, frozen, spices or other.
- confidence: "high" only when you read the label, recognised the package for certain, or the food itself is unmistakable (whole fruit and vegetables, eggs). Use "low" for everything else: a label you can only partly read, a guess from colour or shape, and things that look alike (flour, sugar and salt; spices in matching jars; kinds of milk; dark sauces).
- container_unknown: true for a tub, bag or jar that clearly holds food you can't identify. Give it a short description as its name ("leftovers in a red tub") and confidence "low". List at most three of these, the biggest ones. Otherwise false.

The photo itself (photo_quality)
- "not_kitchen": the photo doesn't show food or a place where food is kept (a person, a pet, a room, a document, the outdoors). Return no items.
- "too_dark", "blurry" or "too_far": most labels can't be read for that reason, so a second photo would find more. Still list what you can identify. "too_far" means taken from across the room, so the packages are tiny; a crowded shelf, items hidden behind others, or small print are not "too_far".
- "ok": anything else, including a clear photo that happens to hold little or no food. When unsure, say "ok": a wrong "retake" message annoys more than a missed one.

Return ONLY data matching the schema.`;

const SCHEMA = {
  type: 'object',
  properties: {
    photo_quality: { type: 'string', enum: [...PHOTO_QUALITIES] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          name_en: { type: 'string' },
          brand: { type: 'string' },
          aisle: { type: 'string', enum: [...PANTRY_AISLES] },
          confidence: { type: 'string', enum: ['high', 'low'] },
          container_unknown: { type: 'boolean' },
        },
        required: ['name', 'name_en', 'brand', 'aisle', 'confidence', 'container_unknown'],
      },
    },
  },
  required: ['photo_quality', 'items'],
};

function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return sanitizeLlmText(value).replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/** Lower case, single spaces. Two items with the same key are the same product. */
export function pantryNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Turns a model answer into a result the app can trust: known enum values only, no empty or repeated names, no
 * items on a photo that isn't a kitchen, and never more than MAX_ITEMS_PER_PHOTO. Pure, so it is unit-tested.
 */
export function parsePantryScan(data: unknown): PantryScanResult {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const quality = (PHOTO_QUALITIES as readonly string[]).includes(String(raw.photo_quality))
    ? (raw.photo_quality as PhotoQuality)
    : 'ok';
  if (quality === 'not_kitchen') return { quality, items: [], truncated: false };

  const items: PantryScanItem[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(raw.items) ? raw.items : []) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const nameEn = cleanText(row.name_en, MAX_NAME_CHARS).toLowerCase();
    // A model that leaves one of the two names out still found the item.
    const name = cleanText(row.name, MAX_NAME_CHARS) || nameEn;
    if (!name) continue;
    const key = pantryNameKey(nameEn || name);
    if (seen.has(key)) continue;
    seen.add(key);
    const containerUnknown = row.container_unknown === true;
    items.push({
      name,
      nameEn: nameEn || name.toLowerCase(),
      brand: cleanText(row.brand, 40),
      aisle: (PANTRY_AISLES as readonly string[]).includes(String(row.aisle)) ? (row.aisle as PantryAisle) : 'other',
      // Anything but a clear "high" stays unticked, and so does every unidentified container.
      confidence: row.confidence === 'high' && !containerUnknown ? 'high' : 'low',
      containerUnknown,
    });
  }
  return { quality, items: items.slice(0, MAX_ITEMS_PER_PHOTO), truncated: items.length > MAX_ITEMS_PER_PHOTO };
}

export async function scanPantryPhoto(input: {
  imageBase64: string;
  mimeType?: string;
  place: PantryPlace;
  /** App language code. Unknown codes get English names. */
  language: string;
}): Promise<PantryScanResult & { usage: LlmUsageSnapshot | null }> {
  const languageName = LANGUAGE_NAMES[input.language] ?? LANGUAGE_NAMES.en;
  const { data, usage } = await generateLlmJson<unknown>({
    systemPrompt: SYSTEM_PROMPT,
    parts: [
      { imageBase64: input.imageBase64, mimeType: input.mimeType ?? 'image/jpeg' },
      {
        text: `The person says this photo shows ${PLACE_HINTS[input.place]}. Trust the photo over that.\nLanguage for "name": ${languageName}.`,
      },
    ],
    responseSchema: SCHEMA,
    timeoutMs: TIMEOUT_MS,
    maxOutputTokens: 4_096,
    kind: 'pantry_scan',
    context: 'pantryScan.ts: scanPantryPhoto',
  });
  return { ...parsePantryScan(data), usage };
}
