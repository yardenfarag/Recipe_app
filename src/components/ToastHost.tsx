import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { subscribeToast, type ToastMessage } from '@shared/lib/toast';

/**
 * Renders `showToast()` messages: a small pill at the bottom of the screen that fades in and
 * out on its own. Mounted once in the root layout. Colors are inverted from the page (dark pill
 * on a light theme and the other way round) so it stands out without a backdrop.
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
        left: 16,
        right: 16,
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
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: 999,
          backgroundColor: colors.text,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
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
        <Text className="text-sm font-semibold" style={{ color: colors.surface }} numberOfLines={2}>
          {toast.text}
        </Text>
      </Animated.View>
    </View>
  );
}
