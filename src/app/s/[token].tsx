import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { saveAfterSignInPath } from '@/lib/authReturnPath';
import { serverErrorText, SHARE_ERROR_KEYS } from '@shared/lib/serverErrors';
import {
  claimRecipeShare,
  getRecipeShare,
  type RecipeSharePreview,
} from '@shared/lib/supabase/recipeShare';

export default function SharedRecipeScreen() {
  const { t } = useTranslation();
  const { language } = useLanguagePreference();
  const { token: tokenParam, save } = useLocalSearchParams<{ token: string; save?: string }>();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const { session, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();

  const [recipe, setRecipe] = useState<RecipeSharePreview | null>(null);
  // What the server said, turned into words at render so they follow the app language.
  const [loadError, setLoadError] = useState<{ code?: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  // Set when Save sent a guest to sign up, so the recipe saves once they come back signed in.
  // `?save=1` carries the same intent across a page load (web Google sign-in leaves the page).
  const saveAfterAuth = useRef(save === '1');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token?.trim()) {
        setLoadError({ code: 'share_not_found' });
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      const result = await getRecipeShare(token.trim());
      if (cancelled) return;
      if (result.status !== 'ok') {
        setRecipe(null);
        setLoadError({ code: result.code, message: result.message });
        setLoading(false);
        return;
      }
      setRecipe(result.recipe);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveToLibrary = useCallback(async () => {
    if (!token?.trim() || claimInFlight.current) return false;

    if (!session?.user) {
      saveAfterAuth.current = true;
      const returnTo = saveAfterSignInPath('s', token);
      router.push({
        pathname: '/auth',
        params: { mode: 'signup', reason: 'shared_recipe', ...(returnTo ? { returnTo } : {}) },
      });
      return false;
    }

    claimInFlight.current = true;
    setClaiming(true);
    setClaimError(null);
    try {
      const result = await claimRecipeShare(token.trim());
      if (result.status !== 'ok') {
        const message = serverErrorText(result, t, language, 'common.tryAgain', SHARE_ERROR_KEYS);
        setClaimError(message);
        Alert.alert(t('recipe.shareClaimFailedTitle'), message);
        return false;
      }
      router.replace(`/recipe/${result.recipeId}`);
      return true;
    } catch (err) {
      const thrown = { message: err instanceof Error ? err.message : null };
      const message = serverErrorText(thrown, t, language, 'common.tryAgain', SHARE_ERROR_KEYS);
      setClaimError(message);
      Alert.alert(t('recipe.shareClaimFailedTitle'), message);
      return false;
    } finally {
      claimInFlight.current = false;
      setClaiming(false);
    }
  }, [session?.user, token, t, language]);

  // Recipients see the recipe first and save it with one tap. Someone who tapped Save as a guest
  // and then signed up gets it saved on return, without a second tap.
  useEffect(() => {
    if (authLoading || loading || !recipe || !session?.user || !saveAfterAuth.current) return;
    saveAfterAuth.current = false;
    void saveToLibrary();
  }, [authLoading, loading, recipe, session?.user, saveToLibrary]);

  if (loading || authLoading) {
    return (
      <Screen edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
          <ActivityIndicator color={colors.primary} />
          <Text variant="bodySmall" tone="muted" align="center">
            {t('recipe.shareLoading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (loadError || !recipe) {
    return (
      <Screen edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 }}>
          <Text variant="body" align="center">
            {loadError
              ? serverErrorText(loadError, t, language, 'serverErrors.shareUnavailable', SHARE_ERROR_KEYS)
              : t('recipe.shareNotFound')}
          </Text>
          <Button trackId="shared_recipe.go_home" onPress={() => router.dismissTo('/')}>
            {t('recipe.goToLibrary')}
          </Button>
        </View>
      </Screen>
    );
  }

  if (claiming) {
    return (
      <Screen edges={['bottom']}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={colors.primary} />
          <Text variant="bodySmall" tone="muted" align="center">
            {t('recipe.shareClaiming')}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <RecipeView
        recipe={recipe}
        footer={
          <View style={{ marginTop: 8, gap: 10, paddingBottom: 16 }}>
            <View accessibilityLiveRegion="polite">
              {claimError ? (
                <Text variant="bodySmall" tone="danger" align="center">
                  {claimError}
                </Text>
              ) : null}
            </View>
            <Button
              trackId="shared_recipe.save"
              onPress={() => {
                void saveToLibrary();
              }}
              busy={claiming}
              size="lg"
              fullWidth
              icon="add"
              accessibilityLabel={session?.user ? t('recipe.shareSave') : t('recipe.shareSignInToSave')}
            >
              {session?.user ? t('recipe.shareSave') : t('recipe.shareSignInToSave')}
            </Button>
            <Text variant="bodySmall" tone="muted" align="center">
              {t('recipe.shareSaveHint')}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
