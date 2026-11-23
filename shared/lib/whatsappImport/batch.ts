import { MAX_IMPORTED_IDS } from './constants';
import type { BatchProgress, ImportItemResult, RecipeCandidate, RunBatchOptions } from './types';

/** Adds newly imported ids to the stored list, newest kept, capped so storage stays small. */
export function mergeImportedIds(previous: readonly string[], added: readonly string[]): string[] {
  // A Set keeps insertion order; deleting first moves a re-added id to the newest end.
  const ids = new Set<string>();
  for (const id of [...previous, ...added]) {
    if (typeof id !== 'string' || !id) continue;
    ids.delete(id);
    ids.add(id);
  }
  const all = [...ids];
  return all.length > MAX_IMPORTED_IDS ? all.slice(all.length - MAX_IMPORTED_IDS) : all;
}

function snapshot(progress: BatchProgress): BatchProgress {
  return { ...progress, items: { ...progress.items }, recipeIds: { ...progress.recipeIds } };
}

/**
 * Imports the candidates in order, `concurrency` at a time, through the app's `importOne` (extract + save).
 * Stops starting new items after an 'out_of_credits' result or when `signal` aborts; items not started stay
 * 'waiting'. Never throws: an `importOne` that throws counts as { status: 'failed' }.
 */
export async function runImportBatch(
  candidates: readonly RecipeCandidate[],
  importOne: (candidate: RecipeCandidate) => Promise<ImportItemResult>,
  opts: RunBatchOptions = {},
): Promise<BatchProgress> {
  const queue: RecipeCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    queue.push(candidate);
  }

  const progress: BatchProgress = {
    total: queue.length,
    done: 0,
    saved: 0,
    alreadySaved: 0,
    failed: 0,
    stoppedForCredits: false,
    cancelled: false,
    items: {},
    recipeIds: {},
  };
  for (const candidate of queue) progress.items[candidate.id] = 'waiting';

  const emit = () => {
    if (!opts.onProgress) return;
    try {
      opts.onProgress(snapshot(progress));
    } catch {
      // A broken progress callback must not stop the batch.
    }
  };

  const { signal } = opts;
  const onAbort = () => {
    if (progress.cancelled) return;
    progress.cancelled = true;
    emit();
  };
  if (signal?.aborted) progress.cancelled = true;
  else signal?.addEventListener('abort', onAbort);

  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 2) || 1);
  let next = 0;

  const record = (candidate: RecipeCandidate, result: ImportItemResult) => {
    progress.items[candidate.id] = result.status;
    progress.done++;
    switch (result.status) {
      case 'saved':
        progress.saved++;
        progress.recipeIds[candidate.id] = result.recipeId;
        break;
      case 'already_saved':
        progress.alreadySaved++;
        if (result.recipeId) progress.recipeIds[candidate.id] = result.recipeId;
        break;
      case 'out_of_credits':
        progress.stoppedForCredits = true;
        break;
      default:
        progress.failed++;
    }
  };

  const worker = async () => {
    while (next < queue.length && !progress.stoppedForCredits && !progress.cancelled && !signal?.aborted) {
      const candidate = queue[next++];
      progress.items[candidate.id] = 'working';
      emit();
      let result: ImportItemResult;
      try {
        result = await importOne(candidate);
        if (!result || typeof result !== 'object' || !('status' in result)) result = { status: 'failed' };
      } catch {
        result = { status: 'failed' };
      }
      record(candidate, result);
      emit();
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) progress.cancelled = true;
  return snapshot(progress);
}
