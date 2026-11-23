import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { CookieMark } from '@/components/CookieMark';
import { RecipeImage } from '@/components/RecipeImage';
import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pressable } from '@/components/ui/Pressable';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, Radii, usePhotoColors, withAlpha, type IconName } from '@/components/ui/tokens';
import { useCookingHub } from '@/hooks/useCookingHub';
import { useLibraryLayout } from '@/hooks/useLibraryLayout';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { announce } from '@/lib/a11y';
import { logTap } from '@/lib/interactionLog';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import { hubCardDetail, HUB_PLATFORMS, platformLabelKey } from '@shared/lib/hubCards';
import { recipeCardToListRecipe } from '@shared/lib/recipeCardMap';
import { translateRecipeTag } from '@shared/lib/recipeTags';
import type { RecipeCard } from '@shared/types/recipeCard';
import type { Recipe } from '@shared/types/recipe';

const SEARCH_HEIGHT = 52;
/** Space between the columns of the grid, and half of it around each card. */
const GRID_GAP = 12;

/**
 * Cooking Hub (Night Market, PIN-177; the web's Hub page): recipes other people already snapped from public links.
 * Search, the popular tags as chips, the source and sort behind Filter, and the recipes as photo cards in a grid
 * (or rows, the Library's choice).
 */
