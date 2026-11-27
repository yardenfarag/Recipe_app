import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import type { LibraryOnlyStatus } from '@shared/lib/mealPlan/fillWeek';
import type { FillOutcome, FillRequest } from '@shared/lib/mealPlan/planner';
import { mealsOfDay } from '@shared/lib/mealPlan/week';
import { showToast } from '@shared/lib/toast';
import { MAIN_MEALS, type MainMeal, type MealPlanPrefs, type PlanAdjust, type PlanMeal, type SnacksPerDay } from '@shared/types/mealPlan';

import { SettingsSwitchRow } from '@/components/SettingsSwitchRow';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

type AdjustKey = Exclude<keyof PlanAdjust, 'skipFoods'>;
const ADJUST_KEYS: AdjustKey[] = ['quickWeeknights', 'cheaper', 'moreProtein', 'useUpFridge', 'fewerNew'];

/** "Plan my week" on the phone: the same choices as the web, in a sheet. The choices are remembered on the account. */
export function PlanMyWeekSheet(props: {
  visible: boolean;
  onClose: () => void;
  days: string[];
  dayLabel: (date: string) => string;
  prefs: MealPlanPrefs;
  following: { label: string; allergy: boolean }[];
  libraryStatus: (meals: PlanMeal[]) => LibraryOnlyStatus;
  hasMeals: boolean;
  onSavePrefs: (prefs: MealPlanPrefs) => Promise<void>;
  onFill: (request: FillRequest) => Promise<FillOutcome>;
}) {
  const { t } = useTranslation();
  return (
    <SheetModal visible={props.visible} onClose={props.onClose} title={t('plan.fill.title')} trackId="plan.fill">
      {props.visible ? <Body {...props} /> : null}
    </SheetModal>
  );
}

