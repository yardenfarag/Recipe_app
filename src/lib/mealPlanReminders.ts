import { Platform } from 'react-native';

import { addDays, parsePlanDate, toPlanDate } from '@shared/lib/mealPlan/week';
import { foodWords, homeCovers } from '@shared/lib/pantry';
import { fetchMessagePreferences } from '@shared/lib/supabase/emailPreferences';
import { fetchPlannedDinners } from '@shared/lib/supabase/mealPlan';
import type { PantryItem } from '@shared/types/pantry';

/** Every reminder this schedules has an id starting with this, so they can be replaced together. */
const PREFIX = 'meal-plan:';
const ANDROID_CHANNEL = 'default';
const DEFROST_HOUR = 9;
const TONIGHT_HOUR = 17;
const TONIGHT_MINUTE = 30;

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The freezer item a dinner needs, if any: what to take out in the morning. */
export function freezerItemFor(ingredients: string[], pantry: PantryItem[]): string | null {
  const frozen = pantry.filter((item) => item.place === 'freezer');
  for (const name of ingredients) {
    const words = foodWords(name);
    if (words.length === 0) continue;
    const item = frozen.find((entry) => [entry.name, entry.nameEn].filter(Boolean).some((home) => homeCovers(foodWords(home), words)));
    if (item) return item.name;
  }
  return null;
}

let running: Promise<void> | null = null;

/**
 * The meal plan's reminders on this phone (PIN-77), for today and tomorrow: in the morning, take what tonight's
 * dinner needs out of the freezer (when the pantry has it there); at 17:30, what's for dinner. Scheduled on the
 * device, so they follow the phone's own clock. Only when notifications are already allowed, and not when the cook
 * turned off reminders (Settings › Emails and notifications). Never asks for permission itself.
 */
export function scheduleMealReminders(userId: string, t: Translate, pantry: PantryItem[]): Promise<void> {
  // One at a time: a second call waits, then schedules from fresh data.
  running = (running ?? Promise.resolve()).then(() => schedule(userId, t, pantry)).catch(() => undefined);
  return running;
}

async function schedule(userId: string, t: Translate, pantry: PantryItem[]): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  // Loaded here, not at the top: screens that only might schedule (the recipe page) stay light, and tests too.
  const Notifications = await import('expo-notifications');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(PREFIX))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );

  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const prefs = await fetchMessagePreferences(userId).catch(() => null);
  if (!prefs || prefs.pushOptOut) return;

  const today = toPlanDate(new Date());
  const dinners = await fetchPlannedDinners(today, addDays(today, 1));
  const now = Date.now();
  for (const dinner of dinners) {
    const day = parsePlanDate(dinner.date);
    const url = `/recipe/${dinner.recipeId}`;
    const frozen = freezerItemFor(dinner.ingredients, pantry);
    if (frozen) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DEFROST_HOUR, 0);
      if (at.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}defrost:${dinner.id}`,
          content: {
            title: t('plan.reminders.defrostTitle', { item: frozen }),
            body: t('plan.reminders.defrostBody', { title: dinner.title }),
            data: { url },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: ANDROID_CHANNEL },
        });
      }
    }
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), TONIGHT_HOUR, TONIGHT_MINUTE);
    if (at.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}tonight:${dinner.id}`,
        content: {
          title: t('plan.reminders.tonightTitle', { title: dinner.title }),
          body: dinner.minutes ? t('plan.reminders.tonightBodyMinutes', { minutes: dinner.minutes }) : t('plan.reminders.tonightBody'),
          data: { url },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: ANDROID_CHANNEL },
      });
    }
  }
}
