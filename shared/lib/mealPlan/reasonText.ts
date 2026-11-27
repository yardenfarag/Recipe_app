import type { PlanReason } from './fillWeek';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The line a planned meal shows for why it was picked ("Uses your spinach"), in the app's language. */
export function reasonKeyText(reason: PlanReason | undefined, t: Translate, dayName: (date: string) => string): string | null {
  if (!reason) return null;
  switch (reason.key) {
    case 'usesPantry':
      return t('plan.reason.usesPantry', { item: reason.item });
    case 'sharesWith':
      return t('plan.reason.sharesWith', { item: reason.item, day: dayName(reason.date) });
    case 'quick':
      return t('plan.reason.quick', { minutes: reason.minutes });
    case 'fitsDiet':
      return t('plan.reason.fitsDiet', { diet: t(`recipe.variants.${reason.diet}.label`) });
    case 'leftovers':
      return t('plan.reason.leftovers', { day: dayName(reason.date) });
    case 'batch':
      return t('plan.reason.batch', { day: dayName(reason.date) });
    case 'notCookedFor':
      return t('plan.reason.notCookedFor');
    default:
      return t(`plan.reason.${reason.key}`);
  }
}
