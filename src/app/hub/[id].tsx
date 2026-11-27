import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Edge } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { saveAfterSignInPath } from '@/lib/authReturnPath';
import { cachedTranslationContent } from '@shared/lib/cachedTranslation';
import { recipeCardToExtracted } from '@shared/lib/recipeCardMap';
import { isRecipeLanguageCode } from '@shared/lib/recipeLanguages';
import { resolveRecipeSourceLanguage } from '@shared/lib/recipeSourceLanguage';
import { claimHubCard, fetchHubCard, fetchLibraryRecipeForCard } from '@shared/lib/supabase/cookingHub';
import { fetchRecipeCardTranslation } from '@shared/lib/supabase/recipeCardTranslations';
import { translateAppError } from '@shared/lib/translateAppError';
import type { RecipeTranslationContent } from '@shared/types/recipe';
import type { RecipeCard } from '@shared/types/recipeCard';

/** A card's translation into `language`, if the server made one (PIN-77). A card is never translated from here. */
async function cardTranslation(card: RecipeCard, language: string): Promise<RecipeTranslationContent | null> {
  if (resolveRecipeSourceLanguage(card) === language) return null;
  return fetchRecipeCardTranslation(card.id, language).catch(() => null);
}

export default function HubRecipeScreen() {
  const { t } = useTranslation();
  const { id: idParam, save } = useLocalSearchParams<{ id: string; save?: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  // Set when Add sent a guest to sign up (or `?save=1` after web Google sign-in left the page),
  // so the recipe is added once they're back and signed in.
  const saveAfterAuth = useRef(save === '1');
  const { session, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();
  const { language, ready: languageReady } = useLanguagePreference();
  const navigation = useNavigation();

  const [card, setCard] = useState<RecipeCard | null>(null);
  /** The card in the app language, when the server has translated it; shown instead of its own words. */
  const [translation, setTranslation] = useState<{ language: string; content: RecipeTranslationContent } | null>(null);
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
        const translated = await cardTranslation(next, language);
        if (cancelled) return;
        setTranslation(translated ? { language, content: translated } : null);
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
    // Waits for the saved app language, so a translated card doesn't show in its own words first.
    if (languageReady) void load();
    return () => {
      cancelled = true;
    };
  }, [id, language, languageReady, session?.user, t]);

  const recipe = useMemo(() => (card ? recipeCardToExtracted(card) : null), [card]);
  // Units in the app language and the card's own grams/spoons, as a saved recipe's cached translation is shown.
  const localized = useMemo(
    () => (recipe && translation ? cachedTranslationContent(recipe, translation.language, translation.content) : null),
    [recipe, translation],
  );
  const localizedLanguage = localized && translation && isRecipeLanguageCode(translation.language) ? translation.language : null;

  useEffect(() => {
    navigation.setOptions({
      title: localized?.title?.trim() || card?.title?.trim() || t('hub.recipeTitle'),
    });
  }, [card?.title, localized?.title, navigation, t]);

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

  if (loading || authLoading || !languageReady) {
    return (
      <Screen edges={screenEdges}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      </Screen>
    );
  }

  if (loadError || !card || !recipe) {
    return (
      <Screen edges={screenEdges}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 }}
          accessibilityLiveRegion="polite"
        >
          <Text variant="body" tone="muted" align="center">
            {loadError ?? t('hub.notFound')}
          </Text>
          {/* dismissTo, not replace: replace put a second set of tabs on top of the first one. */}
          <Button trackId="hub_recipe.back_to_hub" icon="chevron-back" onPress={() => router.dismissTo('/hub')}>
            {t('hub.backToHub')}
          </Button>
        </View>
      </Screen>
    );
  }

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
      <RecipeView
        recipe={recipe}
        allowAdaptations={false}
        localizedContent={localizedLanguage ? localized : null}
        localizedLanguage={localizedLanguage}
      />
    </Screen>
  );
}
