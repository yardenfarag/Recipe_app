import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View, useWindowDimensions } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { RecipeImage } from '@/components/RecipeImage';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { PinchLogo } from '@/components/ui/PinchLogo';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, Radii } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
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
      showToast(t('firstRecipes.saveFailed'), 'error');
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
    <View style={{ gap: 8 }}>
      <View style={{ minHeight: 56, justifyContent: 'center' }}>
        <PinchLogo />
      </View>
      <PageHeader
        title={t('firstRecipes.title')}
        subtitle={hasDiets ? t('firstRecipes.subtitleDiets') : t('firstRecipes.subtitle')}
      />
    </View>
  );

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {state.kind === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primaryText} accessibilityLabel={t('a11y.loading')} />
        </View>
      ) : state.kind === 'error' ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
          {header}
          <Tile padding={24} style={{ gap: 14 }}>
            <Text variant="body" tone="muted">
              {t('firstRecipes.loadFailed')}
            </Text>
            <Button trackId="first_recipes.retry" fullWidth onPress={() => void load()}>
              {t('common.tryAgain')}
            </Button>
            {/* Never a dead end: without the Hub, Snap is the way to a first recipe. */}
            <Button
              variant="outline"
              trackId="first_recipes.continue_without"
              fullWidth
              onPress={() => router.replace('/add')}
            >
              {t('firstRecipes.continueToSnap')}
            </Button>
          </Tile>
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
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
              borderTopWidth: HAIRLINE,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <Text variant="caption" tone="muted" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
              {/* Before a pick, the button itself says "Pick at least one". */}
              {picked.length > 0 ? t('firstRecipes.pickedCount', { count: picked.length }) : ''}
            </Text>
            <Button
              trackId="first_recipes.save"
              size="lg"
              disabled={!canSave && !saving}
              busy={saving}
              onPress={() => void save()}
            >
              {picked.length > 0
                ? t('firstRecipes.save', { count: picked.length })
                : t('firstRecipes.pickOne')}
            </Button>
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
  const type = useTypography();
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
      style={({ pressed }) => [
        {
          flex: 1,
          overflow: 'hidden',
          borderRadius: Radii.card,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: selected ? colors.primary : colors.border,
        },
        pressed ? { opacity: 0.9 } : null,
      ]}
    >
      <View>
        {card.image_url ? (
          <RecipeImage
            uri={card.image_url}
            variant="compact"
            borderRadius={0}
            style={{ width: '100%', height: 120 }}
            aiGenerated={card.image_generated === true}
          />
        ) : (
          <View
            style={{ height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElement }}
          >
            <CookieMark size={36} color={colors.primaryText} />
          </View>
        )}
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 8,
            end: 8,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.primary : colors.surface,
            borderWidth: selected ? 0 : 2,
            borderColor: colors.border,
          }}
        >
          {selected ? <KitIcon icon="checkmark" color={colors.onPrimary} size={18} /> : null}
        </View>
      </View>
      <View style={{ gap: 6, padding: 12 }}>
        <Text
          numberOfLines={2}
          style={{ ...type.font('display', 'bold'), fontSize: 15, lineHeight: type.rtl ? 21 : 19 }}
        >
          {card.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {fitsDiet ? (
            <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.primarySoft }}>
              <Text color={colors.primaryText} style={{ ...type.font('body', 'semibold'), fontSize: 11, lineHeight: 15 }}>
                {t('firstRecipes.fitsDiet')}
              </Text>
            </View>
          ) : null}
          {duration ? (
            <Text variant="caption" tone="muted">
              {duration}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
