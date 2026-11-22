import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, View, useWindowDimensions } from 'react-native';

import { RecipeImage } from '@/components/RecipeImage';
import { Screen } from '@/components/Screen';
import { Pressable } from '@/components/ui/Pressable';
import { useAuth } from '@/hooks/useAuth';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { captureFirstRecipesPicked } from '@/lib/analytics';
import {
  FIRST_RECIPES_MIN,
  fetchFirstRecipeChoices,
  fitsAllDiets,
  libraryIsEmpty,
  saveFirstRecipes,
} from '@shared/lib/firstRecipes';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import { showToast } from '@shared/lib/toast';
import type { RecipeCard } from '@shared/types/recipeCard';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; cards: RecipeCard[] }
  | { kind: 'error' };

/**
 * Right after onboarding: popular Hub recipes that fit the diets and avoid list the cook just gave, to save at least
 * one before the Library opens. Many new accounts never had a link at hand and left with an empty Library.
 * An account that already has recipes (signing in again) goes straight on to Snap.
 */
export default function FirstRecipesScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign, writingDirection } = useRtl();
  const rtlText = { textAlign, writingDirection };
  const { width } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const { profile: kitchen, loading: kitchenLoading } = useKitchenProfile();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      if (!(await libraryIsEmpty())) {
        router.replace('/add');
        return;
      }
      const cards = await fetchFirstRecipeChoices(kitchen);
      // Nothing to offer (as on the web): no reason to hold anyone here.
      if (cards.length === 0) {
        router.replace('/add');
        return;
      }
      setState({ kind: 'ready', cards });
    } catch (error) {
      console.warn('[first-recipes] load failed', error);
      setState({ kind: 'error' });
    }
  }, [kitchen]);

  useEffect(() => {
    if (authLoading || kitchenLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    void load();
  }, [authLoading, kitchenLoading, user, load]);

  function toggle(card: RecipeCard) {
    setPicked((current) => {
      const next = current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id];
      announce(t('firstRecipes.pickedCount', { count: next.length }));
      return next;
    });
  }

  async function save() {
    if (saving || picked.length < FIRST_RECIPES_MIN) return;
    setSaving(true);
    const { saved } = await saveFirstRecipes(picked);
    if (saved === 0) {
      setSaving(false);
      showToast(t('firstRecipes.saveFailed'), 'info');
      return;
    }
    captureFirstRecipesPicked({ count: saved, diets: kitchen.diets.length });
    showToast(t('firstRecipes.saved', { count: saved }));
    // The tab walkthrough shows next; the reminders are offered when it ends (app-tabs.tsx).
    router.replace('/');
  }

  const columns = width >= 700 ? 3 : 2;
  const hasDiets = kitchen.diets.length > 0;
  const canSave = picked.length >= FIRST_RECIPES_MIN && !saving;

  const header = (
    <View className="pb-4 pt-2">
      <Text
        accessibilityRole="header"
        className="text-2xl font-bold"
        style={{ color: colors.text, ...rtlText }}
      >
        {t('firstRecipes.title')}
      </Text>
      <Text className="mt-1.5 text-sm leading-5" style={{ color: colors.textSecondary, ...rtlText }}>
        {hasDiets ? t('firstRecipes.subtitleDiets') : t('firstRecipes.subtitle')}
      </Text>
    </View>
  );

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {state.kind === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      ) : state.kind === 'error' ? (
        <View className="flex-1 justify-center px-6">
          {header}
          <Text className="mb-5 text-base" style={{ color: colors.textSecondary, ...rtlText }}>
            {t('firstRecipes.loadFailed')}
          </Text>
          <Pressable
            trackId="first_recipes.retry"
            onPress={() => void load()}
            accessibilityRole="button"
            className="mb-3 min-h-12 items-center justify-center rounded-3xl px-5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-base font-bold" style={{ color: colors.onPrimary }}>
              {t('common.tryAgain')}
            </Text>
          </Pressable>
          {/* Never a dead end: without the Hub, Snap is the way to a first recipe. */}
          <Pressable
            trackId="first_recipes.continue_without"
            onPress={() => router.replace('/add')}
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-3xl px-5 active:opacity-80"
            style={{ backgroundColor: colors.surface }}
          >
            <Text className="text-base font-bold" style={{ color: colors.primary }}>
              {t('firstRecipes.continueToSnap')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            key={columns}
            data={state.cards}
            numColumns={columns}
            keyExtractor={(card) => card.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            columnWrapperStyle={{ gap: 12 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item }) => (
              <PickTile
                card={item}
                selected={picked.includes(item.id)}
                fitsDiet={fitsAllDiets(item, kitchen)}
                onPress={() => toggle(item)}
              />
            )}
          />
          <View
            className="border-t px-5 pb-2 pt-3"
            style={{ backgroundColor: colors.background, borderTopColor: colors.frostedBorder }}
          >
            <Pressable
              trackId="first_recipes.save"
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: saving }}
              className="min-h-12 items-center justify-center rounded-3xl px-5 active:opacity-80"
              style={{ backgroundColor: canSave ? colors.primary : colors.backgroundElement }}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text
                  className="text-base font-bold"
                  style={{ color: canSave ? colors.onPrimary : colors.textSecondary }}
                >
                  {picked.length > 0
                    ? t('firstRecipes.save', { count: picked.length })
                    : t('firstRecipes.pickOne')}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

function PickTile({
  card,
  selected,
  fitsDiet,
  onPress,
}: {
  card: RecipeCard;
  selected: boolean;
  fitsDiet: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const duration = card.estimated_time_minutes
    ? formatRecipeDuration(card.estimated_time_minutes, {
        minutes: t('recipe.durationMin'),
        hours: t('recipe.durationHr'),
      })
    : null;
  return (
    <Pressable
      trackId="first_recipes.toggle"
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={card.title}
      className="flex-1 overflow-hidden rounded-3xl active:opacity-90"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: selected ? colors.primary : 'transparent',
      }}
    >
      <View>
        {card.image_url ? (
          <RecipeImage uri={card.image_url} variant="compact" borderRadius={0} style={{ width: '100%', height: 120 }} aiGenerated={card.image_generated === true} />
        ) : (
          <View
            className="items-center justify-center"
            style={{ height: 120, backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="restaurant" size={28} color={colors.primary} />
          </View>
        )}
        <View
          className="absolute end-2 top-2 h-7 w-7 items-center justify-center rounded-full"
          style={{
            backgroundColor: selected ? colors.primary : colors.surface,
            borderWidth: selected ? 0 : 1.5,
            borderColor: colors.frostedBorder,
          }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {selected ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
        </View>
      </View>
      <View className="gap-1 p-3">
        <Text className="text-sm font-bold leading-5" numberOfLines={2} style={{ color: colors.text }}>
          {card.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          {fitsDiet ? (
            <Text
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: colors.primarySoft, color: colors.primary, overflow: 'hidden' }}
            >
              {t('firstRecipes.fitsDiet')}
            </Text>
          ) : null}
          {duration ? (
            <Text className="text-xs" style={{ color: colors.textSecondary }}>
              {duration}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
