import { describe, expect, it } from 'vitest';

import { parsePreviewFunctions, previewFunctionUrl } from './functionPreview';

const base = 'https://abc.supabase.co';

describe('parsePreviewFunctions', () => {
  it('reads a comma-separated list and ignores blanks and spaces', () => {
    expect([...parsePreviewFunctions(' extract-recipe, ,invent-recipe ')]).toEqual([
      'extract-recipe',
      'invent-recipe',
    ]);
  });

  it('is empty when the variable is unset', () => {
    expect(parsePreviewFunctions(undefined).size).toBe(0);
  });
});

describe('previewFunctionUrl', () => {
  const previews = new Set(['extract-recipe']);

  it('routes a listed function to its -preview copy', () => {
    expect(previewFunctionUrl(`${base}/functions/v1/extract-recipe`, previews)).toBe(
      `${base}/functions/v1/extract-recipe-preview`,
    );
  });

  it('keeps sub-paths and query strings', () => {
    expect(previewFunctionUrl(`${base}/functions/v1/extract-recipe/status?id=1`, previews)).toBe(
      `${base}/functions/v1/extract-recipe-preview/status?id=1`,
    );
  });

  it('leaves functions that are not listed alone', () => {
    expect(previewFunctionUrl(`${base}/functions/v1/invent-recipe`, previews)).toBeNull();
  });

  it('does not match a function whose name only starts with a listed one', () => {
    expect(previewFunctionUrl(`${base}/functions/v1/extract-recipe-v2`, previews)).toBeNull();
  });

  it('leaves auth, REST and storage calls alone', () => {
    expect(previewFunctionUrl(`${base}/rest/v1/extract-recipe`, previews)).toBeNull();
    expect(previewFunctionUrl(`${base}/auth/v1/token`, previews)).toBeNull();
  });
});
