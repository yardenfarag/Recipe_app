import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ApplianceIcon } from '@/components/ApplianceIcon';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import {
  applianceAlternativeKey,
  applianceNameKey,
  applianceSteps,
  groupAppliances,
  isBasicAppliance,
} from '@shared/lib/applianceDisplay';
import type { RecipeAppliance } from '@shared/lib/appliances';
import { applianceFit, type KitchenAppliances } from '@shared/lib/ownedAppliances';

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
  /**
   * A hand edit is recalculating the list (ADR 018). The current list keeps showing, with
   * "Updating…" beside the title; with no list yet (a written recipe), only the title and that.
   */
  updating?: boolean;
  /**
   * The reader's "My appliances" (PIN-155), or null when they never saved a list: then nothing is marked. Once saved,
   * an appliance they have gets a tick and a required one they don't gets the warning colour.
   */
  kitchen?: KitchenAppliances | null;
  /** More at the bottom of the tile: what the reader's kitchen covers (the recipe page's kitchen check). */
  footer?: ReactNode;
};

/** "What you'll need" (ADR 017 decision 4) as a tile (PIN-177): Required, then "Makes it better" with benefits and tips. */
export function RecipeAppliances({
  appliances,
  instructions,
  stepDirection,
  updating = false,
  kitchen = null,
  footer,
}: RecipeAppliancesProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const [open, setOpen] = useState<RecipeAppliance | null>(null);

  if (appliances === null && !updating) return null;

  const { required, better } = groupAppliances(appliances ?? []);
  const updatingNote = updating ? (
    <Text
      testID="appliances-updating"
      variant="caption"
      weight="medium"
      tone="muted"
      accessibilityLabel={`${t('appliances.title')}, ${t('recipeEditor.updating')}`}
      accessibilityState={{ busy: true }}
    >
      {t('recipeEditor.updating')}
    </Text>
  ) : null;
  const stepStyle = stepDirection
    ? { writingDirection: stepDirection, textAlign: stepDirection === 'rtl' ? ('right' as const) : ('left' as const) }
    : undefined;

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
    const fit = applianceFit(item, kitchen);
    // A required appliance the reader doesn't have (and has no stand-in for) is the one thing worth a warning.
    const warn = fit === 'missing' && item.required;
    const filled = item.required && !basic && !warn;
    const color = warn ? colors.text : filled ? colors.primaryText : colors.textSecondary;
    const iconColor = warn ? colors.warning : filled ? colors.primaryText : colors.textSecondary;
    const fitLabel =
      fit === 'owned' ? t('myAppliances.inKitchen') : fit ? t('myAppliances.notInKitchen') : null;
    const detail = [fitLabel, describe(item)].filter(Boolean).join(', ');
    return (
      <Pressable
        key={item.key}
        trackId="recipe.appliance.open"
        testID={`appliance-chip-${item.key}`}
        onPress={() => setOpen(item)}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={[name, kindLabel(item), detail].filter(Boolean).join(', ')}
        accessibilityHint={t('appliances.chipHint')}
        style={({ pressed }) => ({
          minHeight: 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          borderRadius: Radii.pill,
          borderWidth: warn || filled ? 0 : HAIRLINE,
          borderColor: colors.border,
          backgroundColor: warn
            ? colors.warningSoft
            : filled
              ? colors.primarySoft
              : pressed
                ? colors.backgroundElement
                : 'transparent',
          opacity: pressed && (warn || filled) ? 0.85 : 1,
        })}
      >
        <ApplianceIcon appliance={item.key} size={basic ? 15 : 17} color={iconColor} />
        <Text color={color} style={{ ...type.font('body', basic ? 'medium' : 'semibold'), fontSize: 13, lineHeight: 17 }}>
          {name}
        </Text>
        {fit === 'owned' ? <KitIcon icon="checkmark" size={14} color={colors.success} /> : null}
        {warn ? <KitIcon icon="alert-circle" size={14} color={colors.warning} /> : null}
      </Pressable>
    );
  };

  const steps = open ? applianceSteps(open, instructions) : [];

  return (
    <Tile padding={20} style={{ gap: 14 }} testID="recipe-appliances">
      <View style={{ gap: 2 }}>
        <Text variant="h3">{t('appliances.title')}</Text>
        {updatingNote}
      </View>

      {appliances?.length === 0 ? (
        <Text testID="appliances-none" variant="bodySmall" tone="muted">
          {t('appliances.none')}
        </Text>
      ) : null}

      {required.length > 0 ? (
        <View testID="appliances-required" style={{ gap: 8 }}>
          <TileLabel>{t('appliances.required')}</TileLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{required.map(chip)}</View>
        </View>
      ) : null}

      {better.length > 0 ? (
        <View testID="appliances-better" style={{ gap: 8 }}>
          <TileLabel>{t('appliances.better')}</TileLabel>
          <View style={{ gap: 8 }}>
            {better.map((item) => (
              <View key={item.key} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {chip(item)}
                {item.origin === 'tip' ? (
                  <View
                    testID={`appliance-tip-${item.key}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: Radii.pill,
                      backgroundColor: colors.accentSoft,
                    }}
                  >
                    <KitIcon icon="bulb-outline" size={12} color={colors.accentText} />
                    <Text tone="accent" style={{ ...type.font('body', 'semibold'), fontSize: 11, lineHeight: 14 }}>
                      {t('appliances.pinchTip')}
                    </Text>
                  </View>
                ) : null}
                {describe(item) ? (
                  <Text variant="caption" tone="muted" style={{ flexShrink: 1 }}>
                    {describe(item)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {footer}

      <SheetModal
        trackId="recipe.appliances.sheet"
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open ? t(applianceNameKey(open.key)) : ''}
      >
        {open ? (
          <View style={{ gap: 12, paddingHorizontal: 20, paddingBottom: 24 }} testID="appliance-sheet">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ApplianceIcon appliance={open.key} size={22} color={colors.primaryText} />
              <Text variant="bodySmall" weight="semibold">
                {kindLabel(open)}
              </Text>
            </View>
            {describe(open) ? (
              <Text variant="bodySmall" tone="muted">
                {describe(open)}
              </Text>
            ) : null}
            {open.origin === 'tip' ? (
              <Text variant="bodySmall" tone="muted">
                {t('appliances.pinchTipExplainer')}
              </Text>
            ) : null}
            {steps.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text variant="bodySmall" weight="semibold">
                  {t(steps.length === 1 ? 'appliances.usedInStepOne' : 'appliances.usedInStepOther', {
                    steps: steps.map((s) => s.step).join(', '),
                  })}
                </Text>
                {steps.map((s) => (
                  <Text key={s.step} testID={`appliance-step-${s.step}`} variant="bodySmall" style={stepStyle}>
                    {`${s.step}. ${s.text}`}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </SheetModal>
    </Tile>
  );
}
