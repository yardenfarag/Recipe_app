import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useThemePreference } from '@/hooks/useThemePreference';
import {
  buildRecipeVideoWebViewSource,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  recipeVideoUrlAtSeconds,
  VIDEO_WEBVIEW_USER_AGENT,
} from '@/lib/recipeVideo';
import type { Platform } from '@/types/recipe';

type HeightPreset = 'compact' | 'medium' | 'tall';

const HEIGHT_PRESET: Record<HeightPreset, number> = {
  compact: 0.38,
  medium: 0.56,
  tall: 0.78,
};

type CookAlongVideoModalProps = {
  visible: boolean;
  onClose: () => void;
  originalUrl: string;
  platform?: Platform | null;
  startSeconds?: number;
};

/**
 * In-app cook-along sheet: WebView loads the source video without leaving Pinch.
 * Height is adjustable; YouTube uses embed + Referer to avoid Error 153.
 */
export function CookAlongVideoModal({
  visible,
  onClose,
  originalUrl,
  platform,
  startSeconds = 0,
}: CookAlongVideoModalProps) {
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [heightPreset, setHeightPreset] = useState<HeightPreset>('medium');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const video = useMemo(
    () => getRecipeVideoInfo(originalUrl, platform),
    [originalUrl, platform],
  );
  const webSource = useMemo(
    () => buildRecipeVideoWebViewSource(video, startSeconds),
    [video, startSeconds],
  );
  const platformLabel = getRecipePlatformLabel(video.platform);
  const sheetHeight = Math.round(windowHeight * HEIGHT_PRESET[heightPreset]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setLoadError(false);
    }
  }, [visible, webSource]);

  async function openInBrowser() {
    const url =
      startSeconds > 0
        ? recipeVideoUrlAtSeconds(originalUrl, video.platform, startSeconds)
        : originalUrl;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        enableBarCollapsing: true,
      });
    } catch {
      // User dismissed — fine.
    }
  }

  if (!webSource) return null;

  const webViewKey =
    webSource.type === 'uri'
      ? `${webSource.uri}-${startSeconds}`
      : `html-${startSeconds}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close video" />

        <View
          style={{
            height: sheetHeight + insets.bottom,
            paddingBottom: insets.bottom,
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}
        >
          <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold" style={{ color: colors.text }}>
                Cook along
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                {platformLabel}
                {startSeconds > 0 ? ` · from ${formatClock(startSeconds)}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
              style={{ backgroundColor: colors.frosted }}
              accessibilityLabel="Close cook-along video"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

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
                    className="text-[11px] font-semibold capitalize"
                    style={{ color: active ? '#fff' : colors.textSecondary }}
                  >
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mx-4 flex-1 overflow-hidden rounded-2xl bg-black">
            {loadError ? (
              <View className="flex-1 items-center justify-center px-6">
                <Ionicons name="alert-circle-outline" size={36} color="#fff" />
                <Text className="mt-3 text-center text-sm leading-5 text-white/90">
                  Couldn&apos;t load the video here. Try opening it in your browser instead.
                </Text>
                <Pressable
                  onPress={() => void openInBrowser()}
                  className="mt-4 rounded-full px-5 py-2.5 active:opacity-80"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-sm font-bold text-white">Open in browser</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {loading ? (
                  <View className="absolute inset-0 z-10 items-center justify-center bg-black">
                    <ActivityIndicator color="#fff" size="large" />
                  </View>
                ) : null}
                <WebView
                  key={webViewKey}
                  source={
                    webSource.type === 'uri'
                      ? { uri: webSource.uri, headers: webSource.headers }
                      : { html: webSource.html, baseUrl: webSource.baseUrl }
                  }
                  userAgent={
                    video.platform === 'youtube' ? undefined : VIDEO_WEBVIEW_USER_AGENT
                  }
                  allowsFullscreenVideo
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled
                  domStorageEnabled
                  setSupportMultipleWindows={false}
                  originWhitelist={['*']}
                  onLoadStart={() => setLoading(true)}
                  onLoadEnd={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setLoadError(true);
                  }}
                  onHttpError={() => {
                    setLoading(false);
                    setLoadError(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#000' }}
                />
              </>
            )}
          </View>

          <Pressable
            onPress={() => void openInBrowser()}
            className="mx-4 mt-2 flex-row items-center justify-center gap-1.5 py-2 active:opacity-70"
          >
            <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              Open in browser if playback fails
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
