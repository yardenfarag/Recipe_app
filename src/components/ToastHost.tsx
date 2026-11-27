import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { haptics } from '@/lib/haptics';
import { subscribeToast, type ToastMessage } from '@shared/lib/toast';

/**
 * Renders `showToast()` messages: a compact rounded tile at the bottom of the screen that fades in and out on its
 * own. Mounted once in the root layout. Colours are inverted from the page (the text colour as the fill, the surface
 * colour for the words), so it stands out without a backdrop or a shadow; the icon carries success or failure, as on
 * the web.
 */
export function ToastHost() {
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(
    () =>
      subscribeToast((next) => {
        if (next) {
          setToast(next);
          announce(next.text);
          if (next.icon === 'error') haptics.error();
          Animated.timing(progress, {
            toValue: 1,
            duration: 180,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
        } else {
          Animated.timing(progress, {
            toValue: 0,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
          }).start(({ finished }) => {
            if (finished) setToast(null);
          });
        }
      }),
    [progress],
  );

  if (!toast) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        start: 16,
        end: 16,
        bottom: insets.bottom + 32,
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          maxWidth: 420,
          minHeight: 48,
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: Radii.inner,
          backgroundColor: colors.text,
        }}
      >
        <Ionicons
          name={
            toast.icon === 'success'
              ? 'checkmark-circle'
              : toast.icon === 'error'
                ? 'alert-circle'
                : 'information-circle'
          }
          size={20}
          color={colors.surface}
        />
        <Text variant="bodySmall" weight="semibold" color={colors.surface} numberOfLines={2} style={{ flexShrink: 1 }}>
          {toast.text}
        </Text>
      </Animated.View>
    </View>
  );
}
