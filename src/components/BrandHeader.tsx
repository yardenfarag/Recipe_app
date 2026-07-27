import { Text, View } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { isRtlAppLanguage } from '@/lib/appLanguages';

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
  const { language } = useLanguagePreference();
  const rtl = isRtlAppLanguage(language);
  const isHero = size === 'hero';
  const centered = align === 'center';

  // Prefer explicit RTL layout so the brand stack stays aligned even before a
  // full I18nManager reload after changing language.
  const rowDirection = centered ? undefined : rtl ? ('row-reverse' as const) : ('row' as const);
  const textAlign = centered ? ('center' as const) : rtl ? ('right' as const) : ('left' as const);
  const writingDirection = rtl ? ('rtl' as const) : ('ltr' as const);
  const blockAlign = centered ? 'center' : rtl ? 'flex-end' : 'flex-start';

  return (
    <View
      className={`gap-3 ${centered ? 'items-center' : ''}`}
      style={centered ? undefined : { alignItems: 'stretch' }}
    >
      <View
        style={
          centered
            ? { alignItems: 'center' }
            : { flexDirection: rowDirection, alignItems: 'center', gap: 12 }
        }
      >
        <View
          className={`items-center justify-center ${
            isHero ? 'mb-1 h-20 w-20 rounded-[28px]' : 'h-11 w-11 rounded-2xl'
          }`}
          style={{ backgroundColor: colors.primarySoft }}
        >
          <CookieMark size={isHero ? 42 : 26} color={colors.primary} />
        </View>
        {!isHero && (
          <View className="min-w-0 flex-1" style={{ alignItems: blockAlign }}>
            {/* Brand stays Latin / LTR, but sits on the reading-start side. */}
            <Text
              className="text-[11px] font-semibold"
              style={{
                color: colors.textSecondary,
                letterSpacing: 0.6,
                writingDirection: 'ltr',
                textAlign,
                alignSelf: centered ? 'center' : rtl ? 'flex-end' : 'flex-start',
              }}
            >
              Pinch
            </Text>
            <Text
              className="text-[22px] font-bold tracking-tight"
              style={{
                color: colors.text,
                letterSpacing: rtl ? 0 : -0.4,
                writingDirection,
                textAlign,
                width: '100%',
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                className="mt-0.5 text-[13px]"
                style={{
                  color: colors.textSecondary,
                  writingDirection,
                  textAlign,
                  width: '100%',
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      {isHero && (
        <View style={{ alignItems: blockAlign, width: '100%' }}>
          <Text
            className="mb-1 text-xs font-semibold"
            style={{
              color: colors.textSecondary,
              letterSpacing: 0.6,
              writingDirection: 'ltr',
              textAlign,
              alignSelf: centered ? 'center' : rtl ? 'flex-end' : 'flex-start',
            }}
          >
            Pinch
          </Text>
          <Text
            className="text-[28px] font-bold tracking-tight"
            style={{
              color: colors.text,
              letterSpacing: rtl ? 0 : -0.5,
              writingDirection,
              textAlign,
              width: '100%',
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="mt-2.5 text-[15px] leading-[22px]"
              style={{
                color: colors.textSecondary,
                writingDirection,
                textAlign,
                width: '100%',
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
