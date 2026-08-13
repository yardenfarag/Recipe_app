import Ionicons from '@expo/vector-icons/Ionicons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { Screen } from '@/components/Screen';
import { SnapExtractingView } from '@/components/SnapExtractingView';
import { TokenPurchaseSheet } from '@/components/TokenPurchaseSheet';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { confirmAction } from '@/lib/confirmAction';
import { findExistingGuestRecipe } from '@/lib/findExistingRecipe';
import {
  getGuestExtractionsRemaining,
  GUEST_EXTRACTION_LIMIT,
  setGuestExtractionsRemaining,
} from '@/lib/guestExtractionUsage';
import { detectPlatform, normalizeSocialUrl } from '@/lib/platformUrls';
import { FREE_MONTHLY_EXTRACT_LIMIT } from '@/lib/quotas';
import { setRecipeDraft } from '@/lib/recipeDraft';
import { extractRecipe } from '@/lib/supabase/extractRecipe';

type Banner =
  | { kind: 'error' | 'info' | 'limit' | 'credits'; message: string }
  | null;

// Share → Pinch needs native share-intent code (ADR 010); Expo Go can't receive it.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function AddRecipeScreen() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [guestExtractsRemaining, setGuestExtractsRemaining] = useState<number | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const {
    freeExtractsRemaining,
    purchasedCredits,
    totalCredits,
    refresh: refreshProfile,
  } = useProfile();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();

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
      setStatusIndex((i) => (i + 1) % 3);
    }, 2800);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!hasShareIntent) return;

    // Wait until the payload is present — on Android hasShareIntent can flip
    // true a tick before webUrl/text are hydrated; resetting early drops the share.
    const raw = shareIntent.webUrl ?? shareIntent.text ?? '';
    if (!raw.trim()) return;

    const sharedUrl = normalizeSocialUrl(raw);
    resetShareIntent();
    if (sharedUrl) {
      setUrl(sharedUrl);
      void handleGetRecipe(sharedUrl);
    } else {
      setBanner({
        kind: 'error',
        message: t('snap.invalidShare'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, shareIntent.webUrl, shareIntent.text]);

  async function promptGuestExtractLimit() {
    const title = t('snap.guestLimitTitle');
    const message = t('snap.guestLimitBody', {
      limit: GUEST_EXTRACTION_LIMIT,
      freeLimit: FREE_MONTHLY_EXTRACT_LIMIT,
    });
    setBanner({ kind: 'limit', message });

    if (Platform.OS === 'web') {
      const signUp = await confirmAction(title, message, t('auth.signUp'), t('common.notNow'));
      if (signUp) router.push('/auth?mode=signup&reason=extract_limit');
      return;
    }

    Alert.alert(title, message, [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('auth.signUp'),
        onPress: () => router.push('/auth?mode=signup&reason=extract_limit'),
      },
    ]);
  }

  function promptCreditLimit() {
    setBanner({
      kind: 'credits',
      message: t('snap.creditLimitBody', { limit: FREE_MONTHLY_EXTRACT_LIMIT }),
    });
  }

  async function handleGetRecipe(overrideUrl?: string) {
    if (loading) return;
    const target = normalizeSocialUrl(overrideUrl ?? url);
    if (!target) {
      setBanner({
        kind: 'error',
        message: t('snap.invalidUrl'),
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
          await promptGuestExtractLimit();
          return;
        }
      }

      const result = await extractRecipe(target);

      if (typeof result.guest_extracts_remaining === 'number') {
        await setGuestExtractionsRemaining(result.guest_extracts_remaining);
        setGuestExtractsRemaining(result.guest_extracts_remaining);
      }
      if (user) {
        await refreshProfile();
      }

      if (
        result.code === 'insufficient_credits' ||
        result.code === 'subscription_required' ||
        result.code === 'insufficient_tokens'
      ) {
        promptCreditLimit();
        return;
      }

      if (result.code === 'guest_limit') {
        await setGuestExtractionsRemaining(0);
        setGuestExtractsRemaining(0);
        await promptGuestExtractLimit();
        return;
      }

      if (result.code === 'video_too_long') {
        setBanner({
          kind: 'error',
          message: result.message ?? t('snap.videoTooLong'),
        });
        return;
      }

      if (result.cached && result.recipe && 'id' in result.recipe) {
        router.push(`/recipe/${result.recipe.id}`);
        setUrl('');
        return;
      }

      if (result.status === 'coming_soon') {
        setBanner({ kind: 'info', message: result.message ?? t('snap.comingSoon') });
        return;
      }

      if (result.status === 'failed' || !result.recipe) {
        setBanner({
          kind: 'error',
          message: result.message ?? t('snap.notFound'),
        });
        return;
      }

      setRecipeDraft(result.recipe);
      router.push('/recipe/preview');
      setUrl('');
    } catch {
      setBanner({ kind: 'error', message: t('snap.genericError') });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(url.trim());
  const statusLines =
    detectPlatform(url) === 'web'
      ? ([
          t('snap.statusReadingPage'),
          t('snap.statusIngredients'),
          t('snap.statusAlmost'),
        ] as const)
      : ([
          t('snap.statusReadingVideo'),
          t('snap.statusIngredients'),
          t('snap.statusAlmost'),
        ] as const);

  const signedInQuotaLabel = (() => {
    if (!user || totalCredits == null) return null;
    return t('snap.creditsRemaining', {
      total: totalCredits,
      free: freeExtractsRemaining ?? 0,
      purchased: purchasedCredits ?? 0,
    });
  })();

  const guestQuotaLabel =
    guestExtractsRemaining === 1
      ? t('snap.guestRemainingOne', {
          remaining: guestExtractsRemaining,
          limit: GUEST_EXTRACTION_LIMIT,
        })
      : t('snap.guestRemaining', {
          remaining: guestExtractsRemaining ?? 0,
          limit: GUEST_EXTRACTION_LIMIT,
        });

  if (loading) {
    return (
      <Screen dense tabScreen>
        <SnapExtractingView statusLines={statusLines} statusIndex={statusIndex} />
      </Screen>
    );
  }

  return (
    <Screen dense tabScreen>
      <View
        className="flex-1 px-6 pt-1"
        style={
          isMediumUp
            ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' }
            : undefined
        }
      >
        <BrandHeader
          title={t('snap.title')}
          subtitle={t('snap.subtitle')}
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
            {t('snap.urlLabel')}
          </Text>
          {!user && guestExtractsRemaining !== null && (
            <Text className="mb-2 text-xs font-medium" style={{ color: colors.accent }}>
              {guestQuotaLabel}
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
              placeholder={t('snap.urlPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                if (banner) setBanner(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
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
                  <Text className="text-sm font-bold text-white">{t('auth.signUp')}</Text>
                </Pressable>
              )}
              {banner.kind === 'credits' && (
                <Pressable
                  className="mt-3 self-start rounded-[18px] px-4 py-2"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => setCreditsOpen(true)}
                >
                  <Text className="text-sm font-bold text-white">{t('credits.buyAction')}</Text>
                </Pressable>
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
            <View className="flex-row items-center gap-2">
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
              <Text className="text-lg font-bold text-white">{t('tabs.snap')}</Text>
            </View>
          </Pressable>
        </View>

        <View
          className="rounded-[28px] p-4"
          style={{ backgroundColor: colors.accentSoft }}
        >
          <View className="mb-1.5 flex-row items-center gap-2">
            <Ionicons name="share-outline" size={16} color={colors.accent} />
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              {t('snap.shareTitle')}
            </Text>
          </View>
          <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
            {isExpoGo ? t('snap.shareBodyExpoGo') : t('snap.shareBody')}
          </Text>
        </View>
        <TokenPurchaseSheet visible={creditsOpen} onClose={() => setCreditsOpen(false)} />
      </View>
    </Screen>
  );
}
