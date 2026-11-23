import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Edge } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
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
        translateAppError(err, t),
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      </Screen>
    );
  }

  if (loadError || !card) {
    return (
      <Screen edges={screenEdges}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 }}
          accessibilityLiveRegion="polite"
        >
          <Text variant="body" tone="muted" align="center">
            {loadError ?? t('hub.notFound')}
          </Text>
          <Button trackId="hub_recipe.back_to_hub" icon="chevron-back" onPress={() => router.replace('/hub')}>
            {t('hub.backToHub')}
          </Button>
        </View>
      </Screen>
    );
  }

  const recipe = recipeCardToExtracted(card);

  return (
    <Screen edges={screenEdges}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 8 }}>
        <Button
          trackId={existingRecipeId ? 'hub_recipe.open_in_library' : 'hub_recipe.add_to_library'}
          onPress={() =>
            existingRecipeId
              ? router.replace(`/recipe/${existingRecipeId}`)
              : void addToLibrary()
          }
          busy={claiming}
          size="lg"
          fullWidth
          icon={existingRecipeId ? 'book-outline' : 'add'}
          accessibilityLabel={existingRecipeId ? t('hub.openInLibrary') : t('hub.addToLibrary')}
        >
          {existingRecipeId ? t('hub.openInLibrary') : t('hub.addToLibrary')}
        </Button>
        <Text variant="caption" tone="muted" align="center">
          {t('hub.attribution')}
        </Text>
      </View>
      <RecipeView recipe={recipe} allowAdaptations={false} />
    </Screen>
  );
}
