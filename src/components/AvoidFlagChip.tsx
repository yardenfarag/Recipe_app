import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

/** Foods from the cook's avoid list on a Hub card (PIN-180): `text` is the foods, `label` the sentence for a reader. */
export type AvoidFlag = { kind: 'allergy' | 'dislike'; text: string; label: string };

/**
 * A small chip under a Hub card's title: red with the cook's allergies, amber with foods they don't like (the web's
 * RecipeCard flag). The card reads `label` as part of its own accessibility label, so the chip itself is hidden.
 */
export function AvoidFlagChip({ flag }: { flag: AvoidFlag }) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const allergy = flag.kind === 'allergy';
  const fg = allergy ? colors.danger : colors.warning;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: allergy ? colors.dangerSoft : colors.warningSoft,
      }}
    >
      <Ionicons name={allergy ? 'alert-circle' : 'warning-outline'} size={12} color={fg} />
      <Text color={fg} numberOfLines={1} style={{ ...type.font('body', 'semibold'), fontSize: 12, lineHeight: 16, flexShrink: 1 }}>
        {flag.text}
      </Text>
    </View>
  );
}
