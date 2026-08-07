import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  claimRecipeShare,
  getRecipeShare,
  type RecipeSharePreview,
} from '@/lib/supabase/recipeShare';

export default function SharedRecipeScreen() {
  const { t } = useTranslation();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const { session, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();

  const [recipe, setRecipe] = useState<RecipeSharePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  const autoClaimAttempted = useRef(false);

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
      router.push({
        pathname: '/auth',
        params: { mode: 'signup', reason: 'shared_recipe' },
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

  // Signed-in recipients (including after auth) get the recipe copied automatically.
  useEffect(() => {
    if (authLoading || loading || !recipe || !session?.user || autoClaimAttempted.current) {
      return;
    }
    autoClaimAttempted.current = true;
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
            onPress={() => router.replace('/')}
            className="rounded-full px-5 py-3 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="font-semibold text-white">{t('recipe.goToLibrary')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (session?.user && !claimError) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-3 px-6">
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
            {claimError ? (
              <Text className="text-center text-sm" style={{ color: colors.textSecondary }}>
                {claimError}
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                void saveToLibrary();
              }}
              disabled={claiming}
              className="items-center rounded-full px-5 py-3.5 active:opacity-80"
              style={{
                backgroundColor: colors.primary,
                opacity: claiming ? 0.7 : 1,
              }}
            >
              {claiming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-semibold text-white">
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
