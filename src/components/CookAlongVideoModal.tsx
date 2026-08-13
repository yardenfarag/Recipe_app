import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { createElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  buildRecipeVideoWebViewSource,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  recipeVideoUrlAtSeconds,
  VIDEO_WEBVIEW_USER_AGENT,
} from '@/lib/recipeVideo';
import type { Platform as RecipePlatform } from '@/types/recipe';

type HeightPreset = 'compact' | 'medium' | 'tall';

const HEIGHT_PRESET: Record<HeightPreset, number> = {
  compact: 0.34,
  medium: 0.48,
  tall: 0.66,
};

/** Reels / TikTok — portrait player. YouTube stays landscape. */
function isPortraitSocialVideo(platform: RecipePlatform): boolean {
  return platform === 'instagram' || platform === 'tiktok';
}

/** Chrome around the iframe (title row + open-in-browser link). */
const WEB_DIALOG_CHROME = 112;
const WEB_DIALOG_INSET = 12;

type CookAlongVideoModalProps = {
  visible: boolean;
  onClose: () => void;
  originalUrl: string;
  platform?: RecipePlatform | null;
  sourceVideoUrl?: string | null;
  startSeconds?: number;
  /** Lets the recipe ScrollView pad so content can scroll above the sheet. */
  onSheetHeightChange?: (height: number) => void;
  /**
   * `sheet` — bottom sheet (native) / centered dialog (web).
   * `sidebar` — fills parent column (wide web recipe layout).
   */
  placement?: 'sheet' | 'sidebar';
};

/**
 * In-app cook-along player.
 * Sheet: bottom sheet on native, dialog on narrow web.
 * Sidebar: docked column for wide web recipe pages.
 */
