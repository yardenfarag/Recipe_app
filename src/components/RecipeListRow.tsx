import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AvoidFlagChip, type AvoidFlag } from '@/components/AvoidFlagChip';
import { ApplianceIcon } from '@/components/ApplianceIcon';
import { CookieMark } from '@/components/CookieMark';
import { RecipeImage } from '@/components/RecipeImage';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii, usePhotoColors, withAlpha } from '@/components/ui/tokens';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { applianceNameKey, cardApplianceKeys } from '@shared/lib/applianceDisplay';
import { recipeAppliancesOf } from '@shared/lib/appliances';
import { COST_I18N_KEYS } from '@shared/lib/formatCostEstimate';
import { formatCookedDate } from '@shared/lib/formatCookedDate';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import { recipeOriginChip } from '@shared/lib/recipeOrigin';
import { recipeSource } from '@shared/lib/recipeSource';
import { Recipe } from '@shared/types/recipe';

interface RecipeListRowProps {
  recipe: Recipe;
  onPress: () => void;
  /** Long-press opens the recipe actions menu (same as ⋯). */
  onLongPress?: () => void;
  /** Overflow menu (add to collection / rename / delete). */
  onMore?: () => void;
  onToggleFavorite?: () => void;
  /** Stagger entrance delay index (list position). */
  index?: number;
  /** `card`: a square photo with the name under it, for a grid. `row`: a thumbnail beside the name. */
  variant?: 'row' | 'card';
  /** Skip enter animation while the parent list is flipping layout. */
  animateEnter?: boolean;
  /** Secondary line under the title, such as a hub source and save count. */
  detail?: string;
  /** Foods from the cook's avoid list, on a Hub card (PIN-180). */
  flag?: AvoidFlag;
  /**
   * Prefix for the admin Activity log ids: `<trackId>.open`, `.favorite`,
   * `.more`. A fixed string, like 'library.recipe'.
   */
  trackId?: string;
}

/** Photo corners in a card (as on the web's phone grid) and a row's thumbnail. */
const CARD_PHOTO_RADIUS = 18;
const ROW_PHOTO_SIZE = 72;

/**
 * One recipe in the Library or the Hub (Night Market, PIN-177; the web's RecipeCard). A card is the photo, with a
 * chip saying where the recipe came from, and the name and facts under it with no box around them; a row is a
 * surface tile with a 72 px thumbnail. The heart and the menu are their own buttons.
 */