export default function CookingHubScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const { textAlign, writingDirection } = useRtl();
  // The Hub is for browsing photos: a grid on phones too, unless the Library's grid/list choice says otherwise.
  const { layout, numColumns, setLayout } = useLibraryLayout('grid');
  const {
    cards,
    loading,
    querying,
    refreshing,
    loadingMore,
    error,
    total,
    listEpoch,
    search,
    setSearch,
    selectedTags,
    toggleTag,
    clearTags,
    sort,
    setSort,
    platform,
    setPlatform,
    availableTags,
    refresh,
    pullRefresh,
    loadMore,
  } = useCookingHub();

  const rows = useMemo(
    () => cards.map((card) => ({ card, recipe: recipeCardToListRecipe(card) })),
    [cards],
  );
  const listRef = useRef<FlatList<(typeof rows)[number]>>(null);
  // The tags are always on show; Filter holds the source and the sort.
  const sourceOrSortSet = sort !== 'popular' || platform !== 'all';
  const filtersActive = selectedTags.length > 0 || sourceOrSortSet;
  const [filtersOpen, setFiltersOpen] = useState(sourceOrSortSet);
  const hasQuery = Boolean(search.trim());
  const showSearching = loading || querying;
  const grid = layout === 'grid';

  const showInlineError = Boolean(error) && cards.length > 0;
  useEffect(() => {
    if (error && !showSearching) announce(error);
  }, [error, showSearching]);

  useEffect(() => {
    if (listEpoch === 0) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [listEpoch]);

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const remaining = contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (remaining < 480) loadMore();
    },
    [loadMore],
  );

  const count = total || cards.length;

  const header = (
    <View style={{ gap: 14, paddingBottom: 16 }}>
      <PageHeader title={t('hub.title')} subtitle={t('hub.subtitle')} style={{ paddingBottom: 6 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            height: SEARCH_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingStart: 14,
            paddingEnd: 4,
            borderRadius: Radii.inner,
            borderWidth: HAIRLINE,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={colors.textSecondary}
            accessible={false}
            importantForAccessibility="no"
          />
          <TextInput
            accessibilityLabel={t('hub.searchPlaceholder')}
            style={[
              type.font('body', 'regular'),
              { flex: 1, minWidth: 0, height: SEARCH_HEIGHT, fontSize: 16, color: colors.text, textAlign, writingDirection },
            ]}
            value={search}
            onChangeText={setSearch}
            placeholder={t('hub.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <IconButton
              icon="close-circle"
              iconSize={18}
              label={t('library.clearSearch')}
              trackId="hub.search.clear"
              onPress={() => setSearch('')}
            />
          ) : null}
        </View>
        <SegmentedControl
          label={`${t('library.showGrid')} / ${t('library.showList')}`}
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'grid', label: t('library.showGrid'), icon: 'grid-outline', iconOnly: true, trackId: 'hub.layout.grid' },
            { value: 'list', label: t('library.showList'), icon: 'list-outline', iconOnly: true, trackId: 'hub.layout.list' },
          ]}
        />
      </View>

      {/* Filter, then the popular tags, in one row that scrolls sideways. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
      >
        <Chip
          trackId="hub.filter.toggle"
          icon="options-outline"
          selected={filtersOpen || sourceOrSortSet}
          onPress={() => setFiltersOpen((open) => !open)}
          accessibilityLabel={
            sourceOrSortSet ? `${t('library.toggleFilters')}, ${t('a11y.filtersApplied')}` : t('library.toggleFilters')
          }
        >
          {t('library.filter')}
        </Chip>
        {selectedTags.length > 0 ? (
          <Chip trackId="hub.filter.tags.clear" icon="close" onPress={clearTags} accessibilityLabel={t('a11y.clearTags')}>
            {t('common.clear')}
          </Chip>
        ) : null}
        {availableTags.map((tag) => (
          <Chip
            key={tag}
            trackId="hub.filter.tag.toggle"
            selected={selectedTags.includes(tag)}
            onPress={() => toggleTag(tag)}
          >
            {translateRecipeTag(tag, t)}
          </Chip>
        ))}
      </ScrollView>

      {filtersOpen ? (
        <Tile size="md" style={{ padding: 16, gap: 16 }}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('web.hub.source')} style={{ gap: 10 }}>
            <TileLabel>{t('web.hub.source')}</TileLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HUB_PLATFORMS.map((item) => (
                <Chip
                  key={item}
                  kind="radio"
                  size="sm"
                  trackId={`hub.filter.source.${item}`}
                  selected={platform === item}
                  onPress={() => setPlatform(item)}
                  accessibilityLabel={t('a11y.sourceFilter', { source: t(platformLabelKey(item)) })}
                >
                  {t(platformLabelKey(item))}
                </Chip>
              ))}
            </View>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('web.library.sortBy')} style={{ gap: 10 }}>
            <TileLabel>{t('web.library.sortBy')}</TileLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['popular', 'newest'] as const).map((option) => {
                const label = option === 'popular' ? t('hub.sortPopular') : t('hub.sortNewest');
                return (
                  <Chip
                    key={option}
                    kind="radio"
                    size="sm"
                    trackId={`hub.sort.${option}`}
                    selected={sort === option}
                    onPress={() => setSort(option)}
                    accessibilityLabel={t('a11y.sortBy', { option: label })}
                  >
                    {label}
                  </Chip>
                );
              })}
            </View>
          </View>
        </Tile>
      ) : null}

      <Text variant="caption" weight="semibold" tone="muted" accessibilityLiveRegion="polite">
        {showSearching
          ? t('hub.searching')
          : t(count === 1 ? 'library.recipeCountOne' : 'library.recipeCountOther', { count })}
      </Text>

      {showInlineError ? (
        <Pressable
          trackId="hub.error_retry_inline"
          onPress={() => void refresh()}
          accessibilityRole="button"
          accessibilityHint={t('a11y.tapToRetryHint')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            borderRadius: Radii.inner,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: colors.dangerSoft,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="refresh" size={16} color={colors.danger} accessible={false} importantForAccessibility="no" />
          <Text variant="caption" weight="semibold" tone="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen tabScreen>
      <FlatList
        ref={listRef}
        key={`hub-${numColumns}`}
        data={rows}
        keyExtractor={(item) => item.recipe.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { marginBottom: 20 } : undefined}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={numColumns > 1 ? { marginHorizontal: GRID_GAP / 2 } : undefined}
        renderItem={({ item, index }) =>
          grid ? (
            <View style={{ flex: 1, maxWidth: `${100 / numColumns}%`, paddingHorizontal: GRID_GAP / 2 }}>
              <HubCard card={item.card} recipe={item.recipe} />
            </View>
          ) : (
            <RecipeListRow
              trackId="hub.recipe"
              recipe={item.recipe}
              index={index}
              variant="row"
              detail={hubCardDetail(item.card, t)}
              onPress={() => router.push(`/hub/${item.recipe.id}`)}
            />
          )
        }
        style={{ flex: 1 }}
        onScroll={handleListScroll}
        scrollEventThrottle={160}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              logTap('hub.pull_refresh');
              void pullRefresh();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              style={{ paddingVertical: 16 }}
              color={colors.primary}
              accessibilityLabel={t('a11y.loadingMoreRecipes')}
            />
          ) : null
        }
        ListEmptyComponent={
          <View style={numColumns > 1 ? { marginHorizontal: GRID_GAP / 2 } : undefined}>
            {showSearching ? (
              <LoadingCards grid={grid} label={t('hub.searching')} />
            ) : error ? (
              <StateTile
                icon="cloud-offline-outline"
                danger
                title={t('hub.loadFailedTitle')}
                body={error}
                action={
                  <Button trackId="hub.error_retry" icon="refresh" onPress={() => void refresh()}>
                    {t('common.tryAgainAction')}
                  </Button>
                }
              />
            ) : filtersActive || hasQuery ? (
              <StateTile icon="search-outline" title={t('hub.noMatches')} body={t('hub.noMatchesHint')} />
            ) : (
              <StateTile
                icon="compass-outline"
                title={t('hub.emptyTitle')}
                body={t('hub.emptyBody')}
                action={
                  <Button trackId="hub.empty.snap_first" icon="add-circle-outline" onPress={() => router.push('/add')}>
                    {t('hub.snapFirst')}
                  </Button>
                }
              />
            )}
          </View>
        }
        contentContainerStyle={{
          paddingHorizontal: numColumns > 1 ? 20 - GRID_GAP / 2 : 20,
          paddingTop: 8,
          paddingBottom: 28,
          gap: numColumns > 1 ? 0 : 12,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Screen>
  );
}

/**
 * A Hub recipe in the grid, as a Library card (the web's RecipeCard): a square photo with 18 corners and the source
 * on it, the title in Space Grotesk, and how long it takes and how many people saved it, muted.
 */
const HubCard = memo(function HubCard({ card, recipe }: { card: RecipeCard; recipe: Recipe }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const photo = usePhotoColors();
  const type = useTypography();
  const { rtl } = useRtl();
  const title = recipe.display_title ?? recipe.title;
  const source = t(platformLabelKey(card.platform));
  const saves = t(card.save_count === 1 ? 'hub.saveCountOne' : 'hub.saveCountOther', { count: card.save_count });
  const time =
    recipe.estimated_time_minutes != null
      ? formatRecipeDuration(recipe.estimated_time_minutes, {
          minutes: t('recipe.durationMin'),
          hours: t('recipe.durationHr'),
        })
      : null;
  const meta = [time, saves].filter(Boolean).join(' · ');

  return (
    <Pressable
      trackId="hub.recipe.open"
      onPress={() => router.push(`/hub/${recipe.id}`)}
      accessibilityRole="button"
      accessibilityLabel={[title, hubCardDetail(card, t), time].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ gap: 10, opacity: pressed ? 0.88 : 1 })}
    >
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          overflow: 'hidden',
          borderRadius: 18,
          backgroundColor: colors.backgroundElement,
        }}
      >
        {recipe.image_url ? (
          <RecipeImage
            uri={recipe.image_url}
            variant="hero"
            aiGenerated={recipe.image_generated}
            borderRadius={18}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <CookieMark size={40} color={colors.primaryText} />
          </View>
        )}
        {/* A row over the photo pinned to the app language, so the source sits at the start corner before the RTL
            reload too (no left or right). */}
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'flex-start', padding: 8, direction: rtl ? 'rtl' : 'ltr' }]}
        >
          <View
            style={{
              maxWidth: '75%',
              borderRadius: Radii.pill,
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: withAlpha(photo.scrim, 0.7),
            }}
          >
            <Text
              numberOfLines={1}
              color={photo.onScrim}
              style={{ ...type.font('body', 'semibold'), fontSize: 12, lineHeight: 14 }}
            >
              {source}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ gap: 4, paddingHorizontal: 2 }}>
        <Text variant="h3" numberOfLines={2} style={{ fontSize: 15, lineHeight: 19 }}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

