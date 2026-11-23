import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { PinchLogo } from '@/components/ui/PinchLogo';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';

type BrandHeaderProps = {
  title: string;
  subtitle?: string;
  /** Larger cookie mark for empty / hero states. */
  size?: 'default' | 'hero';
  align?: 'left' | 'center';
  /** When this changes, title and subtitle crossfade instead of snapping. */
  copyKey?: string;
};

/**
 * The Pinch logo over a screen's title (Night Market, PIN-177). Default: the kit's PinchLogo, then the title (h1) and
 * a muted line. Hero (empty states): the cookie mark on a big brand-coloured tile, then the title (h2) and the line,
 * centred. `align="left"` means the reading start, which is the right in Hebrew and Arabic.
 */
export function BrandHeader({
  title,
  subtitle,
  size = 'default',
  align = 'left',
  copyKey,
}: BrandHeaderProps) {
  const { colors } = useThemePreference();
  const reduceMotion = useReducedMotion();
  const fadeCopy = Boolean(copyKey) && !reduceMotion;
  const isHero = size === 'hero';
  const centered = align === 'center';
  const textAlign = centered ? 'center' : 'start';

  const copy = (
    <Animated.View layout={fadeCopy ? LinearTransition.duration(280) : undefined} style={{ alignSelf: 'stretch' }}>
      <Animated.View
        key={copyKey ?? 'copy'}
        entering={fadeCopy ? FadeIn.duration(220) : undefined}
        exiting={fadeCopy ? FadeOut.duration(140) : undefined}
      >
        <Text variant={isHero ? 'h2' : 'h1'} align={textAlign}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="muted" align={textAlign} style={{ marginTop: isHero ? 8 : 6 }}>
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );

  if (isHero) {
    return (
      <View style={{ alignItems: centered ? 'center' : 'flex-start', gap: 16, alignSelf: 'stretch' }}>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
          }}
        >
          <CookieMark size={42} color={colors.onPrimary} holeColor={colors.primary} />
        </View>
        {copy}
      </View>
    );
  }

  return (
    <View style={{ gap: 14, alignItems: centered ? 'center' : 'flex-start', alignSelf: 'stretch' }}>
      <PinchLogo size="sm" />
      {copy}
    </View>
  );
}
