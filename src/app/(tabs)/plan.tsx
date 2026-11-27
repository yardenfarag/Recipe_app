import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { translatedIngredientNames } from '@shared/lib/cachedTranslation';
import { reasonKeyText } from '@shared/lib/mealPlan/reasonText';
import { haveCount, slotKey } from '@shared/lib/mealPlan/planner';
import { defaultPlanWeek, isPlannableWeek, parsePlanDate, planningWeeks, plannableDays, toPlanDate, weekStartFor } from '@shared/lib/mealPlan/week';
import { showToast } from '@shared/lib/toast';
import { PLAN_MEALS, type MealPlanEntry, type PlanMeal } from '@shared/types/mealPlan';

import { PlanMealRow } from '@/components/plan/PlanMealRow';
import { PlanMyWeekSheet } from '@/components/plan/PlanMyWeekSheet';
import { SendWeekSheet } from '@/components/plan/SendWeekSheet';
import { Screen } from '@/components/Screen';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useThemePreference } from '@/hooks/useThemePreference';
import { haptics } from '@/lib/haptics';

/** The page's side gutter, as on the Library. */
const GUTTER = 16;

/**
 * The meal plan on the phone (PIN-77): this week or next, day by day from today, filled by "Plan my week" from the
 * cook's recipes and the Hub. The same plan, rules and filling as the web (shared/lib/mealPlan).
 */
