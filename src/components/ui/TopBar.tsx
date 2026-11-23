import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

import { PinchLogo } from './PinchLogo';
import { Text } from './Text';
import { HAIRLINE } from './tokens';

/**
 * The credits balance as a pill: a small accent dot and "12 credits". Opens the credits screen unless given its own
 * `onPress`.
 *
 *   <CreditsPill credits={totalCredits} />
 */
export function CreditsPill({
  credits,
  onPress,
  style,
}: {
  credits: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  // "{{count, number}}" in the string writes the number in the app language's digits and grouping ("1,200").
  const label = t('web.library.credits', { count: credits });

  return (
    <Pressable
      trackId="library.credits"
      onPress={onPress ?? (() => router.push('/settings/credits'))}
      accessibilityRole="button"
      accessibilityLabel={t('settings.creditsTotal', { count: credits })}
      // 40 tall; the touch area reaches 44.
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: 40,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: HAIRLINE,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.backgroundElement : colors.surface,
        },
        style,
      ]}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
      <Text numberOfLines={1} style={{ ...type.font('body', 'semibold'), fontSize: 14, lineHeight: 18 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The signed-in person's balance, from their profile. Nothing for a guest or while it loads. */
function ProfileCreditsPill() {
  const { totalCredits } = useProfile();
  return totalCredits == null ? null : <CreditsPill credits={totalCredits} />;
}

export type TopBarProps = {
  /**
   * The balance to show. Leave it out and the bar reads it from the profile (`useProfile`); pass it when the screen
   * already has it, to save a second fetch; pass null to show none.
   */
  credits?: number | null;
  /** Replaces the credits pill at the end of the bar. */
  end?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The bar at the top of a tab's root screen: the Pinch logo at the start, the credits pill (or `end`) at the end.
 * Sits inside the Screen's safe area, above the PageHeader or the screen's first tile.
 *
 *   <TopBar />
 *   <TopBar credits={totalCredits} />
 */
export function TopBar({ credits, end, style }: TopBarProps) {
  const trailing =
    end !== undefined ? end : credits === undefined ? <ProfileCreditsPill /> : credits == null ? null : <CreditsPill credits={credits} />;
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56 },
        style,
      ]}
    >
      <PinchLogo />
      {trailing}
    </View>
  );
}
