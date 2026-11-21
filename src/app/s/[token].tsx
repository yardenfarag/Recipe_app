import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import { saveAfterSignInPath } from '@/lib/authReturnPath';
import {
  claimRecipeShare,
  getRecipeShare,
  type RecipeSharePreview,
} from '@shared/lib/supabase/recipeShare';

export default function SharedRecipeScreen() {
  const { t } = useTranslation();
  const { token: tokenParam, save } = useLocalSearchParams<{ token: string; save?: string }>();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const { session, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();

  const [recipe, setRecipe] = useState<RecipeSharePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
        setLoadError(t('recipe.shareNotFound'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      const result = await getRecipeShare(token.trim());
      if (cancelled) return;
      if (result.status !== 'ok') {
        setRecipe(null);
        setLoadError(
          result.code === 'share_not_found'
            ? t('recipe.shareNotFound')
            : result.message || t('recipe.shareNotFound'),
        );
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
  }, [token, t]);

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
        const message = result.message || t('common.tryAgain');
        setClaimError(message);
        Alert.alert(t('recipe.shareClaimFailedTitle'), message);
        return false;
      }
      router.replace(`/recipe/${result.recipeId}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.tryAgain');
      setClaimError(message);
      Alert.alert(t('recipe.shareClaimFailedTitle'), message);
      return false;
    } finally {
      claimInFlight.current = false;
      setClaiming(false);
    }
  }, [session?.user, token, t]);

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
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary }}>{t('recipe.shareLoading')}</Text>
        </View>
      </Screen>
    );
  }

  if (loadError || !recipe) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-base" style={{ color: colors.text }}>
            {loadError ?? t('recipe.shareNotFound')}
          </Text>
          <Pressable
            trackId="shared_recipe.go_home"
            onPress={() => router.dismissTo('/')}
            accessibilityRole="button"
            className="rounded-full px-5 py-3 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="font-semibold" style={{ color: colors.onPrimary }}>
              {t('recipe.goToLibrary')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (claiming) {
    return (
      <Screen edges={['bottom']}>
        <View
          className="flex-1 items-center justify-center gap-3 px-6"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary }}>{t('recipe.shareClaiming')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <RecipeView
        recipe={recipe}
        footer={
          <View className="mt-2 gap-2 pb-4">
            <View accessibilityLiveRegion="polite">
              {claimError ? (
                <Text className="text-center text-sm" style={{ color: colors.textSecondary }}>
                  {claimError}
                </Text>
              ) : null}
            </View>
            <Pressable
              trackId="shared_recipe.save"
              onPress={() => {
                void saveToLibrary();
              }}
              disabled={claiming}
              accessibilityRole="button"
              accessibilityLabel={session?.user ? t('recipe.shareSave') : t('recipe.shareSignInToSave')}
              accessibilityState={{ disabled: claiming, busy: claiming }}
              className="items-center rounded-full px-5 py-3.5 active:opacity-80"
              style={{
                backgroundColor: colors.primary,
                opacity: claiming ? 0.7 : 1,
              }}
            >
              {claiming ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text className="text-base font-semibold" style={{ color: colors.onPrimary }}>
                  {session?.user ? t('recipe.shareSave') : t('recipe.shareSignInToSave')}
                </Text>
              )}
            </Pressable>
            <Text className="text-center text-sm" style={{ color: colors.textSecondary }}>
              {t('recipe.shareSaveHint')}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
