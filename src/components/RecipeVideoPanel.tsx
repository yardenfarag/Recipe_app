import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeImage';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { getRecipePlatformLabel, getRecipeVideoInfo } from '@/lib/recipeVideo';
import type { Platform } from '@/types/recipe';

type RecipeVideoPanelProps = {
  originalUrl?: string | null;
  platform?: Platform | null;
  sourceVideoUrl?: string | null;
  posterUri?: string | null;
  /** Opens the cook-along sheet owned by the parent (outside ScrollView). */
  onRequestPlay: (startSeconds: number) => void;
};

export type RecipeVideoPanelHandle = {
  seekTo: (seconds: number) => void;
  expand: () => void;
};

const PLATFORM_ICON: Record<Platform, keyof typeof Ionicons.glyphMap> = {
  youtube: 'logo-youtube',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  web: 'globe-outline',
  unknown: 'play-circle-outline',
};

function PlayBadge({ size }: { size: 'sm' | 'lg' }) {
  const { colors } = useThemePreference();
  const dim = size === 'lg' ? 56 : 36;
  const icon = size === 'lg' ? 24 : 16;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: dim,
        height: dim,
        backgroundColor: colors.primary,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      <Ionicons name="play" size={icon} color="#fff" style={{ marginLeft: 2 }} />
    </View>
  );
}

/**
 * Cook-along entry card — asks the parent to open the adjustable video sheet.
 * On tablet/web this is a compact row so it never becomes a full-width dark banner.
 */
export const RecipeVideoPanel = forwardRef<RecipeVideoPanelHandle, RecipeVideoPanelProps>(
  function RecipeVideoPanel(
    { originalUrl, platform, sourceVideoUrl, posterUri, onRequestPlay },
    ref,
  ) {
    const { t } = useTranslation();
    const { chevronForward } = useRtl();
    const { colors } = useThemePreference();
    const { isMediumUp } = useBreakpoint();
    const [expanded, setExpanded] = useState(!isMediumUp);

    const video = useMemo(
      () => getRecipeVideoInfo(originalUrl, platform, sourceVideoUrl),
      [originalUrl, platform, sourceVideoUrl],
    );

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        setExpanded(true);
        onRequestPlay(Math.max(0, Math.round(seconds)));
      },
      expand() {
        setExpanded(true);
        onRequestPlay(0);
      },
    }));

    if (video.mode === 'none' || !originalUrl) return null;

    const platformLabel =
      video.platform === 'web'
        ? t('cookAlong.website')
        : video.platform === 'unknown'
          ? t('cookAlong.video')
          : getRecipePlatformLabel(video.platform);
    const icon = PLATFORM_ICON[video.platform] ?? 'play-circle-outline';

    const poster = posterUri ? (
      <RecipeImage
        uri={posterUri}
        variant="hero"
        borderRadius={isMediumUp ? 14 : 0}
        style={isMediumUp ? { width: 168, height: 94 } : { height: 180 }}
      />
    ) : (
      <View
        className="items-center justify-center"
        style={{
          backgroundColor: colors.primarySoft,
          width: isMediumUp ? 168 : '100%',
          height: isMediumUp ? 94 : 180,
          borderRadius: isMediumUp ? 14 : 0,
        }}
      >
        <Ionicons name={icon} size={isMediumUp ? 28 : 40} color={colors.primary} />
      </View>
    );

    if (isMediumUp) {
      return (
        <Pressable
          onPress={() => onRequestPlay(0)}
          className="mb-4 flex-row items-center gap-3.5 overflow-hidden rounded-[22px] border p-3 active:opacity-90"
          style={{ borderColor: colors.frostedBorder, backgroundColor: colors.surface }}
          accessibilityRole="button"
          accessibilityLabel={t('cookAlong.playInPinch')}
        >
          <View className="relative overflow-hidden rounded-[14px]">
            {poster}
            <View className="absolute inset-0 items-center justify-center">
              <PlayBadge size="sm" />
            </View>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold" style={{ color: colors.text }}>
              {t('cookAlong.title')}
            </Text>
            <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
              {platformLabel} · {t('cookAlong.jumpHint')}
            </Text>
          </View>
          <Ionicons name={chevronForward} size={18} color={colors.textSecondary} />
        </Pressable>
      );
    }

    return (
      <View
        className="mb-4 overflow-hidden rounded-[28px] border"
        style={{ borderColor: colors.frostedBorder, backgroundColor: colors.surface }}
      >
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          className="flex-row items-center justify-between px-4 py-3.5 active:opacity-80"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? t('cookAlong.hide') : t('cookAlong.show')}
        >
          <View className="flex-row items-center gap-2.5">
            <View
              className="h-9 w-9 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <Ionicons name="play" size={18} color={colors.primary} />
            </View>
            <View>
              <Text className="text-sm font-bold" style={{ color: colors.text }}>
                {t('cookAlong.title')}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                {platformLabel} · {t('cookAlong.jumpHint')}
              </Text>
            </View>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>

        {expanded ? (
          <Pressable onPress={() => onRequestPlay(0)} className="active:opacity-90">
            <View className="relative">
              {poster}
              <View className="absolute inset-0 items-center justify-center">
                <PlayBadge size="lg" />
              </View>
            </View>
            <View className="flex-row items-center gap-2 px-4 py-3.5">
              <Ionicons name={icon} size={20} color={colors.primary} />
              <View className="flex-1">
                <Text className="text-sm font-bold" style={{ color: colors.text }}>
                  {t('cookAlong.playInPinch')}
                </Text>
                <Text className="text-xs leading-4" style={{ color: colors.textSecondary }}>
                  {t('cookAlong.playHint')}
                </Text>
              </View>
              <Ionicons name={chevronForward} size={18} color={colors.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>
    );
  },
);