function Body({
  days,
  dayLabel,
  prefs,
  following,
  libraryStatus,
  hasMeals,
  onSavePrefs,
  onFill,
  onClose,
}: Parameters<typeof PlanMyWeekSheet>[0]) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  // A TextInput takes the physical side on iOS (unlike Text), so start is 'right' in Hebrew and Arabic.
  const { textAlign, writingDirection } = useRtl();
  const [chosenDays, setChosenDays] = useState<string[]>(days);
  const [meals, setMeals] = useState<MainMeal[]>(prefs.meals);
  const [snacks, setSnacks] = useState<SnacksPerDay>(prefs.snacksPerDay);
  const [useHub, setUseHub] = useState(prefs.useHub);
  const [leftovers, setLeftovers] = useState(prefs.leftovers);
  const [adjust, setAdjust] = useState<Record<AdjustKey, boolean>>({ quickWeeknights: false, cheaper: false, moreProtein: false, useUpFridge: false, fewerNew: false });
  const [skipFoods, setSkipFoods] = useState<string[]>([]);
  const [skipDraft, setSkipDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayMeals = useMemo(() => mealsOfDay(meals, snacks), [meals, snacks]);
  const status = useMemo(() => libraryStatus(dayMeals), [dayMeals, libraryStatus]);
  const hubForced = !status.allowed;

  async function run(mode: FillRequest['mode']) {
    if (chosenDays.length === 0) {
      setError(t('plan.fill.pickDay'));
      return;
    }
    setBusy(true);
    setError(null);
    void onSavePrefs({ meals, snacksPerDay: snacks, useHub, leftovers });
    try {
      const outcome = await onFill({
        days: [...chosenDays].sort(),
        meals: dayMeals,
        mode,
        useHub: useHub || hubForced,
        leftovers,
        adjust: { ...adjust, skipFoods },
      });
      if (outcome.filled === 0 && outcome.empty === 0) {
        setError(t('plan.fill.nothingToFill'));
        setBusy(false);
        return;
      }
      showToast(outcome.empty > 0 ? t('plan.fill.someEmpty') : t('plan.fill.done'), outcome.empty > 0 ? 'info' : 'success');
      onClose();
    } catch {
      setError(t('plan.fill.failed'));
      setBusy(false);
    }
  }

  function addSkip() {
    const food = skipDraft.trim().slice(0, 30);
    if (food && !skipFoods.some((item) => item.toLowerCase() === food.toLowerCase())) setSkipFoods([...skipFoods, food].slice(0, 5));
    setSkipDraft('');
  }

  const section = (title: string) => (
    <Text variant="caption" tone="muted" weight="semibold" style={{ marginBottom: 8 }}>
      {title.toUpperCase()}
    </Text>
  );

  return (
    <View style={{ gap: 18, paddingBottom: 8 }}>
      <View>
        {section(t('plan.fill.days'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {days.map((day) => {
            const on = chosenDays.includes(day);
            return (
              <Chip key={day} size="sm" selected={on} trackId="plan.fill.day" onPress={() => setChosenDays(on ? chosenDays.filter((d) => d !== day) : [...chosenDays, day])}>
                {dayLabel(day)}
              </Chip>
            );
          })}
        </View>
      </View>

      <View>
        {section(t('plan.fill.meals'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MAIN_MEALS.map((meal) => {
            const on = meals.includes(meal);
            return (
              <Chip
                key={meal}
                size="sm"
                selected={on}
                trackId={`plan.fill.meal.${meal}`}
                onPress={() => setMeals(on ? (meals.length > 1 ? meals.filter((m) => m !== meal) : meals) : MAIN_MEALS.filter((m) => m === meal || meals.includes(m)))}
              >
                {t(`plan.meals.${meal}`)}
              </Chip>
            );
          })}
        </View>
      </View>

      <View>
        {section(t('plan.fill.snacks'))}
        <SegmentedControl<'0' | '1' | '2'>
          label={t('plan.fill.snacks')}
          fullWidth
          value={String(snacks) as '0' | '1' | '2'}
          onChange={(value) => setSnacks(Number(value) as SnacksPerDay)}
          options={[
            { value: '0', label: t('plan.fill.noSnacks'), trackId: 'plan.fill.snacks.none' },
            { value: '1', label: t('plan.fill.oneSnack'), trackId: 'plan.fill.snacks.one' },
            { value: '2', label: t('plan.fill.twoSnacks'), trackId: 'plan.fill.snacks.two' },
          ]}
        />
        <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
          {t('plan.fill.remembered')}
        </Text>
      </View>

      <View style={{ borderRadius: 16, backgroundColor: colors.backgroundElement, padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Text variant="bodySmall" tone="muted">
            {following.length > 0 ? t('plan.fill.following') : t('plan.fill.noDiet')}
          </Text>
          {following.map((item) => (
            <View
              key={item.label}
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 3,
                backgroundColor: item.allergy ? colors.dangerSoft : colors.surface,
              }}
            >
              <Text variant="caption" weight="semibold" tone={item.allergy ? 'danger' : 'default'}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
        <Button variant="link" size="sm" trackId="plan.fill.change_kitchen" onPress={() => router.push('/settings/recipe')} style={{ alignSelf: 'flex-start' }}>
          {t('plan.fill.change')}
        </Button>
      </View>

      <View>
        <SettingsSwitchRow
          label={t('plan.fill.useHub')}
          hint={hubForced ? t('plan.fill.hubLocked', { count: status.fitting }) : status.thinMeals.length > 0 && !useHub ? t('plan.fill.hubThin') : t('plan.fill.useHubHint')}
          value={useHub || hubForced}
          disabled={hubForced}
          onToggle={() => setUseHub(!useHub)}
          trackId="plan.fill.use_hub"
        />
        <SettingsSwitchRow
          label={t('plan.fill.leftovers')}
          hint={t('plan.fill.leftoversHint')}
          value={leftovers}
          onToggle={() => setLeftovers(!leftovers)}
          trackId="plan.fill.leftovers"
        />
      </View>

      <View>
        {section(t('plan.fill.adjust'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ADJUST_KEYS.map((key) => (
            <Chip key={key} size="sm" selected={adjust[key]} trackId={`plan.adjust.${key}`} onPress={() => setAdjust({ ...adjust, [key]: !adjust[key] })}>
              {t(`plan.fill.${key}`)}
            </Chip>
          ))}
          {skipFoods.map((food) => (
            <Chip key={food} size="sm" selected icon="close" trackId="plan.adjust.skip_remove" accessibilityLabel={t('plan.fill.skipRemove', { food })} onPress={() => setSkipFoods(skipFoods.filter((item) => item !== food))}>
              {food}
            </Chip>
          ))}
        </View>
        {skipFoods.length < 5 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <TextInput
              value={skipDraft}
              onChangeText={setSkipDraft}
              onSubmitEditing={addSkip}
              maxLength={30}
              placeholder={`${t('plan.fill.skipFood')}: ${t('plan.fill.skipPlaceholder')}`}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('plan.fill.skipLabel')}
              returnKeyType="done"
              style={[
                type.variant('bodySmall'),
                { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12 },
                { textAlign, writingDirection },
              ]}
            />
            <Button size="sm" variant="secondary" trackId="plan.adjust.skip_add" disabled={!skipDraft.trim()} onPress={addSkip}>
              {t('plan.fill.skipAdd')}
            </Button>
          </View>
        ) : null}
      </View>

      <Text variant="bodySmall" tone="muted">
        {t('plan.fill.lockedStay')}
      </Text>
      {error ? (
        <Text variant="bodySmall" tone="danger" weight="semibold" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button trackId="plan.fill.fill" busy={busy} fullWidth onPress={() => void run('fill')}>
          {t('plan.fill.fill')}
        </Button>
        {hasMeals ? (
          <Button variant="outline" trackId="plan.fill.reshuffle" disabled={busy} fullWidth onPress={() => void run('reshuffle')}>
            {t('plan.fill.reshuffle')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
