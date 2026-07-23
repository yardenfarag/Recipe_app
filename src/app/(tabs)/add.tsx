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
import {
  FREE_EXTRACT_LIMIT,
  PLUS_MONTHLY_EXTRACT_LIMIT,
  PLUS_PRICE_DISPLAY,
  PLUS_PRICE_NOTE,
} from '@/lib/quotas';
import { setRecipeDraft } from '@/lib/recipeDraft';
import { extractRecipe } from '@/lib/supabase/extractRecipe';

type Banner =
  | { kind: 'error' | 'info' | 'limit' | 'subscription' | 'monthly'; message: string }
  | null;

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
  const [upgrading, setUpgrading] = useState(false);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const {
    subscriptionActive,
    extractsRemaining,
    freeExtractsRemaining,
    monthlyExtractsRemaining,
    refresh: refreshProfile,
    upgradeToPlus,
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

  async function handleUpgrade() {
    if (!user || upgrading) return;
    setUpgrading(true);
    try {
      await upgradeToPlus();
      setBanner(null);
      Alert.alert('Pinch Plus', 'You’re on Plus. Billing isn’t live yet — enjoy the higher limit.');
    } catch (err) {
      Alert.alert(
        'Could not upgrade',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setUpgrading(false);
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
      } else if (
        !subscriptionActive &&
        freeExtractsRemaining != null &&
        freeExtractsRemaining <= 0
      ) {
        setBanner({
          kind: 'subscription',
          message: `You've used your ${FREE_EXTRACT_LIMIT} free recipe saves. Upgrade to Pinch Plus to keep going.`,
        });
        return;
      } else if (
        subscriptionActive &&
        monthlyExtractsRemaining != null &&
        monthlyExtractsRemaining <= 0
      ) {
        setBanner({
          kind: 'monthly',
          message: `You've reached your Pinch Plus limit of ${PLUS_MONTHLY_EXTRACT_LIMIT} saves this month.`,
        });
        return;
      }

      const result = await extractRecipe(target);

      if (typeof result.guest_extracts_remaining === 'number') {
        await setGuestExtractionsRemaining(result.guest_extracts_remaining);
        setGuestExtractsRemaining(result.guest_extracts_remaining);
      }
      if (user) {
        await refreshProfile();
      }

      if (result.code === 'subscription_required' || result.code === 'insufficient_tokens') {
        setBanner({
          kind: 'subscription',
          message:
            result.message ??
            `You've used your ${FREE_EXTRACT_LIMIT} free recipe saves. Upgrade to Pinch Plus to keep going.`,
        });
        return;
      }

      if (result.code === 'monthly_limit') {
        setBanner({
          kind: 'monthly',
          message:
            result.message ??
            `You've reached your Pinch Plus limit of ${PLUS_MONTHLY_EXTRACT_LIMIT} saves this month.`,
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

      if (result.code === 'video_too_long') {
        setBanner({
          kind: 'error',
          message:
            result.message ??
            'This video is too long to analyze. Try a clip under 3 minutes, or one with the recipe in the caption.',
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

  const signedInQuotaLabel = (() => {
    if (!user || extractsRemaining == null) return null;
    if (subscriptionActive) {
      return `${extractsRemaining}/${PLUS_MONTHLY_EXTRACT_LIMIT} Plus saves left this month`;
    }
    return `${extractsRemaining}/${FREE_EXTRACT_LIMIT} free saves left`;
  })();

  return (
    <Screen dense tabScreen>
      <View className="flex-1 px-6 pt-1">
        <BrandHeader
          title="Snap a recipe"
          subtitle="Paste a YouTube, Instagram, or TikTok link (up to 3 min)"
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
          {signedInQuotaLabel ? (
            <Text className="mb-2 text-xs font-medium" style={{ color: colors.accent }}>
              {signedInQuotaLabel}
            </Text>
          ) : null}
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
              {banner.kind === 'subscription' && (
                <View className="mt-3">
                  <Text className="mb-2 text-xs" style={{ color: colors.textSecondary }}>
                    Pinch Plus {PLUS_PRICE_DISPLAY}. {PLUS_PRICE_NOTE}
                  </Text>
                  <Pressable
                    className="self-start rounded-[18px] px-4 py-2"
                    style={{ backgroundColor: colors.primary }}
                    onPress={() => void handleUpgrade()}
                    disabled={upgrading}
                  >
                    {upgrading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-sm font-bold text-white">Upgrade to Plus</Text>
                    )}
                  </Pressable>
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
