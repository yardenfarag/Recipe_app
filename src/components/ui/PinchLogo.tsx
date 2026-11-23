import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { FontFamily } from '@/constants/typography';
import { useThemePreference } from '@/hooks/useThemePreference';

const SIZES = {
  md: { tile: 40, radius: 13, mark: 22, word: 20 },
  sm: { tile: 32, radius: 10, mark: 19, word: 17 },
} as const;

/**
 * The Pinch logo: the cookie mark on a rounded tile in the brand colour, and the word "Pinch" in Space Grotesk
 * (always, as the name is Latin in every language). Read out as "Pinch".
 *
 *   <PinchLogo />                 // 40 tile + wordmark, as in the top bar
 *   <PinchLogo wordmark={false} /> // the mark alone
 */
export function PinchLogo({
  size = 'md',
  wordmark = true,
  style,
}: {
  size?: 'sm' | 'md';
  wordmark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemePreference();
  const s = SIZES[size];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Pinch"
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}
    >
      <View
        style={{
          width: s.tile,
          height: s.tile,
          borderRadius: s.radius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary,
        }}
      >
        <CookieMark size={s.mark} color={colors.onPrimary} />
      </View>
      {wordmark ? (
        <Text
          style={{
            fontFamily: FontFamily.spaceGroteskBold,
            fontSize: s.word,
            lineHeight: Math.round(s.word * 1.2),
            letterSpacing: -0.3,
            color: colors.text,
            writingDirection: 'ltr',
          }}
        >
          Pinch
        </Text>
      ) : null}
    </View>
  );
}
