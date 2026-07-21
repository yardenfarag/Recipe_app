import { Pressable, Text, View } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';
import {
  THEME_PACK_ORDER,
  ThemePacks,
  type ThemePackId,
} from '@/constants/themes';

/** Scrollable grid of Drift theme packs for Settings. */
export function ThemePackPicker() {
  const { packId, setPackId, colors } = useThemePreference();

  return (
    <View className="gap-2.5">
      {THEME_PACK_ORDER.map((id) => {
        const pack = ThemePacks[id];
        const active = packId === id;
        return (
          <Pressable
            key={id}
            onPress={() => setPackId(id as ThemePackId)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-row items-center gap-3 rounded-[18px] px-3.5 py-3 active:opacity-80"
            style={{
              backgroundColor: active ? colors.primarySoft : 'transparent',
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.frostedBorder,
            }}
          >
            <View className="flex-row items-center" style={{ gap: -6 }}>
              {pack.swatches.map((swatch, i) => (
                <View
                  key={`${id}-${i}`}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: swatch,
                    borderWidth: 2,
                    borderColor: colors.surface,
                    marginLeft: i === 0 ? 0 : -6,
                    zIndex: 3 - i,
                  }}
                />
              ))}
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className="text-sm font-semibold"
                style={{ color: active ? colors.primary : colors.text }}
              >
                {pack.name}
              </Text>
              <Text
                className="mt-0.5 text-xs leading-4"
                style={{ color: colors.textSecondary }}
                numberOfLines={2}
              >
                {pack.blurb}
              </Text>
            </View>
            {active ? (
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colors.primary }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
