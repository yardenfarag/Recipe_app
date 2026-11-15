import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';

/** The round close control every dismissible card, page and banner shows. */
export function CloseButton({ trackId, onPress, size = 40 }: { trackId: string; onPress: () => void; size?: number }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('inAppMessages.close')}
      hitSlop={6}
      style={({ pressed }) => ({
        height: size,
        width: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="close" size={Math.round(size * 0.5)} color={colors.text} />
    </Pressable>
  );
}
