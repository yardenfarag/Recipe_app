import { Text, View } from 'react-native';

import { COST_TIER_COUNT, costFilledCount } from '@/lib/formatCostEstimate';
import { CostEstimate } from '@/types/recipe';

type CostMeterProps = {
  tier: CostEstimate;
  color: string;
  size?: number;
};

/** 3-dot cost meter. Always LTR so ●○○ means budget in every language. */
export function CostMeter({ tier, color, size = 6 }: CostMeterProps) {
  const filled = costFilledCount(tier);
  const gap = Math.max(2, Math.round(size * 0.4));
  const borderWidth = size >= 7 ? 1.5 : 1;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap,
        direction: 'ltr',
        flexShrink: 0,
      }}
    >
      {Array.from({ length: COST_TIER_COUNT }, (_, index) => {
        const isFilled = index < filled;
        return (
          <View
            key={index}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isFilled ? color : 'transparent',
              borderWidth,
              borderColor: color,
              opacity: isFilled ? 1 : 0.35,
            }}
          />
        );
      })}
    </View>
  );
}

type CostEstimateDisplayProps = {
  tier: CostEstimate;
  label: string;
  color: string;
  textClassName?: string;
  meterSize?: number;
};

/** Meter + translated word, kept LTR as a unit (meter, then label). */
export function CostEstimateDisplay({
  tier,
  label,
  color,
  textClassName,
  meterSize = 6,
}: CostEstimateDisplayProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        direction: 'ltr',
      }}
    >
      <CostMeter tier={tier} color={color} size={meterSize} />
      <Text className={textClassName} numberOfLines={1} style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
