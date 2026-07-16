import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractRecipe } from '@/lib/supabase/extractRecipe';

type Banner = { kind: 'error' | 'info'; message: string } | null;

export default function AddRecipeScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;

    const sharedUrl = shareIntent.webUrl ?? shareIntent.text;
    resetShareIntent();
    if (sharedUrl) {
      setUrl(sharedUrl);
      handleForkIt(sharedUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  async function handleForkIt(overrideUrl?: string) {
    const target = (overrideUrl ?? url).trim();
    if (!target) return;

    setBanner(null);
    setLoading(true);

    try {
      const result = await extractRecipe(target);

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

      // full or partial — hand off to the preview screen (not saved yet, ADR 002/004)
      router.push({
        pathname: '/recipe/preview',
        params: { data: JSON.stringify(result.recipe) },
      });
      setUrl('');
    } catch {
      setBanner({ kind: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-pinch-cream">
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold text-pinch-dark mb-1">Snap a Recipe</Text>
        <Text className="text-sm text-gray-500 mb-8">
          Paste a link from YouTube — Instagram and TikTok are coming soon
        </Text>

        <Text className="text-sm font-medium text-pinch-dark mb-2">Recipe URL</Text>
        <TextInput
          className="bg-white border border-gray-200 rounded-xl px-4 py-4 text-base text-pinch-dark mb-6"
          placeholder="https://youtube.com/watch?v=..."
          placeholderTextColor="#9CA3AF"
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

        {banner && (
          <View
            className={`rounded-xl px-4 py-3 mb-6 border ${
              banner.kind === 'error'
                ? 'bg-red-50 border-red-100'
                : 'bg-orange-50 border-orange-100'
            }`}
          >
            <Text
              className={`text-sm ${
                banner.kind === 'error' ? 'text-red-700' : 'text-orange-700'
              }`}
            >
              {banner.message}
            </Text>
          </View>
        )}

        <Pressable
          className={`rounded-full py-4 items-center ${url.trim() ? 'bg-pinch-orange' : 'bg-gray-300'}`}
          onPress={() => handleForkIt()}
          disabled={!url.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">Fork it! 🍴</Text>
          )}
        </Pressable>

        <View className="mt-8 rounded-xl bg-orange-50 p-4 border border-orange-100">
          <Text className="text-sm text-orange-800 font-medium mb-1">Share Sheet</Text>
          <Text className="text-xs text-orange-600">
            On Android dev builds, you can share a link straight into Pinch from other apps — it
            lands here and Forks it automatically. iOS support follows once the Apple Developer
            account is set up (ADR 009/010).
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
