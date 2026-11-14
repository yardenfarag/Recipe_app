import Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import { I18nManager, Platform } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';

import { goBackOrHome } from '@/lib/goBackOrHome';

type StackHeaderBackButtonProps = {
  tintColor?: string;
  fallback?: Href;
  /** Fixed id for the admin Activity log. */
  trackId?: string;
};

/**
 * Explicit stack back control. Avoids relying on the default header back action
 * (GO_BACK), which can no-op on web when history and the stack get out of sync.
 */
export function StackHeaderBackButton({
  tintColor,
  fallback = '/',
  trackId = 'nav.back',
}: StackHeaderBackButtonProps) {
  const { t } = useTranslation();
  const rtl = I18nManager.isRTL;

  return (
    <Pressable
      trackId={trackId}
      onPress={() => goBackOrHome(fallback)}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={16}
      className="items-center justify-center active:opacity-70"
      style={{
        marginStart: Platform.OS === 'ios' ? 0 : 4,
        paddingHorizontal: 6,
        paddingVertical: 6,
      }}
    >
      <Ionicons
        name={rtl ? 'chevron-forward' : 'chevron-back'}
        size={28}
        color={tintColor}
      />
    </Pressable>
  );
}
