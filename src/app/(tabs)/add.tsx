import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import { findExistingGuestRecipe } from '@/lib/findExistingRecipe';
import { setRecipeDraft } from '@/lib/recipeDraft';
import { extractRecipe } from '@/lib/supabase/extractRecipe';

type Banner = { kind: 'error' | 'info'; message: string } | null;

export default function AddRecipeScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const { colors } = useThemePreference();

  useEffect(() => {
    if (!hasShareIntent) return;

    const sharedUrl = shareIntent.webUrl ?? shareIntent.text;
    resetShareIntent();
    if (sharedUrl) {
      setUrl(sharedUrl);
      handleGetRecipe(sharedUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  async function handleGetRecipe(overrideUrl?: string) {
    const target = (overrideUrl ?? url).trim();
    if (!target) return;

    setBanner(null);
    setLoading(true);

    try {
      // Guests: check local library. Signed-in users: extract-recipe handles duplicates server-side.
      if (!user) {
        const existing = await findExistingGuestRecipe(target);
        if (existing) {
          router.push(`/recipe/${existing.id}`);
          setUrl('');
          return;
        }
      }

      const result = await extractRecipe(target);

      if (result.cached && result.recipe && 'id' in result.recipe) {
        router.push(`/recipe/${result.recipe.id}`);
        setUrl('');
        return;
      }

      if (result.status === 'coming_soon') {
        setBanner({ kind: 'info', message: result.message ?? 'That platform is coming soon.' });
        return;
      }

      if (result.status === 'failed' || !result.recipe) {
        setBanner({
          kind: 'error',
          message: result.message ?? "Couldn't find a recipe in this video. Try a different link.",
        });
        return;
      }

      setRecipeDraft(result.recipe);
      router.push('/recipe/preview');
      setUrl('');
    } catch {
      setBanner({ kind: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(url.trim()) && !loading;

  return (
    <Screen>
      <View className="flex-1 px-6 pt-3">
        <View className="mb-6">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-widest text-pinch-rose dark:text-pinch-rose-dark">
            New recipe
          </Text>
          <Text className="text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
            Snap a recipe
          </Text>
          <Text className="mt-1.5 text-sm leading-5 text-pinch-muted dark:text-pinch-muted-dark">
            Paste a YouTube, Instagram, or TikTok link
          </Text>
        </View>

        <View className="mb-5 rounded-3xl border border-pinch-border bg-pinch-surface p-5 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
          <Text className="mb-2 text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
            Recipe URL
          </Text>
          <View className="mb-4 flex-row items-center rounded-2xl bg-pinch-bg px-3.5 dark:bg-pinch-bg-dark">
            <Ionicons name="link-outline" size={18} color={colors.textSecondary} />
            <TextInput
              className="flex-1 px-3 py-4 text-base text-pinch-dark dark:text-pinch-text-dark"
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={colors.textSecondary}
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                if (banner) setBanner(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!loading}
            />
          </View>

          {banner && (
            <View
              className={`mb-4 rounded-2xl border px-4 py-3 ${
                banner.kind === 'error'
                  ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-[#3A2424]'
                  : 'border-pinch-primary-soft bg-pinch-primary-soft dark:border-pinch-primary-soft-dark dark:bg-pinch-primary-soft-dark'
              }`}
            >
              <Text
                className={`text-sm leading-5 ${
                  banner.kind === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-pinch-primary dark:text-pinch-primary-dark'
                }`}
              >
                {banner.message}
              </Text>
            </View>
          )}

          <Pressable
            className={`items-center rounded-full py-4 ${
              canSubmit
                ? 'bg-pinch-primary dark:bg-pinch-primary-dark'
                : 'bg-[#D9CFD3] dark:bg-[#3A3034]'
            }`}
            onPress={() => handleGetRecipe()}
            disabled={!canSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="restaurant-outline" size={18} color="#fff" />
                <Text className="text-lg font-bold text-white">Get Recipe</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View className="rounded-3xl border border-pinch-rose-soft bg-pinch-rose-soft p-4 dark:border-pinch-rose-soft-dark dark:bg-pinch-rose-soft-dark">
          <View className="mb-1.5 flex-row items-center gap-2">
            <Ionicons name="share-outline" size={16} color={colors.accent} />
            <Text className="text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
              Share Sheet
            </Text>
          </View>
          <Text className="text-xs leading-5 text-pinch-muted dark:text-pinch-muted-dark">
            In a development build, share a YouTube, Instagram, or TikTok link into Pinch from another
            app — it lands here and runs Get Recipe automatically. This does not work in Expo Go.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
