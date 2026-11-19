import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock calls below are hoisted above this import
import { DAYS_BETWEEN_ASKS, MAX_ASKS, parseReviewPromptState, recordCookForReviewPrompt } from './reviewPrompt';

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    platform: { OS: 'ios' as string },
    storage: {
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    },
    storeReview: {
      isAvailableAsync: vi.fn(async () => true),
      requestReview: vi.fn(async () => {}),
    },
    logTap: vi.fn(),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: mocks.storage }));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-store-review', () => mocks.storeReview);
vi.mock('@/lib/interactionLog', () => ({ logTap: mocks.logTap }));

const day = 86_400_000;
const start = new Date('2026-11-19T18:00:00Z');
const at = (days: number) => new Date(start.getTime() + days * day);

describe('recordCookForReviewPrompt', () => {
  beforeEach(() => {
    mocks.values.clear();
    mocks.platform.OS = 'ios';
    mocks.storeReview.isAvailableAsync.mockResolvedValue(true);
    vi.clearAllMocks();
  });

  it('does not ask on the first cook, asks on the second', async () => {
    await recordCookForReviewPrompt(at(0));
    expect(mocks.storeReview.requestReview).not.toHaveBeenCalled();

    await recordCookForReviewPrompt(at(1));
    expect(mocks.storeReview.requestReview).toHaveBeenCalledTimes(1);
    expect(mocks.logTap).toHaveBeenCalledWith('review_prompt.requested', { cooks: 2, ask: 1 });
  });

  it(`waits ${DAYS_BETWEEN_ASKS} days before asking again`, async () => {
    await recordCookForReviewPrompt(at(0));
    await recordCookForReviewPrompt(at(1));
    await recordCookForReviewPrompt(at(DAYS_BETWEEN_ASKS));
    expect(mocks.storeReview.requestReview).toHaveBeenCalledTimes(1);

    await recordCookForReviewPrompt(at(DAYS_BETWEEN_ASKS + 1));
    expect(mocks.storeReview.requestReview).toHaveBeenCalledTimes(2);
  });

  it(`stops after ${MAX_ASKS} asks`, async () => {
    await recordCookForReviewPrompt(at(0));
    for (let i = 0; i < MAX_ASKS + 2; i++) await recordCookForReviewPrompt(at(1 + i * (DAYS_BETWEEN_ASKS + 1)));
    expect(mocks.storeReview.requestReview).toHaveBeenCalledTimes(MAX_ASKS);
  });

  it('never asks on web', async () => {
    mocks.platform.OS = 'web';
    for (let i = 0; i < 3; i++) await recordCookForReviewPrompt(at(i));
    expect(mocks.storeReview.requestReview).not.toHaveBeenCalled();
    expect(mocks.storage.setItem).not.toHaveBeenCalled();
  });

  it('skips quietly when the review sheet is unavailable', async () => {
    mocks.storeReview.isAvailableAsync.mockResolvedValue(false);
    await recordCookForReviewPrompt(at(0));
    await recordCookForReviewPrompt(at(1));
    expect(mocks.storeReview.requestReview).not.toHaveBeenCalled();
    expect(mocks.logTap).not.toHaveBeenCalled();
  });

  it('does not throw when storage fails', async () => {
    mocks.storage.getItem.mockRejectedValueOnce(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordCookForReviewPrompt(at(0))).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('parseReviewPromptState', () => {
  it('falls back to a fresh state for junk', () => {
    const empty = { cooks: 0, asks: 0, lastAskedAt: null };
    expect(parseReviewPromptState(null)).toEqual(empty);
    expect(parseReviewPromptState('not json')).toEqual(empty);
    expect(parseReviewPromptState('{"cooks":-1,"asks":"2","lastAskedAt":"nope"}')).toEqual(empty);
  });
});
