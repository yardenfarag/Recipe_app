import Ionicons from '@expo/vector-icons/Ionicons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { findExistingGuestRecipe } from '@/lib/findExistingRecipe';
import {
  getGuestExtractionsRemaining,
  GUEST_EXTRACTION_LIMIT,
  setGuestExtractionsRemaining,
} from '@/lib/guestExtractionUsage';
import { normalizeSocialUrl } from '@/lib/platformUrls';
import { setRecipeDraft } from '@/lib/recipeDraft';
import { extractRecipe } from '@/lib/supabase/extractRecipe';
import { TOKEN_COST_EXTRACT } from '@/lib/tokens';

type Banner = { kind: 'error' | 'info' | 'limit' | 'tokens'; message: string } | null;

const EXTRACT_STATUS_LINES = [
  'Reading the video…',
  'Pulling out ingredients…',
  'Almost ready…',
] as const;

// Share → Pinch needs native share-intent code (ADR 010); Expo Go can't receive it.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function AddRecipeScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [guestExtractsRemaining, setGuestExtractsRemaining] = useState<number | null>(null);
  const [notifying, setNotifying] = useState(false);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const {
    tokenBalance,
    tokenPackNotifyAt,
    refresh: refreshProfile,
    requestPackNotify,
  } = useProfile();
  const { colors } = useThemePreference();

  useEffect(() => {
    let active = true;
    if (user) {
      setGuestExtractsRemaining(null);
      return;
    }
    getGuestExtractionsRemaining().then((remaining) => {
      if (active) setGuestExtractsRemaining(remaining);
    });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!loading) {
      setStatusIndex(0);
      return;
    }
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % EXTRACT_STATUS_LINES.length);
    }, 2800);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!hasShareIntent) return;

    const sharedUrl = normalizeSocialUrl(shareIntent.webUrl ?? shareIntent.text ?? '');
    resetShareIntent();
    if (sharedUrl) {
      setUrl(sharedUrl);
      handleGetRecipe(sharedUrl);
    } else {
      setBanner({
        kind: 'error',
        message: 'That share did not include a valid YouTube, Instagram, or TikTok link.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  async function handleNotifyPacks() {
    if (!user || tokenPackNotifyAt || notifying) return;
    setNotifying(true);
    try {
      await requestPackNotify();
      Alert.alert('You’re on the list', 'We’ll email you when token packs are live.');
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setNotifying(false);
    }
  }

  async function handleGetRecipe(overrideUrl?: string) {
    if (loading) return;
    const target = normalizeSocialUrl(overrideUrl ?? url);
    if (!target) {
      setBanner({
        kind: 'error',
        message: 'Enter a valid YouTube, Instagram, or TikTok video link.',
      });
      return;
    }

    setBanner(null);
    setUrl(target);
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

        const remaining = await getGuestExtractionsRemaining();
        setGuestExtractsRemaining(remaining);
        if (remaining <= 0) {
          setBanner({
            kind: 'limit',
            message: `You've used your ${GUEST_EXTRACTION_LIMIT} free recipe extractions. Sign up to keep going.`,
          });
          return;
        }
      } else if (tokenBalance != null && tokenBalance < TOKEN_COST_EXTRACT) {
        setBanner({
          kind: 'tokens',
          message: `You need ${TOKEN_COST_EXTRACT} tokens to extract (you have ${tokenBalance}). Token packs are coming soon.`,
        });
        return;
      }

      const result = await extractRecipe(target);

      if (typeof result.guest_extracts_remaining === 'number') {
        await setGuestExtractionsRemaining(result.guest_extracts_remaining);
        setGuestExtractsRemaining(result.guest_extracts_remaining);
      }
      if (user && typeof result.token_balance === 'number') {
        await refreshProfile();
      }

      if (result.code === 'insufficient_tokens') {
        setBanner({
          kind: 'tokens',
          message:
            result.message ??
            `You need ${TOKEN_COST_EXTRACT} tokens to extract a recipe.`,
        });
        return;
      }

      if (result.code === 'guest_limit') {
        await setGuestExtractionsRemaining(0);
        setGuestExtractsRemaining(0);
        setBanner({
          kind: 'limit',
          message:
            result.message ??
            `You've used your ${GUEST_EXTRACTION_LIMIT} free recipe extractions. Sign up to keep going.`,
        });
        return;
      }

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
    <Screen dense tabScreen>
      <View className="flex-1 px-6 pt-1">
        <BrandHeader
          title="Snap a recipe"
          subtitle="Paste a YouTube, Instagram, or TikTok link"
        />

        <View
          className="mb-5 mt-6 rounded-[28px] p-5"
          style={{
            backgroundColor: colors.frosted,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
          }}
        >
          <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
            Recipe URL
          </Text>
          {!user && guestExtractsRemaining !== null && (
            <Text className="mb-2 text-xs font-medium" style={{ color: colors.accent }}>
              {guestExtractsRemaining}/{GUEST_EXTRACTION_LIMIT} free extraction
              {guestExtractsRemaining === 1 ? '' : 's'} left
            </Text>
          )}
          {user && tokenBalance != null && (
            <Text className="mb-2 text-xs font-medium" style={{ color: colors.accent }}>
              {tokenBalance} tokens · extract costs {TOKEN_COST_EXTRACT}
            </Text>
          )}
          <View
            className="mb-4 flex-row items-center rounded-[18px] px-3.5"
            style={{ backgroundColor: colors.background }}
          >
            <Ionicons name="link-outline" size={18} color={colors.textSecondary} />
            <TextInput
              className="flex-1 px-3 py-4 text-base"
              style={{ color: colors.text }}
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
              className="mb-4 rounded-[18px] px-4 py-3"
              style={{
                backgroundColor:
                  banner.kind === 'error' ? colors.dangerSoft : colors.primarySoft,
              }}
            >
              <Text
                className="text-sm leading-5"
                style={{
                  color: banner.kind === 'error' ? colors.danger : colors.primary,
                }}
              >
                {banner.message}
              </Text>
              {banner.kind === 'limit' && (
                <Pressable
                  className="mt-3 self-start rounded-[18px] px-4 py-2"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => router.push('/auth?mode=signup&reason=extract_limit')}
                >
                  <Text className="text-sm font-bold text-white">Sign up</Text>
                </Pressable>
              )}
              {banner.kind === 'tokens' && (
                <View className="mt-3">
                  {tokenPackNotifyAt ? (
                    <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                      You’re on the list — we’ll email you when packs are live.
                    </Text>
                  ) : (
                    <Pressable
                      className="self-start rounded-[18px] px-4 py-2"
                      style={{ backgroundColor: colors.primary }}
                      onPress={() => void handleNotifyPacks()}
                      disabled={notifying}
                    >
                      {notifying ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-sm font-bold text-white">Notify me</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}

          <Pressable
            className="items-center rounded-[22px] py-4"
            style={{
              backgroundColor: colors.primary,
              opacity: canSubmit ? 1 : 0.4,
            }}
            onPress={() => handleGetRecipe()}
            disabled={!canSubmit}
          >
            {loading ? (
              <View className="items-center gap-2">
                <ActivityIndicator color="#fff" />
                <Text className="text-sm font-medium text-white">
                  {EXTRACT_STATUS_LINES[statusIndex]}
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles-outline" size={18} color="#fff" />
                <Text className="text-lg font-bold text-white">Snap</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View
          className="rounded-[28px] p-4"
          style={{ backgroundColor: colors.accentSoft }}
        >
          <View className="mb-1.5 flex-row items-center gap-2">
            <Ionicons name="share-outline" size={16} color={colors.accent} />
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              Share into Pinch
            </Text>
          </View>
          <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
            {isExpoGo
              ? 'Share → Pinch isn’t available in Expo Go — it needs a development or production build. Paste a link above for now.'
              : 'In YouTube, Instagram, or TikTok, tap Share → Pinch. The link opens here and Snap runs automatically.'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
