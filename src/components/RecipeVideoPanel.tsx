import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { RecipeImage } from '@/components/RecipeImage';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  buildYouTubeSeekScript,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  recipeVideoEmbedHtml,
} from '@/lib/recipeVideo';
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
 * Cook-along video: inline YouTube player, or a cozy “watch original” card for
 * Instagram/TikTok (those platforms block reliable in-app streaming).
 */
export const RecipeVideoPanel = forwardRef<RecipeVideoPanelHandle, RecipeVideoPanelProps>(
  function RecipeVideoPanel({ originalUrl, platform, posterUri }, ref) {
    const { colors } = useThemePreference();
    const [expanded, setExpanded] = useState(true);
    const webRef = useRef<WebView>(null);

    const video = useMemo(
      () => getRecipeVideoInfo(originalUrl, platform),
      [originalUrl, platform],
    );

    const playerHeight = useMemo(() => {
      const width = Dimensions.get('window').width - 40;
      return Math.round((width * 9) / 16);
    }, []);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        setExpanded(true);
        if (video.mode === 'embed') {
          webRef.current?.injectJavaScript(buildYouTubeSeekScript(seconds));
        }
      },
      expand() {
        setExpanded(true);
      },
    }));

    if (video.mode === 'none') return null;

    const platformLabel = getRecipePlatformLabel(video.platform);
    const icon = PLATFORM_ICON[video.platform] ?? 'play-circle-outline';

    async function openOriginal() {
      try {
        await WebBrowser.openBrowserAsync(video.url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          enableBarCollapsing: true,
        });
      } catch {
        // User dismissed or the platform blocked the browser — non-fatal.
      }
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
                {video.mode === 'embed'
                  ? `${platformLabel} · tap step times to jump`
                  : `${platformLabel} · opens original`}
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
          video.mode === 'embed' && video.embedUrl ? (
            <View style={{ height: playerHeight, backgroundColor: '#000' }}>
              <WebView
                ref={webRef}
                source={{ html: recipeVideoEmbedHtml(video.embedUrl) }}
                allowsFullscreenVideo
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                scrollEnabled={false}
                setSupportMultipleWindows={false}
                originWhitelist={['*']}
              />
            </View>
          ) : (
            <Pressable onPress={() => void openOriginal()} className="active:opacity-90">
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
                    Watch on {platformLabel}
                  </Text>
                  <Text className="text-xs leading-4" style={{ color: colors.textSecondary }}>
                    Full-screen in your browser — swipe back to Pinch when you&apos;re done.
                  </Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
              </View>
            </Pressable>
          )
        ) : null}
      </View>
    );
  },
);
