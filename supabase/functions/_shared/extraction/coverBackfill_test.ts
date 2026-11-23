// npx deno test -A --no-lock --config supabase/functions/deno.json supabase/functions/_shared/extraction/coverBackfill_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { clampCoverBatch, type CoverBackfillDeps, type CoverRow, runCoverBackfillBatch } from './coverBackfill.ts';
import type { ImageSize } from './imageSize.ts';

const row = (id: string, imageUrl: string, originalUrl: string | null = `https://www.tiktok.com/video/${id}`): CoverRow => ({
  id,
  platform: 'tiktok',
  originalUrl,
  imageUrl,
});

function fakeDeps(opts: {
  rows: CoverRow[];
  sizes: Record<string, ImageSize | null>;
  candidates?: (row: CoverRow) => string[] | Error;
  stored?: (minShortSide: number) => string | undefined;
  onCards?: string[];
}) {
  const calls = { lookups: [] as string[], stored: [] as number[], replaced: [] as [string, string][] };
  const deps: CoverBackfillDeps = {
    fetchRows: (_source, _platform, _after, limit) => Promise.resolve(opts.rows.slice(0, limit)),
    coversOnCards: (urls) => Promise.resolve(new Set(urls.filter((url) => opts.onCards?.includes(url)))),
    measure: (url) => Promise.resolve(opts.sizes[url] ?? null),
    candidates: (row) => {
      calls.lookups.push(row.id);
      const value = opts.candidates?.(row) ?? ['https://cdn/new.jpg'];
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    },
    store: (_row, _candidates, minShortSide) => {
      calls.stored.push(minShortSide);
      return Promise.resolve(opts.stored ? opts.stored(minShortSide) : 'https://ours/new.jpg');
    },
    replace: (oldUrl, newUrl) => {
      calls.replaced.push([oldUrl, newUrl]);
      return Promise.resolve({ cards: 1, recipes: 2 });
    },
  };
  return { deps, calls };
}

Deno.test('a small cover is replaced on its card and every saved copy', async () => {
  const { deps, calls } = fakeDeps({ rows: [row('1', 'old-1')], sizes: { 'old-1': { width: 300, height: 400 } } });
  const result = await runCoverBackfillBatch(deps, { source: 'cards', platform: 'tiktok', after: null, limit: 5 });
  assertEquals(result.counts.updated, 1);
  assertEquals(result.rowsUpdated, { cards: 1, recipes: 2 });
  assertEquals(result.lookups, 1);
  // The new picture has to beat the old one's short side.
  assertEquals(calls.stored, [300]);
  assertEquals(calls.replaced, [['old-1', 'https://ours/new.jpg']]);
  assertEquals(result.details[0], { id: '1', outcome: 'updated', from: '300x400' });
});

Deno.test('a sharp cover costs no lookup', async () => {
  const { deps, calls } = fakeDeps({ rows: [row('1', 'old-1')], sizes: { 'old-1': { width: 1080, height: 1920 } } });
  const result = await runCoverBackfillBatch(deps, { source: 'cards', platform: 'tiktok', after: null, limit: 5 });
  assertEquals(result.counts.already_sharp, 1);
  assertEquals(calls.lookups, []);
  assertEquals(result.lookups, 0);
});

Deno.test('nothing larger found leaves the cover as it is', async () => {
  const { deps, calls } = fakeDeps({
    rows: [row('1', 'old-1')],
    sizes: { 'old-1': { width: 360, height: 640 } },
    stored: () => undefined,
  });
  const result = await runCoverBackfillBatch(deps, { source: 'cards', platform: 'tiktok', after: null, limit: 5 });
  assertEquals(result.counts.not_larger, 1);
  assertEquals(calls.replaced, []);
});

Deno.test('a failed lookup is reported and the batch goes on', async () => {
  const { deps } = fakeDeps({
    rows: [row('1', 'old-1'), row('2', 'old-2')],
    sizes: {},
    candidates: (r) => (r.id === '1' ? new Error('blocked') : ['https://cdn/b.jpg']),
  });
  const result = await runCoverBackfillBatch(deps, { source: 'cards', platform: 'tiktok', after: null, limit: 5 });
  assertEquals(result.counts.failed, 1);
  assertEquals(result.counts.updated, 1);
  assertEquals(result.details[0], { id: '1', outcome: 'failed', error: 'blocked' });
});

Deno.test('saved recipes skip covers a card shows, and share one lookup per cover', async () => {
  const { deps, calls } = fakeDeps({
    rows: [row('a', 'card-cover'), row('b', 'shared'), row('c', 'shared'), row('d', 'nothing', null)],
    sizes: { shared: { width: 225, height: 225 } },
    onCards: ['card-cover'],
  });
  const result = await runCoverBackfillBatch(deps, { source: 'recipes', platform: 'tiktok', after: null, limit: 4 });
  assertEquals(result.counts, { updated: 2, already_sharp: 0, not_larger: 0, no_source: 1, on_card: 1, failed: 0 });
  assertEquals(calls.lookups, ['b']);
  assertEquals(result.nextCursor, 'd');
});

Deno.test('websites cost no paid lookup; the cursor stops on a short batch', async () => {
  const { deps } = fakeDeps({ rows: [{ id: '1', platform: 'web', originalUrl: 'https://site.com/r', imageUrl: 'x' }], sizes: {} });
  const result = await runCoverBackfillBatch(deps, { source: 'cards', platform: 'web', after: null, limit: 5 });
  assertEquals(result.lookups, 0);
  assertEquals(result.nextCursor, null);
});

Deno.test('batch size stays between 1 and 8', () => {
  assertEquals(clampCoverBatch(undefined), 5);
  assertEquals(clampCoverBatch(50), 8);
  assertEquals(clampCoverBatch(0), 1);
});