export const RecipeListRow = memo(function RecipeListRow({
  recipe,
  onPress,
  onLongPress,
  onMore,
  onToggleFavorite,
  index = 0,
  variant = 'row',
  trackId = 'recipe_row',
  animateEnter = true,
  detail,
  flag,
}: RecipeListRowProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const photo = usePhotoColors();
  const type = useTypography();
  const { language } = useLanguagePreference();
  const isFavorite = recipe.is_favorite === true;
  const card = variant === 'card';

  const timeLabel =
    recipe.estimated_time_minutes != null
      ? formatRecipeDuration(recipe.estimated_time_minutes, {
          minutes: t('recipe.durationMin'),
          hours: t('recipe.durationHr'),
        })
      : null;
  const effortLabel = recipe.effort_level ? t(`recipe.effort.${recipe.effort_level.toLowerCase()}`) : null;
  const costLabel = recipe.cost_estimate ? t(COST_I18N_KEYS[recipe.cost_estimate]) : null;
  const cookedDate = recipe.last_cooked_at ? formatCookedDate(recipe.last_cooked_at, language) : null;
  const cookedLabel = cookedDate ? t('recipe.cookedShort', { date: cookedDate }) : null;
  const meta = [timeLabel, effortLabel, costLabel, cookedLabel].filter(Boolean) as string[];

  // ADR 017: only special, required appliances from the recipe; never basics or Pinch tips.
  const neededKeys = cardApplianceKeys(recipeAppliancesOf(recipe));
  const needsLabel =
    neededKeys.length > 0
      ? t('appliances.needs', { names: neededKeys.map((key) => t(applianceNameKey(key))).join(', ') })
      : null;

  const title = recipe.display_title ?? recipe.title;
  const originChip = recipeOriginChip(recipe);
  const originLabel =
    originChip === 'invented'
      ? t('recipe.inventedChip')
      : originChip === 'written'
        ? t('recipeEditor.originChip')
        : null;

  // "TikTok", "Instagram"… or, for a website or a photo, the plain word.
  const source = recipeSource(recipe);
  const sourceLabel = source
    ? source.platform === 'photo'
      ? t('web.library.sourcePhoto')
      : source.platform === 'web'
        ? t('web.library.sourceWebsite')
        : source.name
    : null;

  // One VoiceOver/TalkBack stop per recipe instead of a fragment per line.
  const rowLabel = [title, detail, originLabel, timeLabel, effortLabel, costLabel, cookedLabel, needsLabel, flag?.label]
    .filter(Boolean)
    .join(', ');

  const picture = recipe.image_url ? (
    <RecipeImage
      uri={recipe.image_url}
      variant={card ? 'compact' : 'thumb'}
      aiGenerated={recipe.image_generated}
      borderRadius={card ? CARD_PHOTO_RADIUS : Radii.inner}
      style={card ? { width: '100%', height: '100%' } : { width: ROW_PHOTO_SIZE, height: ROW_PHOTO_SIZE }}
    />
  ) : (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: card ? '100%' : ROW_PHOTO_SIZE,
        height: card ? '100%' : ROW_PHOTO_SIZE,
        borderRadius: card ? CARD_PHOTO_RADIUS : Radii.inner,
        backgroundColor: colors.backgroundElement,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CookieMark size={card ? 44 : 28} color={colors.primaryText} />
    </View>
  );

  const facts = (
    <>
      {detail ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {originLabel ? (
        <View
          style={{
            alignSelf: 'flex-start',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
            backgroundColor: originChip === 'written' ? colors.primarySoft : colors.accentSoft,
          }}
        >
          <Text
            color={originChip === 'written' ? colors.primaryText : colors.accentText}
            style={{ ...type.font('body', 'bold'), fontSize: 11, lineHeight: 15 }}
          >
            {originLabel}
          </Text>
        </View>
      ) : null}
      {meta.length > 0 ? (
        <Text variant="caption" tone="muted" numberOfLines={card ? 1 : 2}>
          {meta.join(' · ')}
        </Text>
      ) : null}
      {needsLabel ? (
        <View testID="recipe-row-needs" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ApplianceIcon appliance={neededKeys[0]} size={card ? 12 : 14} color={colors.textSecondary} />
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {needsLabel}
          </Text>
        </View>
      ) : null}
      {flag ? <AvoidFlagChip flag={flag} /> : null}
    </>
  );

  const titleText = (
    <Text
      numberOfLines={2}
      style={{
        ...type.font('display', 'bold'),
        fontSize: 16,
        lineHeight: type.rtl ? 22 : 20,
        letterSpacing: type.tracking(-0.01, 16),
      }}
    >
      {title}
    </Text>
  );

  const favoriteButton =
    onToggleFavorite != null ? (
      <IconButton
        variant={card ? 'photo' : 'ghost'}
        icon={isFavorite ? 'heart' : 'heart-outline'}
        color={isFavorite ? (card ? photo.onScrim : colors.primaryText) : undefined}
        label={
          isFavorite
            ? t('a11y.removeRecipeFromFavorites', { name: title })
            : t('a11y.addRecipeToFavorites', { name: title })
        }
        selected={isFavorite}
        trackId={`${trackId}.favorite`}
        onPress={onToggleFavorite}
      />
    ) : null;

  const moreButton =
    onMore != null ? (
      <IconButton
        variant={card ? 'photo' : 'ghost'}
        icon="ellipsis-vertical"
        iconSize={18}
        label={t('a11y.recipeActionsFor', { name: title })}
        trackId={`${trackId}.more`}
        onPress={onMore}
      />
    ) : null;

  const openProps = {
    trackId: `${trackId}.open`,
    onPress,
    onLongPress,
    accessibilityRole: 'button' as const,
    accessibilityLabel: rowLabel,
    accessibilityActions: onLongPress ? [{ name: 'longpress', label: t('library.recipeActions') }] : undefined,
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'longpress') onLongPress?.();
    },
  };

  const entering = animateEnter ? FadeInDown.delay(Math.min(index * 60, 360)).springify() : undefined;

  if (card) {
    return (
      <Animated.View entering={entering} style={{ flex: 1, minWidth: 0 }}>
        <Pressable {...openProps} style={({ pressed }) => [{ gap: 10 }, pressed ? { opacity: 0.9 } : null]}>
          <View
            style={{
              width: '100%',
              aspectRatio: 1,
              borderRadius: CARD_PHOTO_RADIUS,
              overflow: 'hidden',
              backgroundColor: colors.backgroundElement,
            }}
          >
            {picture}
            {sourceLabel ? (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  start: 8,
                  maxWidth: '60%',
                  borderRadius: Radii.pill,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  backgroundColor: withAlpha(photo.scrim, 0.7),
                }}
              >
                <Text
                  numberOfLines={1}
                  tone="onScrim"
                  style={{ ...type.font('body', 'semibold'), fontSize: 12, lineHeight: 15 }}
                >
                  {sourceLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ gap: 4, paddingHorizontal: 2 }}>
            {titleText}
            {facts}
          </View>
        </Pressable>
        {favoriteButton || moreButton ? (
          // Over the photo, each on its own dark backing: the heart at the top corner, the menu at the bottom one.
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', top: 0, start: 0, end: 0, aspectRatio: 1 }}
          >
            {favoriteButton ? (
              <View style={{ position: 'absolute', top: 6, end: 6 }}>{favoriteButton}</View>
            ) : null}
            {moreButton ? <View style={{ position: 'absolute', bottom: 6, end: 6 }}>{moreButton}</View> : null}
          </View>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderRadius: Radii.card,
          borderWidth: HAIRLINE,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 10,
          paddingEnd: 4,
        }}
      >
        <Pressable
          {...openProps}
          style={({ pressed }) => [
            { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          {picture}
          <View style={{ flex: 1, minWidth: 0, gap: 3, paddingVertical: 2 }}>
            {titleText}
            {facts}
          </View>
        </Pressable>
        {favoriteButton || moreButton ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {favoriteButton}
            {moreButton}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});
