import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';
import type { Edge } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import { saveAfterSignInPath } from '@/lib/authReturnPath';
import { recipeCardToExtracted } from '@shared/lib/recipeCardMap';
import { claimHubCard, fetchHubCard, fetchLibraryRecipeForCard } from '@shared/lib/supabase/cookingHub';
import { translateAppError } from '@shared/lib/translateAppError';
import type { RecipeCard } from '@shared/types/recipeCard';

export default function HubRecipeScreen() {
  const { t } = useTranslation();
  const { id: idParam, save } = useLocalSearchParams<{ id: string; save?: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  // Set when Add sent a guest to sign up (or `?save=1` after web Google sign-in left the page),
  // so the recipe is added once they're back and signed in.
  const saveAfterAuth = useRef(save === '1');
  const { session, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();
  const navigation = useNavigation();

  const [card, setCard] = useState<RecipeCard | null>(null);
  const [existingRecipeId, setExistingRecipeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id?.trim()) {
        setLoadError(t('hub.notFound'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const next = await fetchHubCard(id.trim());
        if (cancelled) return;
        if (!next) {
          setCard(null);
          setLoadError(t('hub.notFound'));
          setLoading(false);
          return;
        }
        setCard(next);
        if (session?.user) {
          try {
            const existingId = await fetchLibraryRecipeForCard(next.id);
            if (!cancelled) setExistingRecipeId(existingId);
          } catch {
            if (!cancelled) setExistingRecipeId(null);
          }
        } else if (!cancelled) {
          setExistingRecipeId(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t('hub.notFound'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, session?.user, t]);

  useEffect(() => {
    navigation.setOptions({
      title: card?.title?.trim() || t('hub.recipeTitle'),
    });
  }, [card?.title, navigation, t]);

  const addToLibrary = useCallback(async () => {
    if (!card || claiming) return;

    if (!session?.user) {
      saveAfterAuth.current = true;
      const returnTo = id ? saveAfterSignInPath('hub', id) : null;
      router.push({
        pathname: '/auth',
        params: { mode: 'signup', reason: 'hub_recipe', ...(returnTo ? { returnTo } : {}) },
      });
      return;
    }

    setClaiming(true);
    try {
      const recipeId = await claimHubCard(card.id);
      router.replace(`/recipe/${recipeId}`);
    } catch (err) {
      Alert.alert(
        t('hub.addFailedTitle'),
        translateAppError(err instanceof Error ? err.message : t('common.tryAgain'), t),
      );
    } finally {
      setClaiming(false);
    }
  }, [card, claiming, id, session?.user, t]);

  useEffect(() => {
    if (authLoading || loading || !card || !session?.user || !saveAfterAuth.current) return;
    saveAfterAuth.current = false;
    if (existingRecipeId) router.replace(`/recipe/${existingRecipeId}`);
    else void addToLibrary();
  }, [authLoading, loading, card, session?.user, existingRecipeId, addToLibrary]);

  // The stack header (root layout) already has the back button and the title.
  const screenEdges: Edge[] = ['bottom'];

  if (loading || authLoading) {
    return (
      <Screen edges={screenEdges}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      </Screen>
    );
  }

  if (loadError || !card) {
    return (
      <Screen edges={screenEdges}>
        <View
          className="flex-1 items-center justify-center gap-4 px-6"
          accessibilityLiveRegion="polite"
        >
          <Text className="text-center text-base" style={{ color: colors.textSecondary }}>
            {loadError ?? t('hub.notFound')}
          </Text>
          <Pressable trackId="hub_recipe.back_to_hub"
            onPress={() => router.replace('/hub')}
            accessibilityRole="button"
            className="rounded-full px-5 py-3 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold" style={{ color: colors.onPrimary }}>
              {t('hub.backToHub')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const recipe = recipeCardToExtracted(card);

  return (
    <Screen edges={screenEdges}>
      <View className="px-5 pb-3 pt-2">
        <Pressable trackId={existingRecipeId ? 'hub_recipe.open_in_library' : 'hub_recipe.add_to_library'}
          onPress={() =>
            existingRecipeId
              ? router.replace(`/recipe/${existingRecipeId}`)
              : void addToLibrary()
          }
          disabled={claiming}
          accessibilityRole="button"
          accessibilityLabel={existingRecipeId ? t('hub.openInLibrary') : t('hub.addToLibrary')}
          accessibilityState={{ disabled: claiming, busy: claiming }}
          className="min-h-12 items-center justify-center rounded-3xl px-5 active:opacity-80 disabled:opacity-60"
          style={{ backgroundColor: colors.primary }}
        >
          {claiming ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text className="text-sm font-bold" style={{ color: colors.onPrimary }}>
              {existingRecipeId ? t('hub.openInLibrary') : t('hub.addToLibrary')}
            </Text>
          )}
        </Pressable>
        <Text className="mt-2 text-center text-xs leading-4" style={{ color: colors.textSecondary }}>
          {t('hub.attribution')}
        </Text>
      </View>
      <RecipeView recipe={recipe} allowAdaptations={false} />
    </Screen>
  );
}