/** Grey outlines of the cards while the first page loads, so the page doesn't jump when they arrive. */
function LoadingCards({ grid, label }: { grid: boolean; label: string }) {
  const { colors } = useThemePreference();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {grid ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <View key={index} style={{ width: '50%', paddingHorizontal: GRID_GAP / 2, gap: 10 }}>
              <View style={{ aspectRatio: 1, borderRadius: 18, backgroundColor: colors.backgroundElement }} />
              <View style={{ height: 14, width: '80%', borderRadius: 7, backgroundColor: colors.backgroundElement }} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Tile key={index} size="md" style={{ height: 100 }} />
          ))}
        </View>
      )}
    </View>
  );
}

/** An empty, no-match or failed Hub: an icon on a soft square, a title, a line and maybe a button, on a tile. */
function StateTile({
  icon,
  title,
  body,
  action,
  danger = false,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
  danger?: boolean;
}) {
  const { colors } = useThemePreference();
  return (
    <Tile
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 36 }}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 56,
          height: 56,
          marginBottom: 4,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radii.inner,
          backgroundColor: danger ? colors.dangerSoft : colors.primarySoft,
        }}
      >
        <Ionicons name={icon} size={28} color={danger ? colors.danger : colors.primaryText} />
      </View>
      <Text variant="h3" align="center" style={{ fontSize: 20, lineHeight: 25 }}>
        {title}
      </Text>
      <Text variant="bodySmall" tone="muted" align="center">
        {body}
      </Text>
      {action ? <View style={{ marginTop: 10, alignItems: 'center' }}>{action}</View> : null}
    </Tile>
  );
}
