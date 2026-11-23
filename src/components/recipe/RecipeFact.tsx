import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { COST_TIER_COUNT, costFilledCount } from '@shared/lib/formatCostEstimate';
import type { CostEstimate } from '@shared/types/recipe';

const factBox: ViewStyle = {
  flex: 1,
  minWidth: 0,
  gap: 2,
  borderRadius: Radii.fact,
  paddingHorizontal: 8,
  paddingVertical: 10,
};

/**
 * One of the four facts on the recipe (time, servings, calories, cost): the value big over a short label. Like the
 * kit's FactTile, but four fit a phone's width: tighter sides, and a long value ("1 hr 15 min") wraps instead of
 * being cut. `spoken` is what a screen reader hears in place of the two lines.
 */
export function RecipeFact({
  value,
  label,
  spoken,
  style,
}: {
  value: ReactNode;
  label: string;
  spoken?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemePreference();
  const type = useTypography();
  return (
    <View
      accessible
      accessibilityLabel={spoken ?? (typeof value === 'string' || typeof value === 'number' ? `${value}, ${label}` : label)}
      style={[factBox, { backgroundColor: colors.backgroundElement }, style]}
    >
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text
          numberOfLines={2}
          style={{
            ...type.font('display', 'bold'),
            fontSize: 17,
            lineHeight: 21,
            letterSpacing: type.tracking(-0.015, 17),
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      ) : (
        <View style={{ minHeight: 21, justifyContent: 'center' }}>{value}</View>
      )}
      <Text numberOfLines={2} tone="muted" style={{ ...type.font('body', 'semibold'), fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );
}

/** A fact Pinch is recalculating after a hand edit (ADR 018): "Updating…" in a dashed box, read with the field's name. */
export function RecipeUpdatingFact({ field, label, updating }: { field: string; label: string; updating: string }) {
  const { colors } = useThemePreference();
  const type = useTypography();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${field}, ${updating}`}
      accessibilityState={{ busy: true }}
      style={[factBox, { borderWidth: HAIRLINE, borderStyle: 'dashed', borderColor: colors.border }]}
    >
      <Text
        testID="updating-fact"
        numberOfLines={2}
        tone="muted"
        style={{ ...type.font('body', 'semibold'), fontSize: 13, lineHeight: 21 }}
      >
        {updating}
      </Text>
      <Text numberOfLines={2} tone="muted" style={{ ...type.font('body', 'semibold'), fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );
}

/** ●●○ for the cost tier, never an amount. Drawn left to right in every language, so ●○○ is always the cheap one. */
export function CostDots({ tier, size = 10 }: { tier: CostEstimate; size?: number }) {
  const { colors } = useThemePreference();
  const filled = costFilledCount(tier);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, direction: 'ltr' }}
    >
      {Array.from({ length: COST_TIER_COUNT }, (_, index) => (
        <View
          key={index}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: index < filled ? colors.primary : colors.backgroundSelected,
          }}
        />
      ))}
    </View>
  );
}