export function CookAlongVideoModal({
  visible,
  onClose,
  originalUrl,
  platform,
  sourceVideoUrl,
  startSeconds = 0,
  onSheetHeightChange,
  placement = 'sheet',
}: CookAlongVideoModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { isWide } = useBreakpoint();
  const [heightPreset, setHeightPreset] = useState<HeightPreset>('medium');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const isWeb = Platform.OS === 'web';
  const isSidebar = placement === 'sidebar';

  const video = useMemo(
    () => getRecipeVideoInfo(originalUrl, platform, sourceVideoUrl),
    [originalUrl, platform, sourceVideoUrl],
  );
  const webSource = useMemo(
    () => buildRecipeVideoWebViewSource(video, startSeconds),
    [video, startSeconds],
  );
  const platformLabel =
    video.platform === 'web'
      ? t('cookAlong.website')
      : video.platform === 'unknown'
        ? t('cookAlong.video')
        : getRecipePlatformLabel(video.platform);
  const isPortraitVideo = isPortraitSocialVideo(video.platform);
  const sheetHeight = Math.round(
    windowHeight *
      (isWeb && isWide
        ? Math.min(HEIGHT_PRESET[heightPreset] + 0.12, 0.78)
        : HEIGHT_PRESET[heightPreset]),
  );
  const totalHeight = sheetHeight + insets.bottom;
  const maxDialogW = windowWidth - WEB_DIALOG_INSET * 2;
  const maxDialogH = windowHeight - WEB_DIALOG_INSET * 2;
  const webDialogHeight = isPortraitVideo
    ? maxDialogH
    : Math.min(maxDialogH, Math.round(Math.min(maxDialogW, 960) * (9 / 16)) + WEB_DIALOG_CHROME);
  const webDialogWidth = isPortraitVideo
    ? Math.min(maxDialogW, Math.round((webDialogHeight - WEB_DIALOG_CHROME) * (9 / 16)) + 32)
    : Math.min(maxDialogW, isWide ? 960 : 800);

  useEffect(() => {
    if (!visible || isSidebar) {
      onSheetHeightChange?.(0);
      return;
    }
    onSheetHeightChange?.(isWeb ? 0 : totalHeight);
  }, [visible, totalHeight, onSheetHeightChange, isWeb, isSidebar]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setLoadError(false);
    }
  }, [visible, webSource]);

  async function openInBrowser() {
    const playUrl = video.url || originalUrl;
    const url =
      startSeconds > 0
        ? recipeVideoUrlAtSeconds(playUrl, video.platform, startSeconds)
        : playUrl;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        enableBarCollapsing: true,
      });
    } catch {
      // User dismissed — fine.
    }
  }

  if (!visible || !webSource) return null;

  const webViewKey =
    webSource.type === 'uri'
      ? `${webSource.uri}-${startSeconds}`
      : `html-${video.platform}-${startSeconds}-${originalUrl}`;

  const videoPlayer = loadError ? (
    <View className="flex-1 items-center justify-center px-6">
      <Ionicons name="alert-circle-outline" size={36} color="#fff" />
      <Text className="mt-3 text-center text-sm leading-5 text-white/90">
        {t('cookAlong.loadFailed')}
      </Text>
      <Pressable
        onPress={() => void openInBrowser()}
        className="mt-4 rounded-full px-5 py-2.5 active:opacity-80"
        style={{ backgroundColor: colors.primary }}
      >
        <Text className="text-sm font-bold text-white">{t('cookAlong.openInBrowser')}</Text>
      </Pressable>
    </View>
  ) : (
    <>
      {loading ? (
        <View className="absolute inset-0 z-10 items-center justify-center bg-black">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
      {isWeb ? (
        webSource.type === 'uri' ? (
          createElement('iframe', {
            key: webViewKey,
            src: webSource.uri,
            title: t('cookAlong.iframeTitle'),
            allow:
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            allowFullScreen: true,
            style: {
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#000',
            },
            onLoad: () => setLoading(false),
            onError: () => {
              setLoading(false);
              setLoadError(true);
            },
          })
        ) : (
          createElement('iframe', {
            key: webViewKey,
            srcDoc: webSource.html,
            title: t('cookAlong.iframeTitle'),
            allow:
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            allowFullScreen: true,
            style: {
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#000',
            },
            onLoad: () => setLoading(false),
          })
        )
      ) : (
        <WebView
          key={webViewKey}
          source={
            webSource.type === 'uri'
              ? { uri: webSource.uri, headers: webSource.headers }
              : { html: webSource.html, baseUrl: webSource.baseUrl }
          }
          userAgent={video.platform === 'youtube' ? undefined : VIDEO_WEBVIEW_USER_AGENT}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
          originWhitelist={['*']}
          nestedScrollEnabled
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setLoadError(true);
          }}
          style={{ flex: 1, backgroundColor: '#000' }}
        />
      )}
    </>
  );

  const chrome = (
    <>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <View className="flex-1" style={{ paddingEnd: 12 }}>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            {t('cookAlong.title')}
          </Text>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {platformLabel}
            {startSeconds > 0 ? ` · ${t('cookAlong.fromTime', { time: formatClock(startSeconds) })}` : ''}
            {isWeb ? '' : ` · ${t('cookAlong.scrollRecipe')}`}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: colors.frosted }}
          accessibilityLabel={t('cookAlong.close')}
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      {!isWeb && (
        <View className="mb-2 flex-row gap-2 px-4">
          {(['compact', 'medium', 'tall'] as HeightPreset[]).map((preset) => {
            const active = heightPreset === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => setHeightPreset(preset)}
                className="flex-1 items-center rounded-full py-1.5 active:opacity-80"
                style={{
                  backgroundColor: active ? colors.primary : colors.frosted,
                }}
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: active ? '#fff' : colors.textSecondary }}
                >
                  {t(
                    preset === 'compact'
                      ? 'cookAlong.heightCompact'
                      : preset === 'medium'
                        ? 'cookAlong.heightMedium'
                        : 'cookAlong.heightTall',
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View
        className="mx-4 overflow-hidden rounded-2xl bg-black"
        style={{
          flex: 1,
          minHeight: isSidebar || isWeb ? 0 : undefined,
        }}
      >
        {videoPlayer}
      </View>

      <Pressable
        onPress={() => void openInBrowser()}
        className="mx-4 mt-2 mb-3 flex-row items-center justify-center gap-1.5 py-2 active:opacity-70"
      >
        <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
        <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
          {t('cookAlong.openInBrowserHint')}
        </Text>
      </Pressable>
    </>
  );

  if (isSidebar) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.frostedBorder,
          overflow: 'hidden',
        }}
      >
        {chrome}
      </View>
    );
  }

  if (isWeb) {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 50,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)',
          padding: WEB_DIALOG_INSET,
        }}
      >
        <Pressable
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
          onPress={onClose}
          accessibilityLabel={t('cookAlong.dismiss')}
        />
        <View
          pointerEvents="auto"
          style={{
            width: webDialogWidth,
            height: webDialogHeight,
            maxHeight: webDialogHeight,
            backgroundColor: colors.background,
            borderRadius: 24,
            paddingBottom: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.2,
            shadowRadius: 24,
          }}
        >
          {chrome}
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'flex-end',
        zIndex: 50,
      }}
    >
      <View style={{ flex: 1 }} pointerEvents="none" />

      <View
        pointerEvents="auto"
        style={{
          height: totalHeight,
          paddingBottom: insets.bottom,
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 16,
        }}
      >
        {chrome}
      </View>
    </View>
  );
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
