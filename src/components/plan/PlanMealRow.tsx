import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { MealPlanEntry, PlanMeal } from '@shared/types/mealPlan';
import type { Recipe } from '@shared/types/recipe';

import { CookieMark } from '@/components/CookieMark';
import { RecipeImage } from '@/components/RecipeImage';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';

/**
 * One meal of the plan on the phone (PIN-77): the recipe's photo, name, time and what is at home, with lock,
 * another recipe and "more". An empty meal is a dashed row that fills it. Leftovers and snack batches say there is
 * nothing to buy.
 */
export function PlanMealRow({
  meal,
  entry,
  recipe,
  note,
  have,
  tonight,
  readOnly,
  busy,
  onLock,
  onShuffle,
  onMore,
  onFill,
}: {
  meal: PlanMeal;
  entry: MealPlanEntry | null;
  recipe: Recipe | null;
  note: string | null;
  have: string | null;
  tonight: boolean;
  readOnly: boolean;
  busy: boolean;
  onLock: () => void;
  onShuffle: () => void;
  onMore: () => void;
  onFill: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const mealName = t(`plan.meals.${meal}`);

  if (!entry) {
    if (readOnly) return null;
    return (
      <Pressable
        trackId="plan.meal.fill_one"
        onPress={onFill}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${mealName}: ${t('plan.addMeal')}`}
        style={{
          minHeight: 56,
          borderRadius: 18,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text variant="caption" tone="muted" weight="semibold">
          {mealName.toUpperCase()}
        </Text>
        <Text variant="bodySmall" tone="primary" weight="semibold">
          {t('plan.addMeal')}
        </Text>
      </Pressable>
    );
  }

  const leftover = entry.leftoverOf != null;
  const cooked = entry.cookedAt != null;
  const title = recipe ? recipe.display_title?.trim() || recipe.title : '…';
  const minutes = recipe?.estimated_time_minutes;
  const editable = !readOnly && !cooked && !leftover;

  return (
    <View
      accessible={false}
      style={{
        borderRadius: 18,
        borderWidth: tonight ? 2 : 1,
        borderStyle: leftover ? 'dashed' : 'solid',
        borderColor: tonight ? colors.primary : colors.border,
        backgroundColor: leftover ? colors.backgroundElement : colors.surface,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Pressable
        trackId="plan.meal.open"
        onPress={() => router.push(`/recipe/${entry.recipeId}`)}
        accessibilityRole="link"
        accessibilityLabel={`${mealName}: ${title}`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', opacity: cooked || leftover ? 0.55 : 1, backgroundColor: colors.backgroundElement, alignItems: 'center', justifyContent: 'center' }}>
          {recipe?.image_url ? <RecipeImage uri={recipe.image_url} variant="thumb" borderRadius={14} style={{ width: 64, height: 64 }} /> : <CookieMark size={22} color={colors.primary} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="caption" tone={tonight ? 'primary' : 'muted'} weight="semibold">
            {(tonight ? `${mealName} · ${t('plan.tonight')}` : mealName).toUpperCase()}
          </Text>
          <Text variant="body" weight="semibold" numberOfLines={2} tone={cooked ? 'muted' : 'default'}>
            {title}
          </Text>
          {cooked ? (
            <Text variant="caption" tone="success" weight="semibold">
              {t('plan.cooked')}
            </Text>
          ) : leftover ? (
            <Text variant="caption" tone="success" weight="semibold">
              {t('plan.nothingToBuy')}
            </Text>
          ) : (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[minutes ? `${minutes} ${t('recipe.durationMin')}` : null, have].filter(Boolean).join(' · ')}
            </Text>
          )}
          {note && !cooked ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.accentSoft }}>
              <Text variant="caption" weight="semibold" style={{ color: colors.accentText }}>
                {note}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      {readOnly ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {editable ? (
            <>
              <IconButton
                icon={entry.locked ? 'lock-closed' : 'lock-open-outline'}
                label={entry.locked ? t('plan.actions.unlock', { title }) : t('plan.actions.lock', { title })}
                trackId={entry.locked ? 'plan.meal.unlock' : 'plan.meal.lock'}
                selected={entry.locked}
                onPress={onLock}
              />
              <IconButton
                icon="shuffle"
                label={t('plan.actions.shuffle', { title })}
                trackId="plan.meal.shuffle"
                directional
                disabled={entry.locked || busy}
                onPress={onShuffle}
              />
            </>
          ) : null}
          <IconButton icon="ellipsis-horizontal" label={t('plan.actions.more', { title })} trackId="plan.meal.more" onPress={onMore} />
        </View>
      )}
    </View>
  );
}