export default function PlanScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useThemePreference();
  const { language } = useLanguagePreference();
  const today = toPlanDate(new Date());
  const weekStart = weekStartFor(language);
  const { thisWeek, nextWeek } = planningWeeks(today, weekStart);
  const [which, setWhich] = useState<'this' | 'next'>(() => (defaultPlanWeek(today, weekStart).start === thisWeek.start ? 'this' : 'next'));
  const week = which === 'this' ? thisWeek : nextWeek;
  const plan = useMealPlan(week);
  const [fillOpen, setFillOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<MealPlanEntry | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const weekday = useMemo(() => new Intl.DateTimeFormat(language, { weekday: 'short' }), [language]);
  const longDay = useMemo(() => new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }), [language]);
  const shortDate = useMemo(() => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }), [language]);
  const dayName = useCallback((day: string) => weekday.format(parsePlanDate(day)), [weekday]);
  const dayLabel = useCallback((day: string) => `${weekday.format(parsePlanDate(day))} ${parsePlanDate(day).getDate()}`, [weekday]);

  const entries = useMemo(() => plan.entries ?? [], [plan.entries]);
  const byKey = useMemo(() => new Map(entries.map((entry) => [slotKey(entry.date, entry.meal), entry])), [entries]);
  const editable = isPlannableWeek(week.start, today, weekStart);
  const openDays = editable ? plannableDays(week, today) : [];
  const shownMeals: PlanMeal[] = useMemo(() => {
    const wanted = new Set<PlanMeal>(plan.mealsOfDay());
    for (const entry of entries) wanted.add(entry.meal);
    return PLAN_MEALS.filter((meal) => wanted.has(meal));
    // `plan.mealsOfDay` is a new function each render; the meals follow the cook's choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, plan.prefs]);
  const shownDays = week.days.filter((day) => day >= today || entries.some((entry) => entry.date === day));

  const following = useMemo(
    () => [
      ...plan.profile.diets.map((diet) => ({ label: t(`recipe.variants.${diet}.label`), allergy: false })),
      ...plan.profile.allergies.map((key) => ({ label: t(`avoid.allergens.${key}`), allergy: true })),
      ...plan.profile.otherAllergies.map((item) => ({ label: item, allergy: true })),
    ],
    [plan.profile, t],
  );

  async function guarded(key: string, run: () => Promise<unknown>) {
    setBusySlot(key);
    try {
      await run();
    } catch {
      showToast(t('plan.saveFailed'), 'error');
    } finally {
      setBusySlot(null);
    }
  }

  if (!user) {
    return (
      <Screen tabScreen>
        <TopBar style={{ paddingHorizontal: GUTTER }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <Text variant="h2" align="center">
            {t('plan.emptyTitle')}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('plan.signIn')}
          </Text>
          <Button trackId="plan.sign_in" onPress={() => router.push('/auth')}>
            {t('auth.signIn')}
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen tabScreen>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              haptics.refresh();
              setRefreshing(true);
              void plan.reload().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <TopBar />
        <PageHeader
          title={which === 'this' ? t('plan.title') : t('plan.nextWeekTitle')}
          subtitle={t('plan.range', { from: shortDate.format(parsePlanDate(week.days[0])), to: shortDate.format(parsePlanDate(week.days[6])) })}
          style={{ marginTop: 8, paddingBottom: 12 }}
        />
        <SegmentedControl<'this' | 'next'>
          label={t('plan.weekLabel')}
          fullWidth
          value={which}
          onChange={setWhich}
          options={[
            { value: 'this', label: t('plan.thisWeek'), trackId: 'plan.week.this' },
            { value: 'next', label: t('plan.nextWeek'), trackId: 'plan.week.next' },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {editable ? (
            <Button variant="outline" icon="sparkles-outline" trackId="plan.open_fill" disabled={plan.loading || openDays.length === 0} onPress={() => setFillOpen(true)} style={{ flex: 1 }}>
              {t('plan.planMyWeek')}
            </Button>
          ) : null}
          <Button icon="cart-outline" trackId="plan.open_send" disabled={entries.length === 0} onPress={() => setSendOpen(true)} style={{ flex: 1 }}>
            {t('plan.sendToList')}
          </Button>
        </View>

        {plan.failed ? (
          <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
            <Text variant="body" tone="muted">
              {t('plan.loadFailed')}
            </Text>
            <Button variant="outline" trackId="plan.retry" onPress={() => void plan.reload()}>
              {t('common.retry')}
            </Button>
          </View>
        ) : plan.loading ? (
          <ActivityIndicator style={{ paddingVertical: 40 }} color={colors.primary} />
        ) : (
          <View style={{ gap: 18, marginTop: 20 }}>
            {entries.length === 0 && editable ? (
              <View style={{ borderRadius: 20, backgroundColor: colors.backgroundElement, padding: 16, gap: 6 }}>
                <Text variant="h3">{t('plan.emptyTitle')}</Text>
                <Text variant="bodySmall" tone="muted">
                  {t('plan.emptyBody')}
                </Text>
              </View>
            ) : null}
            {shownDays.map((day) => (
              <View key={day} style={{ gap: 8 }} accessibilityLabel={longDay.format(parsePlanDate(day))}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="h3" accessibilityRole="header" style={{ flexShrink: 1 }}>
                    {longDay.format(parsePlanDate(day))}
                  </Text>
                  {day === today ? (
                    <View style={{ borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text variant="caption" tone="onPrimary" weight="semibold">
                        {t('plan.today')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {shownMeals.map((meal) => {
                  const key = slotKey(day, meal);
                  const entry = byKey.get(key) ?? null;
                  const recipe = entry ? plan.recipeFor(entry) : null;
                  let have: string | null = null;
                  if (recipe && entry && !entry.leftoverOf && plan.homeNames.length > 0) {
                    const count = haveCount((recipe.ingredients ?? []).map((ing) => ing.name), plan.homeNames, translatedIngredientNames(recipe, language));
                    if (count.total > 0 && count.have > 0) have = count.have === count.total ? t('plan.haveAll') : t('plan.have', count);
                  }
                  const source = entry?.leftoverOf ? entries.find((row) => row.id === entry.leftoverOf) : null;
                  const note = source
                    ? t(meal === 'snack_am' || meal === 'snack_pm' ? 'plan.reason.batch' : 'plan.reason.leftovers', { day: dayName(source.date) })
                    : reasonKeyText(plan.reasons[key], t, dayName);
                  return (
                    <PlanMealRow
                      key={key}
                      meal={meal}
                      entry={entry}
                      recipe={recipe}
                      note={note}
                      have={have}
                      tonight={day === today && meal === 'dinner' && entry != null && !entry.leftoverOf}
                      readOnly={!editable || day < today}
                      busy={busySlot === key}
                      onLock={() => entry && void guarded(key, () => plan.change(entry, { locked: !entry.locked }))}
                      onShuffle={() => entry && void guarded(key, () => plan.shuffle(entry))}
                      onMore={() => entry && setMenuFor(entry)}
                      onFill={() =>
                        void guarded(key, () =>
                          plan.fill({ days: [day], meals: [meal], mode: 'fill', useHub: plan.prefs.useHub, leftovers: false, adjust: {} }, { date: day, meal }),
                        )
                      }
                    />
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PlanMyWeekSheet
        visible={fillOpen}
        onClose={() => setFillOpen(false)}
        days={openDays}
        dayLabel={dayLabel}
        prefs={plan.prefs}
        following={following}
        libraryStatus={plan.libraryStatus}
        hasMeals={entries.some((entry) => openDays.includes(entry.date))}
        onSavePrefs={plan.savePrefs}
        onFill={plan.fill}
      />
      <SendWeekSheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        entries={entries.filter((entry) => entry.date >= today)}
        recipeFor={plan.recipeFor}
        homeNames={plan.homeNames}
        dayLabel={dayLabel}
      />
      <SheetModal visible={menuFor != null} onClose={() => setMenuFor(null)} title={menuFor ? t(`plan.meals.${menuFor.meal}`) : ''} trackId="plan.meal.menu">
        {menuFor ? (
          <View style={{ gap: 8, paddingBottom: 8 }}>
            <Button
              variant="outline"
              fullWidth
              trackId="plan.meal.menu_open"
              onPress={() => {
                const id = menuFor.recipeId;
                setMenuFor(null);
                router.push(`/recipe/${id}`);
              }}
            >
              {t('plan.actions.open')}
            </Button>
            {menuFor.leftoverOf ? null : (
              <Button
                variant="outline"
                fullWidth
                trackId={menuFor.cookedAt ? 'plan.meal.not_cooked' : 'plan.meal.cooked'}
                onPress={() => {
                  const entry = menuFor;
                  setMenuFor(null);
                  if (!entry.cookedAt) haptics.cooked();
                  void guarded(slotKey(entry.date, entry.meal), () => plan.change(entry, { cookedAt: entry.cookedAt ? null : new Date().toISOString() }));
                }}
              >
                {menuFor.cookedAt ? t('plan.actions.markNotCooked') : t('plan.actions.markCooked')}
              </Button>
            )}
            <Button
              variant="danger"
              fullWidth
              trackId="plan.meal.remove"
              onPress={() => {
                const entry = menuFor;
                setMenuFor(null);
                void guarded(slotKey(entry.date, entry.meal), () => plan.remove(entry));
              }}
            >
              {t('plan.actions.remove')}
            </Button>
          </View>
        ) : null}
      </SheetModal>
    </Screen>
  );
}
