import { describe, expect, it } from 'vitest';

/**
 * Lightweight mirrors of the HTML helpers in supabase/functions/_shared/webRecipe.ts
 * so we can unit-test parsing without Deno.
 */

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // skip
    }
  }
  return blocks;
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'recipe' || value.toLowerCase().endsWith('/recipe');
  }
  if (Array.isArray(value)) {
    return value.some((v) => typeof v === 'string' && v.toLowerCase().includes('recipe'));
  }
  return false;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (isRecipeType(record['@type'])) return record;
  if (record['@graph']) return findRecipeNode(record['@graph']);
  return null;
}

function findYouTubeWatchUrl(html: string): string | null {
  const match = html.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  );
  return match?.[1] ? `https://www.youtube.com/watch?v=${match[1]}` : null;
}

describe('web recipe HTML parsing', () => {
  it('finds schema.org Recipe JSON-LD', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {"@type":"Recipe","name":"Cookies","recipeIngredient":["1 cup flour"]}
      </script>
      </head></html>
    `;
    const recipe = findRecipeNode(extractJsonLdBlocks(html)[0]);
    expect(recipe?.name).toBe('Cookies');
  });

  it('finds YouTube embeds for cook-along', () => {
    const html = `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`;
    expect(findYouTubeWatchUrl(html)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
