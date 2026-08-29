import { TextStyle } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

type IngredientAmountTextProps = {
  amount: string;
  isPinch: boolean;
  color: string;
  pinchColor: string;
  writingDirection?: TextStyle['writingDirection'];
};

/** Amount label that eases into the word pinch when scaling makes it one. */
export function IngredientAmountText({
  amount,
  isPinch,
  color,
  pinchColor,
  writingDirection,
}: IngredientAmountTextProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.Text
      key={amount}
      entering={reduceMotion ? undefined : FadeIn.duration(220)}
      className="text-sm tabular-nums"
      style={{
        color: isPinch ? pinchColor : color,
        fontWeight: isPinch ? '600' : '400',
        writingDirection,
      }}
    >
      {amount}
    </Animated.Text>
  );
}
