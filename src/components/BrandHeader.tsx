import { Text, View } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { useThemePreference } from '@/hooks/useThemePreference';

type BrandHeaderProps = {
  title: string;
  subtitle?: string;
  /** Larger cookie mark for empty / hero states. */
  size?: 'default' | 'hero';
  align?: 'left' | 'center';
};

/** Cookie brand mark + Pinch wordmark + screen title. */
export function BrandHeader({
  title,
  subtitle,
  size = 'default',
  align = 'left',
}: BrandHeaderProps) {
  const { colors } = useThemePreference();
  const isHero = size === 'hero';
  const centered = align === 'center';

  return (
    <View className={`gap-3 ${centered ? 'items-center' : ''}`}>
      <View className={`${centered ? 'items-center' : 'flex-row items-center gap-3'}`}>
        <View
          className={`items-center justify-center ${
            isHero ? 'mb-1 h-20 w-20 rounded-[28px]' : 'h-11 w-11 rounded-2xl'
          }`}
          style={{ backgroundColor: colors.primarySoft }}
        >
          <CookieMark size={isHero ? 42 : 26} color={colors.primary} />
        </View>
        {!isHero && (
          <View className="min-w-0 flex-1">
            <Text
              className="text-[11px] font-semibold"
              style={{ color: colors.textSecondary, letterSpacing: 0.6 }}
            >
              Pinch
            </Text>
            <Text
              className="text-[22px] font-bold tracking-tight"
              style={{ color: colors.text, letterSpacing: -0.4 }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-0.5 text-[13px]" style={{ color: colors.textSecondary }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      {isHero && (
        <View className={centered ? 'items-center' : ''}>
          <Text
            className="mb-1 text-xs font-semibold"
            style={{ color: colors.textSecondary, letterSpacing: 0.6 }}
          >
            Pinch
          </Text>
          <Text
            className={`text-[28px] font-bold tracking-tight ${centered ? 'text-center' : ''}`}
            style={{ color: colors.text, letterSpacing: -0.5 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className={`mt-2.5 text-[15px] leading-[22px] ${centered ? 'text-center' : ''}`}
              style={{ color: colors.textSecondary }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
