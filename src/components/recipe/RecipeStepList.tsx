import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { KitIcon, MIN_TOUCH, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { formatVideoTimestamp } from '@shared/lib/formatVideoTimestamp';
import type { Instruction } from '@shared/types/recipe';

/**
 * The steps, a tile each (PIN-177): the number in Space Grotesk on an element-coloured square, the text set for
 * reading from across the kitchen, and the step's time in the video as a button that plays from there (cook
 * along). The rows follow the recipe text's direction, which can differ from the app's.
 */
export function RecipeStepList({
  steps,
  direction,
  rowDirection,
  onJump,
}: {
  steps: Instruction[];
  direction: 'ltr' | 'rtl';
  rowDirection: 'row' | 'row-reverse';
  /** Plays the video from a step's time; left out when there is no video to play. */
  onJump?: (seconds: number) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const start = direction === 'rtl' ? 'right' : 'left';

  return (
    <View style={{ gap: 10 }}>
      {steps.map((step, index) => (
        <Tile
          key={`${step.step}-${index}`}
          size="md"
          testID={`recipe-step-${step.step}`}
          style={{ flexDirection: rowDirection, alignItems: 'flex-start', gap: 14, padding: 16 }}
        >
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.backgroundElement,
            }}
          >
            <Text
              align="center"
              style={{ ...type.font('display', 'bold'), fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] }}
            >
              {step.step}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 10, paddingTop: 7 }}>
            <Text
              variant="body"
              style={{ lineHeight: 25, writingDirection: direction, textAlign: start }}
              accessibilityLabel={`${t('recipe.cookModeStep', { current: index + 1, total: steps.length })}. ${step.text}`}
            >
              {step.text}
            </Text>
            {step.timestamp_seconds != null && onJump ? (
              <Pressable
                trackId="recipe.step.jump_to_video"
                onPress={() => onJump(step.timestamp_seconds!)}
                accessibilityRole="button"
                accessibilityLabel={t('recipe.jumpToStep', {
                  step: step.step,
                  time: formatVideoTimestamp(step.timestamp_seconds),
                })}
                style={({ pressed }) => ({
                  alignSelf: rowDirection === 'row' ? 'flex-start' : 'flex-end',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  height: MIN_TOUCH,
                  paddingHorizontal: 12,
                  borderRadius: Radii.control - 4,
                  backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
                })}
              >
                <KitIcon icon="play" size={12} color={colors.text} />
                <Text
                  style={{ ...type.font('body', 'bold'), fontSize: 13, lineHeight: 16, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}
                >
                  {formatVideoTimestamp(step.timestamp_seconds)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Tile>
      ))}
    </View>
  );
}
