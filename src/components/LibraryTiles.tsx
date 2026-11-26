import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { PhotoTile, Tile, TileBadge } from '@/components/ui/Tile';
import { KitIcon, Radii, usePhotoColors, withAlpha, type IconSource } from '@/components/ui/tokens';
import { useTypography } from '@/hooks/useTypography';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import { recipeSource } from '@shared/lib/recipeSource';
import { getRecipeVideoInfo } from '@shared/lib/recipeVideo';
import { nextTonightsPick, pickDay, tonightsPick, type TonightsPickMemory } from '@shared/lib/tonightsPick';
import type { Recipe } from '@shared/types/recipe';

const PICK_KEY = 'pinch:tonightsPick';

/** The tall tile at the top of the Library. */
export const TONIGHT_TILE_HEIGHT = 300;

function parseMemory(raw: string | null): TonightsPickMemory | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TonightsPickMemory>;
    return typeof value.day === 'string' && typeof value.recipeId === 'string'
      ? { day: value.day, recipeId: value.recipeId }
      : null;
  } catch {
    return null;
  }
}

/**
 * Tonight's pick, as on the web (web/lib/library/useTonightsPick.ts): chosen by the shared rule
 * (shared/lib/tonightsPick.ts), kept on this device for the day so coming back shows the same recipe, and moved on
 * by "Show me another". `another` is null when there is nothing else to offer. Nothing is picked until the
 * remembered pick has been read, so the tile doesn't change under the finger.
 */
