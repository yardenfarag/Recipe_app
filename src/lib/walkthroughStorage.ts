/**
 * AsyncStorage key for the first-run tab walkthrough (install-scoped).
 * Set to `pending` when onboarding finishes, so people who onboarded before
 * the walkthrough existed never see it. Set to `done` once finished or skipped.
 */
export const WALKTHROUGH_STATE_KEY = 'pinch:walkthroughState';

export type WalkthroughStoredState = 'pending' | 'done';

export function isWalkthroughPendingValue(value: string | null): boolean {
  return value === 'pending';
}

/** Snap tab, then sharing from other apps, then the Library tab. */
export const WALKTHROUGH_STEPS = ['snap', 'share', 'library'] as const;
export type WalkthroughStep = (typeof WALKTHROUGH_STEPS)[number];

/** Next step, or null after the last one. */
export function nextWalkthroughStep(step: WalkthroughStep): WalkthroughStep | null {
  const index = WALKTHROUGH_STEPS.indexOf(step);
  return WALKTHROUGH_STEPS[index + 1] ?? null;
}

/** Visible bottom tabs, in order: Library · Hub · Snap · List · Settings. */
export const VISIBLE_TAB_COUNT = 5;
const TAB_INDEX = { library: 0, snap: 2 } as const;

/**
 * Left edge and width of a tab item in a full-width bottom tab bar.
 * The row mirrors in RTL, so the Library tab sits on the right.
 */
export function tabItemFrame(
  tab: keyof typeof TAB_INDEX,
  barWidth: number,
  rtl: boolean,
): { left: number; width: number } {
  const width = barWidth / VISIBLE_TAB_COUNT;
  const index = rtl ? VISIBLE_TAB_COUNT - 1 - TAB_INDEX[tab] : TAB_INDEX[tab];
  return { left: index * width, width };
}
