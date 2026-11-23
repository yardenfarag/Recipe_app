import { TextStyle } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { useTypography } from '@/hooks/useTypography';

type IngredientAmountTextProps = {
  amount: string;
  isPinch: boolean;
  color: string;
  pinchColor: string;
  writingDirection?: TextStyle['writingDirection'];
  /** Set when the row already reads the amount in a composed label. */
  hideFromAccessibility?: boolean;
  /** Alignment within the row's end column. */
  textAlign?: TextStyle['textAlign'];
};

/** Amount label that eases into the word pinch when scaling makes it one. Inter, tabular figures (PIN-177). */
export function IngredientAmountText({
  amount,
  isPinch,
  color,
  pinchColor,
  writingDirection,
  hideFromAccessibility = false,
  textAlign,
}: IngredientAmountTextProps) {
  const reduceMotion = useReducedMotion();
  const type = useTypography();

  return (
    <Animated.Text
      key={amount}
      entering={reduceMotion ? undefined : FadeIn.duration(220)}
      accessible={!hideFromAccessibility}
      importantForAccessibility={hideFromAccessibility ? 'no' : 'auto'}
      style={{
        ...type.font('body', isPinch ? 'semibold' : 'medium'),
        fontSize: 15,
        lineHeight: 20,
        fontVariant: ['tabular-nums'],
        color: isPinch ? pinchColor : color,
        writingDirection,
        textAlign,
      }}
    >
      {amount}
    </Animated.Text>
  );
}
