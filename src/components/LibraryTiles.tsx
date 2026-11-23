import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { PhotoTile, Tile, TileBadge, TileLabel } from '@/components/ui/Tile';
import { KitIcon, Radii, usePhotoColors, withAlpha, type IconSource } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { recipeImageSource } from '@/lib/recipeImageSource';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import { recipeSource } from '@shared/lib/recipeSource';
import { getRecipeVideoInfo } from '@shared/lib/recipeVideo';
import { fetchRecipesCookedSince, type CookedRecipe } from '@shared/lib/supabase/recipes';
import {
  nextTonightsPick,
  pickDay,
  recipesCookedWithin,
  tonightsPick,
  type TonightsPickMemory,
} from '@shared/lib/tonightsPick';
import type { Recipe } from '@shared/types/recipe';

const PICK_KEY = 'pinch:tonightsPick';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The tall tile at the top of the Library, and the two small ones under it. */
export const TONIGHT_TILE_HEIGHT = 300;
export const SMALL_TILE_HEIGHT = 104;

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
 * What was cooked in the last seven days, most recent first (web/lib/library/useCookedThisWeek.ts). Asked for on its
 * own when signed in, since the Library loads a page at a time; the loaded recipes win where they differ. `version`
 * changes when the library does (its total), so a deleted recipe drops out.
 */
export function useCookedThisWeek(recipes: Recipe[], version: number): CookedRecipe[] {
  const { user } = useAuth();
  const userId = user?.id;
  const [now] = useState(() => new Date());
  const [fetched, setFetched] = useState<CookedRecipe[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchRecipesCookedSince(new Date(now.getTime() - WEEK_MS).toISOString())
      .then((rows) => {
        if (!cancelled) setFetched(rows);
      })
      .catch(() => {
        // The tile falls back to the recipes already loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, now, version]);

  return useMemo(() => {
    const loadedIds = new Set(recipes.map((recipe) => recipe.id));
    const loaded: CookedRecipe[] = recipesCookedWithin(recipes, now).map((recipe) => ({
      id: recipe.id,
      title: recipe.display_title ?? recipe.title,
      image_url: recipe.image_url,
      last_cooked_at: recipe.last_cooked_at,
    }));
    const others = userId ? fetched.filter((recipe) => !loadedIds.has(recipe.id)) : [];
    return [...loaded, ...others].sort(
      (a, b) => Date.parse(b.last_cooked_at ?? '') - Date.parse(a.last_cooked_at ?? ''),
    );
  }, [recipes, fetched, now, userId]);
}

/**
 * The top of the Library (PIN-177, after the web's KitchenTiles): tonight's pick across the width, then what was
 * cooked this week and the shopping list side by side.
 */
export function KitchenTiles({
  pick,
  onAnother,
  cooked,
}: {
  pick: Recipe | null;
  onAnother: (() => void) | null;
  cooked: CookedRecipe[];
}) {
  return (
    <View style={{ gap: 12 }}>
      {pick ? (
        <TonightTile recipe={pick} onAnother={onAnother} />
      ) : (
        <Tile tone="element" style={{ height: TONIGHT_TILE_HEIGHT }} />
      )}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <CookedTile cooked={cooked} style={{ flex: 1 }} />
        <ListTile style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Grey outlines of the tiles while the Library loads. */
export function KitchenTilesSkeleton() {
  return (
    <View style={{ gap: 12 }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Tile tone="element" style={{ height: TONIGHT_TILE_HEIGHT }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile tone="element" style={{ flex: 1, height: SMALL_TILE_HEIGHT }} />
        <Tile tone="element" style={{ flex: 1, height: SMALL_TILE_HEIGHT }} />
      </View>
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
function TonightTile({ recipe, onAnother }: { recipe: Recipe; onAnother: (() => void) | null }) {
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
        accessibilityLabel={`${t('web.library.tonightsPick')}: ${title}`}
        accessibilityHint={t('web.library.openRecipe')}
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          pressed ? { backgroundColor: withAlpha(photo.scrim, 0.12) } : null,
        ]}
      />
      <View pointerEvents="none" style={{ gap: 8 }}>
        <TileBadge tone="photo">{t('web.library.tonightsPick')}</TileBadge>
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

/** How many recipes were cooked in the last seven days, with the photos of the latest three. */
function CookedTile({ cooked, style }: { cooked: CookedRecipe[]; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const faces = cooked.slice(0, 3);
  return (
    <Tile
      accessible
      accessibilityLabel={t('web.library.cookedThisWeekCount', { count: cooked.length })}
      style={[{ height: SMALL_TILE_HEIGHT, padding: 14, justifyContent: 'space-between' }, style]}
    >
      <TileLabel numberOfLines={1}>{t('web.library.cookedThisWeek')}</TileLabel>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <Text
          variant="number"
          style={{ fontSize: 40, lineHeight: 42, letterSpacing: type.tracking(-0.03, 40) }}
        >
          {cooked.length}
        </Text>
        {faces.length > 0 ? (
          <View style={{ flexDirection: 'row', paddingBottom: 2 }}>
            {faces.map((recipe, index) => (
              <View
                key={recipe.id}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: colors.surface,
                  backgroundColor: colors.backgroundElement,
                  marginStart: index > 0 ? -10 : 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {recipe.image_url ? (
                  <Image
                    source={recipeImageSource(recipe.image_url)}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    recyclingKey={recipe.image_url}
                  />
                ) : (
                  <CookieMark size={16} color={colors.primaryText} />
                )}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Tile>
  );
}

/** The shopping list in a tile: how many items are left and the first two. Opens the List tab. */
function ListTile({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { items, loading } = useShoppingList();
  const left = items.filter((item) => !item.checked);
  const label = left.length > 0 ? t('web.library.listLeft', { count: left.length }) : t('tabs.list');
  const summary =
    left.length > 0
      ? [
          ...left.slice(0, 2).map((item) => item.name),
          left.length > 2 ? t('web.library.listMore', { count: left.length - 2 }) : null,
        ]
          .filter(Boolean)
          .join(', ')
      : items.length > 0
        ? t('web.library.listDone')
        : t('web.library.listEmpty');

  return (
    <Tile
      onPress={() => router.push('/list')}
      trackId="library.list_tile.open"
      accessibilityLabel={loading ? t('web.library.listOpen') : `${label}. ${summary}`}
      accessibilityHint={t('web.library.listOpen')}
      style={[{ height: SMALL_TILE_HEIGHT, padding: 14, gap: 6 }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <TileLabel numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </TileLabel>
        <ListChevron />
      </View>
      <Text
        numberOfLines={2}
        weight="semibold"
        tone={left.length > 0 ? 'default' : 'muted'}
        style={{ fontSize: 14, lineHeight: 19 }}
      >
        {loading ? ' ' : summary}
      </Text>
    </Tile>
  );
}

function ListChevron() {
  const { colors } = useThemePreference();
  return <KitIcon icon="chevron-forward" color={colors.textSecondary} size={14} />;
}
