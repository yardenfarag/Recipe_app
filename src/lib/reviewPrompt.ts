import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Asks for a store rating right after someone marks a recipe as cooked (PIN-61), the moment they're
 * happiest with the app. The OS decides whether the sheet actually shows (iOS allows 3 a year), so we
 * only ask people who have cooked more than once, and rarely.
 */

const STORAGE_KEY = 'pinch:review-prompt';

/** Cooks to log before the first ask. The first cook can still be "trying it out". */
export const COOKS_BEFORE_FIRST_ASK = 2;
/** Days between asks. */
export const DAYS_BETWEEN_ASKS = 120;
/** Asks per install, ever. */
export const MAX_ASKS = 3;

export type ReviewPromptState = {
  cooks: number;
  asks: number;
  lastAskedAt: string | null;
};

const EMPTY: ReviewPromptState = { cooks: 0, asks: 0, lastAskedAt: null };

/** Records one cook and decides whether to ask for a review now. Pure, for tests. */
export function nextReviewPromptState(
  state: ReviewPromptState,
  now: Date,
): { state: ReviewPromptState; ask: boolean } {
  const cooks = state.cooks + 1;
  const daysSinceAsk = state.lastAskedAt
    ? (now.getTime() - new Date(state.lastAskedAt).getTime()) / 86_400_000
    : Infinity;
  const ask =
    cooks >= COOKS_BEFORE_FIRST_ASK && state.asks < MAX_ASKS && !(daysSinceAsk < DAYS_BETWEEN_ASKS);
  return {
    ask,
    state: ask ? { cooks, asks: state.asks + 1, lastAskedAt: now.toISOString() } : { ...state, cooks },
  };
}

export function parseReviewPromptState(raw: string | null): ReviewPromptState {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<ReviewPromptState>;
    const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? (n as number) : 0);
    const at = typeof value.lastAskedAt === 'string' && !Number.isNaN(Date.parse(value.lastAskedAt));
    return { cooks: count(value.cooks), asks: count(value.asks), lastAskedAt: at ? value.lastAskedAt! : null };
  } catch {
    return EMPTY;
  }
}

/**
 * Call after a recipe is marked cooked. Never throws, and does nothing on web or where the store
 * review sheet isn't available (e.g. Android builds without Play Services).
 */
export async function recordCookForReviewPrompt(now = new Date()): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const { state, ask } = nextReviewPromptState(
      parseReviewPromptState(await AsyncStorage.getItem(STORAGE_KEY)),
      now,
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!ask) return;

    // Loaded lazily: it's a native module and only needed on the rare ask.
    const StoreReview = await import('expo-store-review');
    if (!(await StoreReview.isAvailableAsync())) return;
    await StoreReview.requestReview();
    const { logTap } = await import('@/lib/interactionLog');
    logTap('review_prompt.requested', { cooks: state.cooks, ask: state.asks });
  } catch (error) {
    console.warn('[reviewPrompt] failed', error);
  }
}
