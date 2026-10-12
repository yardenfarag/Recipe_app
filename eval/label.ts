// Reference labels written by a strong model that is not on the shortlist.
// They stand in for hand labels (PIN-44 chose an LLM judge over manual review).

import { buildTextContext } from '../supabase/functions/_shared/gemini.ts';
import type { ExtractInput } from '../supabase/functions/_shared/gemini.ts';
import { type ImageCase, imagePath, type PostCase, postPath, type PostSnapshot } from './fetch.ts';
import { chatJson, dataUrl, exists, pool, PRIVATE, readJson, readJsonOr, ROOT, writeJson } from './lib.ts';

export const REFERENCE_MODEL = 'anthropic/claude-opus-5.5';

export const ROUTES = {
  full_recipe_in_text:
    'The text already holds a usable recipe: an ingredient list with amounts and method steps.',
  partial:
    'The text holds part of a recipe (ingredients without amounts, or ingredients without steps). The video may fill the gaps.',
  needs_video:
    'A cooking or food post whose text has no usable recipe. The recipe can only come from watching the video.',
  no_recipe: 'Not a recipe at all: a review, meme, vlog, product promo, or a post with no cookable content.',
} as const;
export type Route = keyof typeof ROUTES;

export type Reference = {
  found_recipe: boolean;
  source_language: string;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: string[];
};

export type PostLabel = { model: string; route: Route; reference: Reference };

export const labelPath = (id: string) => `${PRIVATE}labels/${id}.json`;

const REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    route: { type: 'string', enum: Object.keys(ROUTES) },
    found_recipe: { type: 'boolean' },
    source_language: { type: 'string' },
    title: { type: 'string' },
    servings: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    instructions: { type: 'array', items: { type: 'string' } },
  },
  required: ['route', 'found_recipe', 'source_language', 'title', 'servings', 'ingredients', 'instructions'],
};

const SYSTEM = `You write the answer key for a recipe-extraction benchmark. Be exact and conservative.

- Extract ONLY what the source states. Never invent ingredients, amounts, or steps.
- Keep names, units and step text in the source language, as written.
- quantity is a number (fractions as decimals: ½ → 0.5). If no amount is stated, quantity 0 and unit "".
- One ingredient per line item, in source order. Count "salt and pepper" as two items.
- instructions: the method steps in order, one string each. Empty when the source has no method.
- found_recipe false and empty lists when there is no recipe.
- source_language: lowercase ISO 639-1 code of the recipe text.
- route: classify the post text (ignore the video, you cannot see it):
${Object.entries(ROUTES).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`;

export function postInput(snap: PostSnapshot): ExtractInput {
  return {
    platform: snap.platform as ExtractInput['platform'],
    sourceUrl: snap.url,
    videoUrl: undefined,
    durationSeconds: snap.meta.durationSeconds,
    description: snap.meta.description,
    captions: snap.meta.captions,
    topComments: snap.meta.topComments ?? [],
  };
}

export function postText(snap: PostSnapshot, variant: 'full' | 'description_only' = 'full'): string {
  const full = variant === 'full';
  return buildTextContext(postInput(snap), { description: true, comments: full, captions: full });
}

export type GateCase = {
  id: string;
  post?: string;
  variant?: 'full' | 'description_only';
  synthetic?: boolean;
  lang?: string;
  text?: string;
};

export type GateLabel = { route: Route; lang: string; text: string; source: string };

export async function gateCaseLabel(c: GateCase): Promise<GateLabel> {
  const stored = await readJsonOr<GateLabel | null>(labelPath(c.id), null);
  if (stored) return stored;
  if (c.synthetic) {
    // Hand-written non-recipe captions, so the label is known.
    return { route: 'no_recipe', lang: c.lang ?? 'en', text: c.text ?? '', source: 'hand' };
  }
  const snap = await readJson<PostSnapshot>(postPath(c.post!));
  const post = await readJson<PostLabel>(labelPath(c.post!));
  const text = postText(snap, c.variant ?? 'full');
  if ((c.variant ?? 'full') === 'full') {
    return { route: post.route, lang: post.reference.source_language, text, source: REFERENCE_MODEL };
  }
  const { data } = await chatJson<Reference & { route: Route }>({
    model: REFERENCE_MODEL,
    system: SYSTEM,
    content: text,
    schema: REFERENCE_SCHEMA,
    name: 'reference',
    reasoning: 'medium',
  });
  const label: GateLabel = {
    route: data.route,
    lang: post.reference.source_language,
    text,
    source: REFERENCE_MODEL,
  };
  await writeJson(labelPath(c.id), label);
  return label;
}

async function labelPost(post: PostCase, force: boolean): Promise<void> {
  if (!force && (await exists(labelPath(post.id)))) return;
  if (!(await exists(postPath(post.id)))) return;
  const snap = await readJson<PostSnapshot>(postPath(post.id));
  const { data, costUsd } = await chatJson<Reference & { route: Route }>({
    model: REFERENCE_MODEL,
    system: SYSTEM,
    content: postText(snap),
    schema: REFERENCE_SCHEMA,
    name: 'reference',
    reasoning: 'medium',
  });
  const { route, ...reference } = data;
  await writeJson(labelPath(post.id), { model: REFERENCE_MODEL, route, reference });
  console.log(
    `✓ ${post.id}: ${route}, ${reference.source_language}, ${reference.ingredients.length} ingredients, ` +
      `${reference.instructions.length} steps ($${costUsd.toFixed(4)})`,
  );
}

async function labelImage(img: ImageCase, force: boolean): Promise<void> {
  if (!force && (await exists(labelPath(img.id)))) return;
  const path = imagePath(img.id);
  const { data, costUsd } = await chatJson<Reference & { route: Route }>({
    model: REFERENCE_MODEL,
    system: SYSTEM,
    content: [
      { type: 'image_url', image_url: { url: await dataUrl(path) } },
      { type: 'text', text: 'Transcribe the recipe in this image. route: full_recipe_in_text when legible.' },
    ],
    schema: REFERENCE_SCHEMA,
    name: 'reference',
    reasoning: 'high',
  });
  const { route, ...reference } = data;
  await writeJson(labelPath(img.id), { model: REFERENCE_MODEL, route, reference });
  console.log(`✓ ${img.id}: ${reference.ingredients.length} ingredients ($${costUsd.toFixed(4)})`);
}

export async function labelCommand(args: string[]) {
  const force = args.includes('--force');
  const posts = await readJson<PostCase[]>(`${ROOT}cases/posts.json`);
  const images = (await readJson<ImageCase[]>(`${ROOT}cases/images.json`)).filter((i) => i.use === 'photo');
  const run = <T extends { id: string }>(fn: (x: T) => Promise<void>) => async (x: T) => {
    try {
      await fn(x);
    } catch (err) {
      console.error(`✗ ${x.id}: ${err instanceof Error ? err.message : err}`);
    }
  };
  await pool(posts, 6, run((p) => labelPost(p, force)));
  await pool(images, 4, run((i) => labelImage(i, force)));
  const gates = await readJson<GateCase[]>(`${ROOT}cases/gate.json`);
  const gateLabels = await pool(gates, 6, async (c) => {
    try {
      return await gateCaseLabel(c);
    } catch (err) {
      console.error(`✗ ${c.id}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  });
  const counts: Record<string, number> = {};
  for (const l of gateLabels) if (l) counts[`${l.route}/${l.lang}`] = (counts[`${l.route}/${l.lang}`] ?? 0) + 1;
  console.log('gate labels', counts);
}