export function useTonightsPick(recipes: Recipe[]): { pick: Recipe | null; another: (() => void) | null } {
  const [now] = useState(() => new Date());
  // undefined while the remembered pick is being read.
  const [memory, setMemory] = useState<TonightsPickMemory | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PICK_KEY)
      .then((raw) => {
        if (active) setMemory(parseMemory(raw));
      })
      .catch(() => {
        if (active) setMemory(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const remember = useCallback((next: TonightsPickMemory) => {
    setMemory(next);
    void AsyncStorage.setItem(PICK_KEY, JSON.stringify(next)).catch(() => {
      // Kept for this visit only.
    });
  }, []);

  const pick = useMemo(
    () => (memory === undefined ? null : tonightsPick(recipes, now, memory)),
    [recipes, now, memory],
  );
  const next = useMemo(() => (pick ? nextTonightsPick(recipes, now, pick.id) : null), [recipes, now, pick]);

  // Remember what is showing, so it stays when more recipes load or the Library is opened again today.
  const pickId = pick?.id;
  useEffect(() => {
    if (!pickId || memory === undefined) return;
    const day = pickDay(now);
    if (memory?.day === day && memory.recipeId === pickId) return;
    remember({ day, recipeId: pickId });
  }, [pickId, now, memory, remember]);

  const nextId = next?.id;
  const another = useCallback(() => {
    if (nextId) remember({ day: pickDay(now), recipeId: nextId });
  }, [nextId, now, remember]);

  return { pick, another: nextId ? another : null };
}

/**
 * The top of the Library (PIN-177): tonight's pick across the width. Unlike the web, the phone has no "Cooked this
 * week" or List tiles under it: List has its own tab, and the recipes come up sooner without them.
 */
export function TonightsPick({ pick, onAnother, planned = false }: { pick: Recipe | null; onAnother: (() => void) | null; planned?: boolean }) {
  return pick ? (
    <TonightTile recipe={pick} onAnother={onAnother} planned={planned} />
  ) : (
    <Tile tone="element" style={{ height: TONIGHT_TILE_HEIGHT }} />
  );
}

/** A grey outline of tonight's pick while the Library loads. */
export function TonightsPickSkeleton() {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Tile tone="element" style={{ height: TONIGHT_TILE_HEIGHT }} />
    </View>
  );
}

/** A 48-tall button on a photo: filled in the on-scrim colour, or a translucent square for an icon. */
function PhotoActionButton({
  label,
  icon,
  filled,
  onPress,
  trackId,
  style,
}: {
  label: string;
  icon?: IconSource;
  filled?: boolean;
  onPress: () => void;
  trackId: string;
  style?: StyleProp<ViewStyle>;
}) {
  const photo = usePhotoColors();
  const type = useTypography();
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          height: 48,
          minWidth: 48,
          borderRadius: Radii.control,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: filled ? 20 : 0,
          backgroundColor: filled
            ? photo.onScrim
            : withAlpha(photo.onScrim, pressed ? 0.28 : 0.16),
        },
        filled && pressed ? { opacity: 0.88 } : null,
        style,
      ]}
    >
      {icon ? (
        <KitIcon icon={icon} color={photo.onScrim} size={20} />
      ) : (
        <Text
          numberOfLines={1}
          color={photo.scrim}
          style={{
            ...type.font('display', 'bold'),
            fontSize: 15,
            lineHeight: 19,
            letterSpacing: type.tracking(-0.01, 15),
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Tonight's pick: the photo, the name, how long and where it came from, and the ways to start. */
function TonightTile({ recipe, onAnother, planned }: { recipe: Recipe; onAnother: (() => void) | null; planned: boolean }) {
  const { t } = useTranslation();
  const photo = usePhotoColors();
  const type = useTypography();
  const title = recipe.display_title ?? recipe.title;
  const hasVideo =
    getRecipeVideoInfo(recipe.original_url, recipe.platform, recipe.source_video_url).mode !== 'none';

  const source = recipeSource(recipe);
  const sourceText = source
    ? source.platform === 'photo'
      ? t('web.library.savedFromPhoto')
      : t('web.library.savedFrom', {
          source: [source.name ?? t('web.library.sourceWebsite'), source.handle].filter(Boolean).join(' '),
        })
    : null;
  const meta = [
    recipe.estimated_time_minutes != null
      ? formatRecipeDuration(recipe.estimated_time_minutes, {
          minutes: t('recipe.durationMin'),
          hours: t('recipe.durationHr'),
        })
      : null,
    recipe.effort_level ? t(`recipe.effort.${recipe.effort_level.toLowerCase()}`) : null,
    sourceText,
  ].filter(Boolean) as string[];

  // A long name gets smaller type, so three lines of it still leave room for the buttons.
  const titleSize = title.length > 26 ? 26 : 30;

  return (
    <PhotoTile
      src={recipe.image_url}
      fallback={<CookieMark size={88} color={photo.onScrimMuted} />}
      fade="strong"
      style={{ height: TONIGHT_TILE_HEIGHT }}
      contentStyle={{ padding: 18, gap: 8 }}
    >
      {/* The whole photo opens the recipe; the words over it let touches through to it. */}
      <Pressable
        trackId="library.tonight.open"
        onPress={() => router.push(`/recipe/${recipe.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${planned ? t('plan.tonightPlanned') : t('web.library.tonightsPick')}: ${title}`}
        accessibilityHint={t('web.library.openRecipe')}
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          pressed ? { backgroundColor: withAlpha(photo.scrim, 0.12) } : null,
        ]}
      />
      <View pointerEvents="none" style={{ gap: 8 }}>
        <TileBadge tone="photo">{planned ? t('plan.tonightPlanned') : t('web.library.tonightsPick')}</TileBadge>
        <Text
          accessibilityRole="header"
          numberOfLines={3}
          tone="onScrim"
          style={{
            ...type.font('display', 'bold'),
            fontSize: titleSize,
            lineHeight: Math.round(titleSize * (type.rtl ? 1.2 : 1.05)),
            letterSpacing: type.tracking(-0.03, titleSize),
          }}
        >
          {title}
        </Text>
        {meta.length > 0 ? (
          <Text variant="caption" tone="onScrimMuted" numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }} pointerEvents="box-none">
        <PhotoActionButton
          filled
          label={t('web.library.startCooking')}
          trackId="library.tonight.start_cooking"
          onPress={() => router.push(`/recipe/${recipe.id}?cook=1`)}
          style={{ flex: 1 }}
        />
        {hasVideo ? (
          <PhotoActionButton
            label={t('web.library.cookAlongVideo')}
            icon="play"
            trackId="library.tonight.cook_along"
            onPress={() => router.push(`/recipe/${recipe.id}?video=1`)}
          />
        ) : null}
        {onAnother ? (
          <PhotoActionButton
            label={t('web.library.showAnother')}
            icon="shuffle"
            trackId="library.tonight.another"
            onPress={onAnother}
          />
        ) : null}
      </View>
    </PhotoTile>
  );
}
