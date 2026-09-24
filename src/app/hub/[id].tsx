import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Edge } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { StackHeaderBackButton } from '@/components/StackHeaderBackButton';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import { recipeCardToExtracted } from '@/lib/recipeCardMap';
import { claimHubCard, fetchHubCard } from '@/lib/supabase/cookingHub';
import { fetchRecipeByUrl } from '@/lib/supabase/recipes';
import { translateAppError } from '@/lib/translateAppError';
import type { RecipeCard } from '@/types/recipeCard';

export default function HubRecipeScreen() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { session, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();
  const navigation = useNavigation();
  const isWeb = Platform.OS === 'web';

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
        if (session?.user && next.original_url) {
          const existing = await fetchRecipeByUrl(next.original_url);
          if (!cancelled) setExistingRecipeId(existing?.id ?? null);
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
      router.push({
        pathname: '/auth',
        params: { mode: 'signup', reason: 'hub_recipe' },
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
  }, [card, claiming, session?.user, t]);

  const screenEdges: Edge[] = isWeb ? ['top', 'bottom'] : ['bottom'];

  if (loading || authLoading) {
    return (
      <Screen edges={screenEdges}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (loadError || !card) {
    return (
      <Screen edges={screenEdges}>
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-base" style={{ color: colors.textSecondary }}>
            {loadError ?? t('hub.notFound')}
          </Text>
          <Pressable
            onPress={() => router.replace('/hub')}
            className="rounded-full px-5 py-3 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold text-white">{t('hub.backToHub')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const recipe = recipeCardToExtracted(card);

  return (
    <Screen edges={screenEdges}>
      {isWeb ? (
        <View className="flex-row items-center justify-between px-5 py-3">
          <StackHeaderBackButton fallback="/hub" />
          <Text className="text-base font-bold" style={{ color: colors.text }} numberOfLines={1}>
            {card.title}
          </Text>
          <View className="w-10" />
        </View>
      ) : null}
      <View className="px-5 pb-3 pt-2">
        <Pressable
          onPress={() =>
            existingRecipeId
              ? router.replace(`/recipe/${existingRecipeId}`)
              : void addToLibrary()
          }
          disabled={claiming}
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-3xl px-5 active:opacity-80 disabled:opacity-60"
          style={{ backgroundColor: colors.primary }}
        >
          {claiming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-sm font-bold text-white">
              {existingRecipeId ? t('hub.openInLibrary') : t('hub.addToLibrary')}
            </Text>
          )}
        </Pressable>
        <Text className="mt-2 text-center text-xs leading-4" style={{ color: colors.textSecondary }}>
          {t('hub.attribution')}
        </Text>
      </View>
      <RecipeView recipe={recipe} />
    </Screen>
  );
}
