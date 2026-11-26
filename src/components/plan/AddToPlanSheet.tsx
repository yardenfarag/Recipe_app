import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { addDays, mealsOfDay, parsePlanDate, toPlanDate } from '@shared/lib/mealPlan/week';
import { fetchCloudKitchenProfile } from '@shared/lib/supabase/kitchen';
import { fetchMealPlanPrefs, fetchMealPlanWithTitles, replacePlanMeal } from '@shared/lib/supabase/mealPlan';
import { showToast } from '@shared/lib/toast';
import type { MealPlanEntry, PlanMeal } from '@shared/types/mealPlan';

import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { usePantry } from '@/hooks/usePantry';
import { useThemePreference } from '@/hooks/useThemePreference';
import { scheduleMealReminders } from '@/lib/mealPlanReminders';

type Planned = MealPlanEntry & { title: string };

/**
 * "Add to plan" from a recipe on the phone (PIN-77): the next seven days by meal, free or showing what's there.
 * Picking a filled meal replaces it (and its leftovers).
 */
export function AddToPlanSheet({ visible, onClose, recipeId, servings, title }: { visible: boolean; onClose: () => void; recipeId: string; servings: number; title: string }) {
  const { t } = useTranslation();
  return (
    <SheetModal visible={visible} onClose={onClose} title={t('plan.add.title')} trackId="plan.add">
      {visible ? <Body recipeId={recipeId} recipeServings={servings} title={title} onDone={onClose} /> : null}
    </SheetModal>
  );
}

function Body({ recipeId, recipeServings, title, onDone }: { recipeId: string; recipeServings: number; title: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { user } = useAuth();
  const { language } = useLanguagePreference();
  const { items: pantry } = usePantry();
  const userId = user?.id;
  const today = toPlanDate(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const [planned, setPlanned] = useState<Planned[] | null>(null);
  const [meals, setMeals] = useState<PlanMeal[]>(['breakfast', 'lunch', 'dinner']);
  const [servings, setServings] = useState(recipeServings > 0 ? recipeServings : 2);
  const [picked, setPicked] = useState<{ date: string; meal: PlanMeal } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.all([
      fetchMealPlanWithTitles(days[0], days[6]).catch(() => [] as Planned[]),
      fetchMealPlanPrefs(userId).catch(() => null),
      fetchCloudKitchenProfile(userId).catch(() => null),
    ]).then(([rows, prefs, kitchen]) => {
      if (!active) return;
      setPlanned(rows);
      if (prefs) setMeals(mealsOfDay(prefs.meals, prefs.snacksPerDay));
      if (kitchen?.defaultServings) setServings(kitchen.defaultServings);
    });
    return () => {
      active = false;
    };
  }, [days, userId]);

  const weekday = useMemo(() => new Intl.DateTimeFormat(language, { weekday: 'short' }), [language]);
  const dayLabel = (day: string) => (day === today ? t('plan.today') : `${weekday.format(parsePlanDate(day))} ${parsePlanDate(day).getDate()}`);
  const at = (date: string, meal: PlanMeal) => planned?.find((row) => row.date === date && row.meal === meal) ?? null;
  const replacing = picked ? at(picked.date, picked.meal) : null;

  async function add() {
    if (!userId || !picked) return;
    setBusy(true);
    try {
      await replacePlanMeal(userId, { date: picked.date, meal: picked.meal, recipeId, servings }, replacing);
      void scheduleMealReminders(userId, t, pantry ?? []);
      showToast(t('plan.add.done'));
      onDone();
    } catch {
      showToast(t('plan.add.failed'), 'error');
      setBusy(false);
    }
  }

  if (planned == null) return <ActivityIndicator style={{ paddingVertical: 32 }} color={colors.primary} />;

  return (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <Text variant="bodySmall" tone="muted" numberOfLines={2}>
        {title}
      </Text>
      <Stepper
        value={servings}
        onChange={setServings}
        min={1}
        max={48}
        label={t('plan.add.servings')}
        decreaseLabel={t('plan.add.fewer')}
        increaseLabel={t('plan.add.more')}
        trackId="plan.add.servings"
      />
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ width: 64 }} />
          {meals.map((meal) => (
            <Text key={meal} variant="caption" tone="muted" weight="semibold" align="center" style={{ flex: 1 }} numberOfLines={1}>
              {t(`plan.meals.${meal}`)}
            </Text>
          ))}
        </View>
        {days.map((day) => (
          <View key={day} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="bodySmall" weight="semibold" style={{ width: 64 }} numberOfLines={1}>
              {dayLabel(day)}
            </Text>
            {meals.map((meal) => {
              const row = at(day, meal);
              const on = picked?.date === day && picked.meal === meal;
              return (
                <Pressable
                  key={meal}
                  trackId={row ? 'plan.add.replace_slot' : 'plan.add.slot'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${dayLabel(day)}, ${t(`plan.meals.${meal}`)}: ${row ? row.title : t('plan.add.free')}`}
                  onPress={() => setPicked({ date: day, meal })}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    paddingHorizontal: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? colors.primary : row ? colors.backgroundElement : 'transparent',
                    borderWidth: on || row ? 0 : 1,
                    borderStyle: 'dashed',
                    borderColor: colors.border,
                  }}
                >
                  <Text variant="caption" weight="semibold" numberOfLines={1} tone={on ? 'onPrimary' : row ? 'muted' : 'primary'}>
                    {on ? title : row ? row.title : '+'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {replacing ? (
        <Text variant="bodySmall" tone="muted">
          {t('plan.add.replaces', { title: replacing.title })}
        </Text>
      ) : null}
      <Button trackId="plan.add.confirm" fullWidth busy={busy} disabled={!picked} onPress={() => void add()}>
        {picked ? t('plan.add.addTo', { slot: `${dayLabel(picked.date)} · ${t(`plan.meals.${picked.meal}`)}` }) : t('plan.add.pick')}
      </Button>
    </View>
  );
}
