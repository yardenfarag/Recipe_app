import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { IngredientAmountText } from '@/components/IngredientAmountText';
import { RevealView } from '@/components/recipe/SnapReveal';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { ingredientRevealWindow } from '@shared/lib/snapReveal';

export type IngredientRowData = {
  key: string;
  name: string;
  /** As shown: "2 tbsp", "a pinch", or "not in the source". */
  amount: string;
  isPinch: boolean;
  avoid: 'allergy' | 'dislike' | null;
  /** The server cleared this row's grams/spoons; the written amount shows meanwhile (ADR 018). */
  updating: boolean;
};

/**
 * The ingredients in one tile (PIN-177): a row each, the name at the start and the amount at the end in muted
 * figures, hairline dividers between them. A row the cook's avoid list flags gets a small icon; on a saved recipe
 * each row ends in a Swap button. The rows follow the recipe text's direction, which can differ from the app's.
 */
export function RecipeIngredientList({
  rows,
  direction,
  rowDirection,
  onSwap,
  updatingLabel,
  reveal = null,
}: {
  rows: IngredientRowData[];
  direction: 'ltr' | 'rtl';
  /** 'row' when the recipe reads the same way as the app, 'row-reverse' when not. */
  rowDirection: 'row' | 'row-reverse';
  /** Opens Swap for the row at this index; left out where the recipe can't be changed. */
  onSwap?: (index: number) => void;
  updatingLabel: string;
  /** The Snap reveal's progress (PIN-192): the rows then appear one after another. */
  reveal?: SharedValue<number> | null;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const start = direction === 'rtl' ? 'right' : 'left';
  const end = direction === 'rtl' ? 'left' : 'right';

  return (
    <Tile style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
      {rows.map((row, index) => {
        const spoken = row.avoid
          ? `${row.name}, ${row.amount}, ${t(row.avoid === 'allergy' ? 'avoid.ingredientAllergy' : 'avoid.ingredientDislike')}`
          : `${row.name}, ${row.amount}`;
        const rowStyle = {
          flexDirection: rowDirection,
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          paddingVertical: 8,
          borderBottomWidth: index < rows.length - 1 ? HAIRLINE : 0,
          borderBottomColor: colors.border,
        } as const;
        const content = (
          <>
            {row.avoid ? (
              <KitIcon
                icon={row.avoid === 'allergy' ? 'alert-circle' : 'remove-circle-outline'}
                size={16}
                color={row.avoid === 'allergy' ? colors.warning : colors.textSecondary}
              />
            ) : null}
            <Text
              variant="body"
              weight="medium"
              accessibilityLabel={spoken}
              style={{ flex: 1, minWidth: 0, writingDirection: direction, textAlign: start }}
            >
              {row.name}
            </Text>
            <View style={{ flexShrink: 1, maxWidth: '45%', alignItems: rowDirection === 'row' ? 'flex-end' : 'flex-start' }}>
              <IngredientAmountText
                hideFromAccessibility
                amount={row.amount}
                isPinch={row.isPinch}
                color={colors.textSecondary}
                pinchColor={colors.primaryText}
                writingDirection={direction}
                textAlign={end}
              />
              {row.updating ? (
                <Text
                  tone="muted"
                  accessibilityLabel={`${row.name}, ${updatingLabel}`}
                  accessibilityState={{ busy: true }}
                  style={{ ...type.font('body', 'medium'), fontSize: 11, lineHeight: 14 }}
                >
                  {updatingLabel}
                </Text>
              ) : null}
            </View>
            {onSwap ? (
              <IconButton
                icon="swap-horizontal"
                iconSize={18}
                label={t('a11y.swapIngredient', { name: row.name })}
                trackId="recipe.ingredient.swap"
                onPress={() => onSwap(index)}
                style={{ marginVertical: -4 }}
              />
            ) : null}
          </>
        );
        if (!reveal) {
          return (
            <View key={row.key} style={rowStyle}>
              {content}
            </View>
          );
        }
        const [revealStart, revealEnd] = ingredientRevealWindow(index, rows.length);
        return (
          <RevealView key={row.key} progress={reveal} start={revealStart} end={revealEnd} rise={8} style={rowStyle}>
            {content}
          </RevealView>
        );
      })}
    </Tile>
  );
}
