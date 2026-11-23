import { describe, expect, it } from 'vitest';

import { mergeImportedIds, runImportBatch } from './batch';
import type { BatchProgress, ImportItemResult, RecipeCandidate } from './types';

function candidate(id: string): RecipeCandidate {
  return {
    id,
    kind: 'link',
    sender: 'Dana',
    sentAt: null,
    url: `https://www.tiktok.com/@chef/video/${id}`,
    platform: 'tiktok',
    preview: 'tiktok.com',
    likelyRecipe: true,
    alreadySaved: false,
  };
}

/** A promise the test resolves by hand, to control when each import finishes. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('runImportBatch', () => {
  it('imports everything, two at a time by default, and reports each change', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const updates: BatchProgress[] = [];
    const results: Record<string, ImportItemResult> = {
      a: { status: 'saved', recipeId: 'r-a' },
      b: { status: 'already_saved', recipeId: 'r-b' },
      c: { status: 'failed', code: 'not_found' },
      d: { status: 'saved', recipeId: 'r-d' },
    };
    const progress = await runImportBatch(
      ['a', 'b', 'c', 'd'].map(candidate),
      async (c) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick();
        inFlight--;
        return results[c.id];
      },
      { onProgress: (p) => updates.push(p) },
    );

    expect(maxInFlight).toBe(2);
    expect(progress).toEqual({
      total: 4,
      done: 4,
      saved: 2,
      alreadySaved: 1,
      failed: 1,
      stoppedForCredits: false,
      cancelled: false,
      items: { a: 'saved', b: 'already_saved', c: 'failed', d: 'saved' },
      recipeIds: { a: 'r-a', b: 'r-b', d: 'r-d' },
    });
    // working + finished for each item
    expect(updates).toHaveLength(8);
    expect(updates[0].items).toEqual({ a: 'working', b: 'waiting', c: 'waiting', d: 'waiting' });
    // Each update is its own object, so a React state setter sees a change.
    expect(new Set(updates).size).toBe(8);
    expect(new Set(updates.map((u) => u.items)).size).toBe(8);
  });

  it('counts a throwing import as failed and goes on', async () => {
    const progress = await runImportBatch(['a', 'b'].map(candidate), async (c) => {
      if (c.id === 'a') throw new Error('network');
      return { status: 'saved', recipeId: 'r-b' };
    });
    expect(progress.items).toEqual({ a: 'failed', b: 'saved' });
    expect(progress.failed).toBe(1);
  });

  it('stops starting new items when credits run out; the rest stay waiting', async () => {
    const started: string[] = [];
    const progress = await runImportBatch(
      ['a', 'b', 'c', 'd', 'e'].map(candidate),
      async (c) => {
        started.push(c.id);
        await tick();
        if (c.id === 'b') return { status: 'out_of_credits' };
        return { status: 'saved', recipeId: `r-${c.id}` };
      },
      { concurrency: 1 },
    );
    expect(started).toEqual(['a', 'b']);
    expect(progress).toMatchObject({
      done: 2,
      saved: 1,
      stoppedForCredits: true,
      cancelled: false,
      items: { a: 'saved', b: 'out_of_credits', c: 'waiting', d: 'waiting', e: 'waiting' },
    });
  });

  it('lets the item in flight finish when another runs out of credits', async () => {
    const gates = { a: deferred<ImportItemResult>(), b: deferred<ImportItemResult>() };
    const started: string[] = [];
    const run = runImportBatch(['a', 'b', 'c'].map(candidate), (c) => {
      started.push(c.id);
      return gates[c.id as 'a' | 'b'].promise;
    });
    await tick();
    gates.a.resolve({ status: 'out_of_credits' });
    await tick();
    gates.b.resolve({ status: 'saved', recipeId: 'r-b' });
    const progress = await run;
    expect(started).toEqual(['a', 'b']);
    expect(progress.items).toEqual({ a: 'out_of_credits', b: 'saved', c: 'waiting' });
    expect(progress.saved).toBe(1);
  });

  it('stops on abort, waits for the items in flight, and says it was cancelled', async () => {
    const controller = new AbortController();
    const gates = { a: deferred<ImportItemResult>(), b: deferred<ImportItemResult>() };
    const updates: BatchProgress[] = [];
    const run = runImportBatch(
      ['a', 'b', 'c', 'd'].map(candidate),
      (c) => gates[c.id as 'a' | 'b'].promise,
      { signal: controller.signal, onProgress: (p) => updates.push(p) },
    );
    await tick();
    controller.abort();
    expect(updates.at(-1)?.cancelled).toBe(true);
    gates.a.resolve({ status: 'saved', recipeId: 'r-a' });
    gates.b.resolve({ status: 'failed' });
    const progress = await run;
    expect(progress).toMatchObject({
      done: 2,
      cancelled: true,
      items: { a: 'saved', b: 'failed', c: 'waiting', d: 'waiting' },
    });
  });

  it('starts nothing when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const progress = await runImportBatch(
      ['a'].map(candidate),
      async () => {
        calls++;
        return { status: 'saved', recipeId: 'r' };
      },
      { signal: controller.signal },
    );
    expect(calls).toBe(0);
    expect(progress).toMatchObject({ cancelled: true, done: 0, items: { a: 'waiting' } });
  });

  it('imports a candidate listed twice only once, and survives a throwing onProgress', async () => {
    let calls = 0;
    const progress = await runImportBatch(
      ['a', 'a'].map(candidate),
      async () => {
        calls++;
        return { status: 'saved', recipeId: 'r' };
      },
      {
        onProgress: () => {
          throw new Error('ui bug');
        },
      },
    );
    expect(calls).toBe(1);
    expect(progress.total).toBe(1);
  });

  it('handles an empty list', async () => {
    const progress = await runImportBatch([], async () => ({ status: 'failed' }));
    expect(progress).toMatchObject({ total: 0, done: 0, items: {} });
  });
});

describe('mergeImportedIds', () => {
  it('appends new ids, moves re-imported ones to the newest end, and drops duplicates', () => {
    expect(mergeImportedIds(['a', 'b', 'c'], ['b', 'd', 'd'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps the newest 5000', () => {
    const previous = Array.from({ length: 5000 }, (_, i) => `old-${i}`);
    const merged = mergeImportedIds(previous, ['new-1', 'new-2']);
    expect(merged).toHaveLength(5000);
    expect(merged[0]).toBe('old-2');
    expect(merged.slice(-2)).toEqual(['new-1', 'new-2']);
  });
});
