import * as WebBrowser from 'expo-web-browser';
import { createElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, KitIcon, Radii, usePhotoColors } from '@/components/ui/tokens';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import {
  buildRecipeVideoWebViewSource,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  recipeVideoUrlAtSeconds,
  VIDEO_WEBVIEW_USER_AGENT,
} from '@/lib/recipeVideo';
import type { Platform as RecipePlatform } from '@shared/types/recipe';

type HeightPreset = 'compact' | 'medium' | 'tall';

const HEIGHT_PRESET: Record<HeightPreset, number> = {
  compact: 0.34,
  medium: 0.48,
  tall: 0.66,
};

/** Reels / TikTok — portrait player. YouTube stays landscape. */
function isPortraitSocialVideo(platform: RecipePlatform): boolean {
  return platform === 'instagram' || platform === 'tiktok' || platform === 'facebook';
}

/** Chrome around the iframe (title row + open-in-browser link). */
const WEB_DIALOG_CHROME = 128;
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
  // The player sits on the photo scrim: the same dark backing in light and dark mode.
  const photo = usePhotoColors();
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

  useEffect(() => {
    if (visible && loadError) announce(t('cookAlong.loadFailed'));
  }, [visible, loadError, t]);

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
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
      <KitIcon icon="alert-circle-outline" size={36} color={photo.onScrim} />
      <Text variant="bodySmall" tone="onScrim" align="center">
        {t('cookAlong.loadFailed')}
      </Text>
      <Button
        variant="primary"
        size="sm"
        icon="open-outline"
        trackId="cook_along.load_error.open_in_browser"
        onPress={() => void openInBrowser()}
        style={{ alignSelf: 'center' }}
      >
        {t('cookAlong.openInBrowser')}
      </Button>
    </View>
  ) : (
    <>
      {loading ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            start: 0,
            end: 0,
            zIndex: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: photo.scrim,
          }}
        >
          <ActivityIndicator color={photo.onScrim} size="large" accessibilityLabel={t('a11y.loadingVideo')} />
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
              backgroundColor: photo.scrim,
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
              backgroundColor: photo.scrim,
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
          style={{ flex: 1, backgroundColor: photo.scrim }}
        />
      )}
    </>
  );

  const chrome = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h3">{t('cookAlong.title')}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {platformLabel}
            {startSeconds > 0 ? ` · ${t('cookAlong.fromTime', { time: formatClock(startSeconds) })}` : ''}
            {isWeb ? '' : ` · ${t('cookAlong.scrollRecipe')}`}
          </Text>
        </View>
        <IconButton variant="tile" icon="close" label={t('cookAlong.close')} trackId="cook_along.close" onPress={onClose} />
      </View>

      {!isWeb && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
          {(['compact', 'medium', 'tall'] as HeightPreset[]).map((preset) => {
            const active = heightPreset === preset;
            const presetLabel = t(
              preset === 'compact'
                ? 'cookAlong.heightCompact'
                : preset === 'medium'
                  ? 'cookAlong.heightMedium'
                  : 'cookAlong.heightTall',
            );
            return (
              <Chip
                key={preset}
                size="sm"
                kind="radio"
                selected={active}
                trackId={`cook_along.height.${preset}`}
                onPress={() => setHeightPreset(preset)}
                accessibilityLabel={t('a11y.videoHeight', { size: presetLabel })}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {presetLabel}
              </Chip>
            );
          })}
        </View>
      )}

      <View
        style={{
          flex: 1,
          marginHorizontal: 16,
          overflow: 'hidden',
          borderRadius: Radii.inner,
          backgroundColor: photo.scrim,
          minHeight: isSidebar || isWeb ? 0 : undefined,
        }}
      >
        {videoPlayer}
      </View>

      <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
        <Button
          variant="ghost"
          size="sm"
          icon="open-outline"
          trackId="cook_along.open_in_browser"
          onPress={() => void openInBrowser()}
        >
          {t('cookAlong.openInBrowserHint')}
        </Button>
      </View>
    </>
  );

  if (isSidebar) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: Radii.tile,
          borderWidth: HAIRLINE,
          borderColor: colors.border,
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
          start: 0,
          end: 0,
          top: 0,
          bottom: 0,
          zIndex: 50,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.overlay,
          padding: WEB_DIALOG_INSET,
        }}
      >
        <Pressable
          trackId="cook_along.backdrop"
          style={{ position: 'absolute', start: 0, end: 0, top: 0, bottom: 0 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('cookAlong.dismiss')}
        />
        <View
          pointerEvents="auto"
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            width: webDialogWidth,
            height: webDialogHeight,
            maxHeight: webDialogHeight,
            backgroundColor: colors.background,
            borderRadius: Radii.tile,
            borderWidth: HAIRLINE,
            borderColor: colors.border,
            paddingBottom: 12,
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
        start: 0,
        end: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'flex-end',
        zIndex: 50,
      }}
    >
      <View style={{ flex: 1 }} pointerEvents="none" />

      <View
        pointerEvents="auto"
        onAccessibilityEscape={onClose}
        style={{
          height: totalHeight,
          paddingBottom: insets.bottom,
          backgroundColor: colors.background,
          borderTopStartRadius: Radii.tile,
          borderTopEndRadius: Radii.tile,
          borderTopWidth: HAIRLINE,
          borderColor: colors.border,
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
