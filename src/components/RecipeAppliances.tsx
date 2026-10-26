import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ApplianceIcon } from '@/components/ApplianceIcon';
import { SheetModal } from '@/components/SheetModal';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { CHROME_MAX_FONT_SCALE } from '@/lib/a11y';
import {
  applianceAlternativeKey,
  applianceNameKey,
  applianceSteps,
  groupAppliances,
  isBasicAppliance,
} from '@/lib/applianceDisplay';
import type { RecipeAppliance } from '@/lib/appliances';

type RecipeAppliancesProps = {
  /** Already cleaned with recipeAppliancesOf(). null = not analysed: nothing is shown. */
  appliances: RecipeAppliance[] | null;
  /** The steps as displayed (may be translated); used for the "used in step …" sheet. */
  instructions: unknown;
  /**
   * Direction of the recipe's own text, which can differ from the app's: a Hebrew recipe in the
   * English app shows its steps right-to-left. Labels follow the app (useRtl).
   */
  stepDirection?: 'rtl' | 'ltr';
};

/** "What you'll need" (ADR 017 decision 4): Required, then "Makes it better" with benefits and tips. */
export function RecipeAppliances({ appliances, instructions, stepDirection }: RecipeAppliancesProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign, writingDirection } = useRtl();
  const [open, setOpen] = useState<RecipeAppliance | null>(null);

  if (appliances === null) return null;

  const { required, better } = groupAppliances(appliances);
  const textStyle = { textAlign, writingDirection };
  const stepStyle = stepDirection
    ? { writingDirection: stepDirection, textAlign: stepDirection === 'rtl' ? ('right' as const) : ('left' as const) }
    : textStyle;

  const describe = (item: RecipeAppliance) => {
    const parts: string[] = [];
    if (item.benefit) parts.push(t(`appliances.benefits.${item.benefit}`));
    const alternativeKey = applianceAlternativeKey(item.alternative);
    if (alternativeKey) parts.push(t('appliances.alternative', { alternative: t(alternativeKey) }));
    return parts.join(' · ');
  };

  const kindLabel = (item: RecipeAppliance) =>
    item.origin === 'tip'
      ? t('appliances.pinchTip')
      : item.required
        ? t('appliances.required')
        : t('appliances.optional');

  const chip = (item: RecipeAppliance) => {
    const name = t(applianceNameKey(item.key));
    const basic = item.required && isBasicAppliance(item.key);
    const filled = item.required && !basic;
    const color = filled ? colors.primary : colors.textSecondary;
    const detail = describe(item);
    return (
      <Pressable
        key={item.key}
        testID={`appliance-chip-${item.key}`}
        onPress={() => setOpen(item)}
        hitSlop={4}
        className="min-h-[36px] flex-row items-center gap-1.5 rounded-full border px-3 active:opacity-70"
        style={{
          backgroundColor: filled ? colors.primarySoft : 'transparent',
          borderColor: filled ? colors.primarySoft : colors.border,
        }}
        accessibilityRole="button"
        accessibilityLabel={[name, kindLabel(item), detail].filter(Boolean).join(', ')}
        accessibilityHint={t('appliances.chipHint')}
      >
        <ApplianceIcon appliance={item.key} size={basic ? 15 : 17} color={color} />
        <Text
          className={basic ? 'text-xs font-medium' : 'text-[13px] font-semibold'}
          style={{ color }}
          maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
        >
          {name}
        </Text>
      </Pressable>
    );
  };

  const groupTitle = (label: string) => (
    <Text
      className="mb-2 text-xs font-semibold uppercase"
      style={[{ color: colors.textSecondary, letterSpacing: 0.4 }, textStyle]}
      maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
    >
      {label}
    </Text>
  );

  const steps = open ? applianceSteps(open, instructions) : [];

  return (
    <View className="mb-5" testID="recipe-appliances">
      <Text
        className="mb-3 text-lg font-bold"
        style={[{ color: colors.text }, textStyle]}
        accessibilityRole="header"
      >
        {t('appliances.title')}
      </Text>

      {appliances.length === 0 ? (
        <Text testID="appliances-none" className="text-sm" style={[{ color: colors.textSecondary }, textStyle]}>
          {t('appliances.none')}
        </Text>
      ) : null}

      {required.length > 0 ? (
        <View className="mb-3" testID="appliances-required">
          {groupTitle(t('appliances.required'))}
          <View className="flex-row flex-wrap gap-2">{required.map(chip)}</View>
        </View>
      ) : null}

      {better.length > 0 ? (
        <View testID="appliances-better">
          {groupTitle(t('appliances.better'))}
          <View className="gap-2">
            {better.map((item) => (
              <View key={item.key} className="flex-row flex-wrap items-center gap-2">
                {chip(item)}
                {item.origin === 'tip' ? (
                  <View
                    testID={`appliance-tip-${item.key}`}
                    className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ backgroundColor: colors.accentSoft }}
                  >
                    <Ionicons name="bulb-outline" size={12} color={colors.accent} />
                    <Text className="text-[11px] font-semibold" style={{ color: colors.accent }} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
                      {t('appliances.pinchTip')}
                    </Text>
                  </View>
                ) : null}
                {describe(item) ? (
                  <Text className="shrink text-xs" style={[{ color: colors.textSecondary }, textStyle]}>
                    {describe(item)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <SheetModal
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open ? t(applianceNameKey(open.key)) : ''}
      >
        {open ? (
          <View className="gap-3 px-5 pb-6" testID="appliance-sheet">
            <View className="flex-row items-center gap-2">
              <ApplianceIcon appliance={open.key} size={22} color={colors.primary} />
              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                {kindLabel(open)}
              </Text>
            </View>
            {describe(open) ? (
              <Text className="text-sm" style={[{ color: colors.textSecondary }, textStyle]}>
                {describe(open)}
              </Text>
            ) : null}
            {open.origin === 'tip' ? (
              <Text className="text-sm" style={[{ color: colors.textSecondary }, textStyle]}>
                {t('appliances.pinchTipExplainer')}
              </Text>
            ) : null}
            {steps.length > 0 ? (
              <View className="gap-2">
                <Text className="text-sm font-semibold" style={[{ color: colors.text }, textStyle]}>
                  {t(steps.length === 1 ? 'appliances.usedInStepOne' : 'appliances.usedInStepOther', {
                    steps: steps.map((s) => s.step).join(', '),
                  })}
                </Text>
                {steps.map((s) => (
                  <Text
                    key={s.step}
                    testID={`appliance-step-${s.step}`}
                    className="text-sm leading-5"
                    style={[{ color: colors.text }, stepStyle]}
                  >
                    {`${s.step}. ${s.text}`}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </SheetModal>
    </View>
  );
}
