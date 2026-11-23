import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';

import { Pressable } from '@/components/ui/Pressable';
import { HAIRLINE, MIN_TOUCH } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

/**
 * The close control every dismissible card, page and banner shows: a small tile (surface, hairline border, rounded
 * corners), as the kit's IconButton `tile`. The touch area reaches 44 whatever its size.
 */
export function CloseButton({ trackId, onPress, size = 40 }: { trackId: string; onPress: () => void; size?: number }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const slop = Math.max(0, Math.ceil((MIN_TOUCH - size) / 2));
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('inAppMessages.close')}
      hitSlop={Math.max(slop, 6)}
      style={({ pressed }) => ({
        height: size,
        width: size,
        borderRadius: Math.round(size * 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: HAIRLINE,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.backgroundElement : colors.surface,
      })}
    >
      <Ionicons name="close" size={Math.round(size * 0.5)} color={colors.text} />
    </Pressable>
  );
}
