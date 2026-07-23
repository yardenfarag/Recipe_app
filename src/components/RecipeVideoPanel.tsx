import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CookAlongVideoModal } from '@/components/CookAlongVideoModal';
import { RecipeImage } from '@/components/RecipeImage';
import { useThemePreference } from '@/hooks/useThemePreference';
import { getRecipePlatformLabel, getRecipeVideoInfo } from '@/lib/recipeVideo';
import type { Platform } from '@/types/recipe';

type RecipeVideoPanelProps = {
  originalUrl?: string | null;
  platform?: Platform | null;
  posterUri?: string | null;
};

export type RecipeVideoPanelHandle = {
  seekTo: (seconds: number) => void;
  expand: () => void;
};

const PLATFORM_ICON: Record<Platform, keyof typeof Ionicons.glyphMap> = {
  youtube: 'logo-youtube',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  unknown: 'play-circle-outline',
};

/**
 * Cook-along entry card — opens an in-app adjustable video sheet (no app switch).
 */
export const RecipeVideoPanel = forwardRef<RecipeVideoPanelHandle, RecipeVideoPanelProps>(
  function RecipeVideoPanel({ originalUrl, platform, posterUri }, ref) {
    const { colors } = useThemePreference();
    const [expanded, setExpanded] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [startSeconds, setStartSeconds] = useState(0);

    const video = useMemo(
      () => getRecipeVideoInfo(originalUrl, platform),
      [originalUrl, platform],
    );

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        setStartSeconds(Math.max(0, Math.round(seconds)));
        setModalOpen(true);
        setExpanded(true);
      },
      expand() {
        setExpanded(true);
        setStartSeconds(0);
        setModalOpen(true);
      },
    }));

    if (video.mode === 'none' || !originalUrl) return null;

    const platformLabel = getRecipePlatformLabel(video.platform);
    const icon = PLATFORM_ICON[video.platform] ?? 'play-circle-outline';

    function openVideo(fromStart = startSeconds) {
      setStartSeconds(fromStart);
      setModalOpen(true);
    }

    return (
      <>
        <View
          className="mb-4 overflow-hidden rounded-[28px] border"
          style={{ borderColor: colors.frostedBorder, backgroundColor: colors.surface }}
        >
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            className="flex-row items-center justify-between px-4 py-3.5 active:opacity-80"
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Hide cook-along video' : 'Show cook-along video'}
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
                  Cook along
                </Text>
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
                  {platformLabel} · tap step times to jump
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
            <Pressable onPress={() => openVideo(0)} className="active:opacity-90">
              <View className="relative">
                {posterUri ? (
                  <RecipeImage uri={posterUri} variant="hero" borderRadius={0} />
                ) : (
                  <View
                    className="h-[200px] w-full items-center justify-center"
                    style={{ backgroundColor: colors.primarySoft }}
                  >
                    <Ionicons name={icon} size={48} color={colors.primary} />
                  </View>
                )}
                <View
                  className="absolute inset-0 items-center justify-center"
                  style={{ backgroundColor: colors.overlay }}
                >
                  <View
                    className="h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                  </View>
                </View>
              </View>
              <View className="flex-row items-center gap-2 px-4 py-3.5">
                <Ionicons name={icon} size={20} color={colors.primary} />
                <View className="flex-1">
                  <Text className="text-sm font-bold" style={{ color: colors.text }}>
                    Play in Pinch
                  </Text>
                  <Text className="text-xs leading-4" style={{ color: colors.textSecondary }}>
                    Adjustable popup — resize compact, medium, or tall.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            </Pressable>
          ) : null}
        </View>

        <CookAlongVideoModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          originalUrl={originalUrl}
          platform={platform}
          startSeconds={startSeconds}
        />
      </>
    );
  },
);
