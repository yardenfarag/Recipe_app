import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTranslation } from 'react-i18next';

import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CookieMark } from '@/components/CookieMark';
import { FridgeMatchModal } from '@/components/FridgeMatchModal';
import { LibraryLayoutToggle } from '@/components/LibraryLayoutToggle';
import {
  KitchenTiles,
  KitchenTilesSkeleton,
  useCookedThisWeek,
  useTonightsPick,
} from '@/components/LibraryTiles';
import { NameEditModal } from '@/components/NameEditModal';
import { RecipeActionsMenu } from '@/components/RecipeActionsMenu';
import { LibrarySearchBar, RecipeLibraryToolbar } from '@/components/RecipeLibraryToolbar';
import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { TopBar } from '@/components/ui/TopBar';
import { KitIcon, Radii, type IconName } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { useLibraryLayout } from '@/hooks/useLibraryLayout';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { announce } from '@/lib/a11y';
import { removeGuestRecipe, renameGuestRecipe } from '@/lib/guestRecipes';
import { openRecipeEditor } from '@/lib/openRecipeEditor';
import { rankCookTonight } from '@shared/lib/cookTonight';
import {
  applyQuickFilters,
  filterAndSortRecipes,
  isRecipeLibraryFiltered,
  RecipeSortKey,
  type RecipeQuickFilter,
} from '@shared/lib/recipeListQuery';
import { collectLibraryTags } from '@shared/lib/recipeTags';
import { upsertRecipeTranslation } from '@shared/lib/supabase/recipeTranslations';
import { deleteRecipe, renameRecipe } from '@shared/lib/supabase/recipes';
import { COOK_TONIGHT_LIMITS } from '@shared/lib/tonightsPick';
import { translateAppError, UserFacingError } from '@shared/lib/translateAppError';
import {
  isCollectionNameTaken,
  isRecipeNameTaken,
  recipeVisibleName,
} from '@shared/lib/uniqueNames';
import { Recipe } from '@shared/types/recipe';

type CollectionNameModalState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; name: string }
  | null;

/** One line of the list: a recipe row, or a row of photo cards in the grid. */
type LibraryLine = { key: string; recipes: Recipe[] };

/** The page's side gutter. */
const GUTTER = 16;

/**
 * The Library (Night Market, PIN-177; the web's Library, phone size). Top to bottom: the bar with the logo and the
 * credits, the search bar, tonight's pick with what was cooked this week and the shopping list, then "Your recipes"
 * with its filters and the recipes as photo cards or rows.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const {
    recipes,
    loading,
    loadingMore,
    total,
    error,
    refresh,
    loadMore,
    ensureAllLoaded,
    patchRecipe,
    toggleFavorite,
  } = useRecipes({ pageSize: 40 });
  const {
    collections,
    createCollection,
    renameCollection,
    deleteCollection,
    setMembershipsForRecipe,
    collectionsForRecipe,
  } = useCollections();
  const { colors } = useThemePreference();
  const type = useTypography();
  const { user } = useAuth();
  const { layout, numColumns, toggleLayout } = useLibraryLayout('grid');
  const reduceMotion = useReducedMotion();
  const skipItemEnter = useRef(false);
  const flipping = useRef(false);
  const pendingFlipIn = useRef(false);
  const flipRotation = useSharedValue(0);
  const params = useLocalSearchParams<{
    tag?: string;
    collection?: string;
    favorites?: string;
    saved?: string;
  }>();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RecipeSortKey>('newest');
  const [quick, setQuick] = useState<RecipeQuickFilter[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cookTonight, setCookTonight] = useState(false);
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [nameModal, setNameModal] = useState<CollectionNameModalState>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [menuRecipe, setMenuRecipe] = useState<Recipe | null>(null);
  const [collectionRecipe, setCollectionRecipe] = useState<Recipe | null>(null);
  const [renameTarget, setRenameTarget] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [deletingRecipe, setDeletingRecipe] = useState(false);
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [deletingCollection, setDeletingCollection] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const isSearchPending = search !== deferredSearch;

  useEffect(() => {
    const tagParam = typeof params.tag === 'string' ? params.tag.trim().toLowerCase() : '';
    if (tagParam) {
      setSelectedTags((prev) => (prev.includes(tagParam) ? prev : [...prev, tagParam]));
    }
  }, [params.tag]);

  useEffect(() => {
    const collectionParam =
      typeof params.collection === 'string' ? params.collection.trim() : '';
    if (collectionParam) {
      setSelectedCollectionId(collectionParam);
    }
  }, [params.collection]);

  useEffect(() => {
    if (params.favorites === '1' || params.favorites === 'true') {
      setFavoritesOnly(true);
    }
  }, [params.favorites]);

  useEffect(() => {
    if (params.saved === '1' || params.saved === 'true') {
      setSavedBanner(true);
      announce(t('library.saved'));
      router.setParams({ saved: undefined });
    }
  }, [params.saved, t]);

  const showRefreshFailed = Boolean(error) && recipes.length > 0;
  useEffect(() => {
    if (showRefreshFailed) announce(t('library.refreshFailed'));
  }, [showRefreshFailed, t]);

  const availableTags = useMemo(() => collectLibraryTags(recipes), [recipes]);

  const collectionAllowlist = useMemo(() => {
    if (!selectedCollectionId) return null;
    const collection = collections.find((c) => c.id === selectedCollectionId);
    return new Set(collection?.recipeIds ?? []);
  }, [collections, selectedCollectionId]);

  const displayedRecipes = useMemo(() => {
    const filtered = applyQuickFilters(
      filterAndSortRecipes(recipes, {
        searchQuery: deferredSearch,
        sort,
        selectedTags,
        recipeIdAllowlist: collectionAllowlist,
      }),
      quick,
    );
    if (cookTonight) {
      return rankCookTonight(filtered, { ...COOK_TONIGHT_LIMITS, favoritesOnly });
    }
    if (!favoritesOnly) return filtered;
    return filtered.filter((r) => r.is_favorite === true);
  }, [recipes, deferredSearch, sort, selectedTags, collectionAllowlist, favoritesOnly, cookTonight, quick]);

  const hasActiveFilters =
    isRecipeLibraryFiltered(deferredSearch, sort, selectedTags, selectedCollectionId) ||
    favoritesOnly ||
    cookTonight ||
    quick.length > 0;

  // Tonight's pick, and what was cooked this week (both as on the web).
  const { pick, another } = useTonightsPick(recipes);
  const cooked = useCookedThisWeek(recipes, total);

  useEffect(() => {
    if (hasActiveFilters) void ensureAllLoaded();
  }, [ensureAllLoaded, hasActiveFilters]);

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const remaining = contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (remaining < 480) loadMore();
    },
    [loadMore],
  );

  const clearFilters = useCallback(() => {
    setSearch('');
    setSort('newest');
    setSelectedTags([]);
    setSelectedCollectionId(null);
    setFavoritesOnly(false);
    setCookTonight(false);
    setQuick([]);
  }, []);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const handleToggleQuick = useCallback((filter: RecipeQuickFilter) => {
    setQuick((prev) => (prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]));
  }, []);

  const handleShowAll = useCallback(() => {
    setQuick([]);
    setFavoritesOnly(false);
    setCookTonight(false);
  }, []);

  const endFlip = useCallback(() => {
    flipping.current = false;
  }, []);

  const swapLayout = useCallback(() => {
    pendingFlipIn.current = true;
    toggleLayout();
  }, [toggleLayout]);

  const handleToggleLayout = useCallback(() => {
    if (flipping.current) return;
    skipItemEnter.current = true;
    if (reduceMotion) {
      toggleLayout();
      return;
    }
    flipping.current = true;
    flipRotation.value = withTiming(
      90,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      (finished) => {
        'worklet';
        if (!finished) {
          scheduleOnRN(endFlip);
          return;
        }
        scheduleOnRN(swapLayout);
      },
    );
  }, [endFlip, flipRotation, reduceMotion, swapLayout, toggleLayout]);

  useEffect(() => {
    if (!pendingFlipIn.current) return;
    pendingFlipIn.current = false;
    flipRotation.value = withSequence(
      withTiming(-90, { duration: 0 }),
      withTiming(
        0,
        { duration: 400, easing: Easing.bezier(0.22, 1, 0.36, 1) },
        (finished) => {
          'worklet';
          if (finished) scheduleOnRN(endFlip);
        },
      ),
    );
  }, [endFlip, flipRotation, layout]);

  const flipStyle = useAnimatedStyle(() => {
    const abs = Math.abs(flipRotation.value);
    return {
      opacity: interpolate(abs, [0, 70, 90], [1, 1, 0]),
      transform: [
        { perspective: 1400 },
        { rotateY: `${flipRotation.value}deg` },
        { scale: interpolate(abs, [0, 90], [1, 0.94]) },
      ],
    };
  });

  const openCreateCollection = useCallback(() => {
    setNameDraft('');
    setNameModal({ mode: 'create' });
  }, []);

  const openRecipeMenu = useCallback((recipe: Recipe) => {
    setMenuRecipe(recipe);
  }, []);

  const handleManageCollection = useCallback(
    (id: string) => {
      const collection = collections.find((c) => c.id === id);
      if (!collection) return;

      if (Platform.OS === 'web') {
        setNameDraft(collection.name);
        setNameModal({ mode: 'rename', id, name: collection.name });
        return;
      }

      Alert.alert(collection.name, undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('library.rename'),
          onPress: () => {
            setNameDraft(collection.name);
            setNameModal({ mode: 'rename', id, name: collection.name });
          },
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => setDeleteCollectionId(id),
        },
      ]);
    },
    [collections, t],
  );

  const handleConfirmDeleteCollection = useCallback(async () => {
    if (!deleteCollectionId) return;
    setDeletingCollection(true);
    try {
      await deleteCollection(deleteCollectionId);
      if (selectedCollectionId === deleteCollectionId) setSelectedCollectionId(null);
      setNameModal(null);
      setDeleteCollectionId(null);
    } catch (err) {
      Alert.alert(t('library.couldNotDelete'), translateAppError(err, t));
    } finally {
      setDeletingCollection(false);
    }
  }, [deleteCollection, deleteCollectionId, selectedCollectionId, t]);

  const handleToggleFavorite = useCallback(
    async (recipe: Recipe) => {
      try {
        await toggleFavorite(recipe);
      } catch (err) {
        Alert.alert(t('recipe.favoriteFailedTitle'), translateAppError(err, t));
      }
    },
    [t, toggleFavorite],
  );

  const handleRenameRecipe = useCallback(
    async (name: string) => {
      if (!renameTarget) return;
      const trimmed = name.trim();
      if (!trimmed) throw new UserFacingError(t('library.recipeNameRequired'));
      if (isRecipeNameTaken(recipes, trimmed, renameTarget.id)) {
        throw new UserFacingError(t('library.recipeNameTaken'));
      }

      if (renameTarget.id.startsWith('guest-')) {
        const updated = await renameGuestRecipe(renameTarget.id, trimmed);
        if (!updated) throw new UserFacingError(t('library.recipeNotFound'));
        patchRecipe(renameTarget.id, {
          title: trimmed,
          display_title: trimmed,
          translations: updated.translations,
        });
        return;
      }

      await renameRecipe(renameTarget.id, trimmed);

      const translations = renameTarget.translations
        ? Object.fromEntries(
            Object.entries(renameTarget.translations).map(([code, content]) => [
              code,
              { ...content, title: trimmed },
            ]),
          )
        : undefined;

      if (translations) {
        await Promise.all(
          Object.entries(translations).map(([code, content]) =>
            upsertRecipeTranslation(renameTarget.id, code, content),
          ),
        );
      }

      patchRecipe(renameTarget.id, {
        title: trimmed,
        display_title: trimmed,
        translations,
      });
    },
    [patchRecipe, recipes, renameTarget, t],
  );

  const handleConfirmDeleteRecipe = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingRecipe(true);
    try {
      if (deleteTarget.id.startsWith('guest-')) {
        await removeGuestRecipe(deleteTarget.id);
      } else {
        await deleteRecipe(deleteTarget.id);
      }
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      Alert.alert(t('library.couldNotDelete'), translateAppError(err, t));
    } finally {
      setDeletingRecipe(false);
    }
  }, [deleteTarget, refresh, t]);

  const openRecipe = useCallback((recipe: Recipe) => {
    router.push(`/recipe/${recipe.id}`);
  }, []);

  // Rows of photo cards in the grid, one recipe a line in the list. One list either way, so switching keeps the
  // place on the page.
  const lines = useMemo<LibraryLine[]>(() => {
    if (numColumns <= 1) return displayedRecipes.map((recipe) => ({ key: `row:${recipe.id}`, recipes: [recipe] }));
    const out: LibraryLine[] = [];
    for (let i = 0; i < displayedRecipes.length; i += numColumns) {
      const chunk = displayedRecipes.slice(i, i + numColumns);
      out.push({ key: `grid:${chunk.map((recipe) => recipe.id).join(',')}`, recipes: chunk });
    }
    return out;
  }, [displayedRecipes, numColumns]);

  const renderRecipe = useCallback(
    (recipe: Recipe, index: number, card: boolean) => (
      <RecipeListRow
        key={recipe.id}
        trackId="library.recipe"
        recipe={recipe}
        index={index}
        variant={card ? 'card' : 'row'}
        animateEnter={!skipItemEnter.current}
        onPress={() => openRecipe(recipe)}
        onLongPress={() => openRecipeMenu(recipe)}
        onMore={() => openRecipeMenu(recipe)}
        onToggleFavorite={() => handleToggleFavorite(recipe)}
      />
    ),
    [handleToggleFavorite, openRecipe, openRecipeMenu],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LibraryLine; index: number }) => (
      <Animated.View collapsable={false} style={flipStyle}>
        {numColumns > 1 ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {item.recipes.map((recipe, i) => renderRecipe(recipe, index * numColumns + i, true))}
            {Array.from({ length: numColumns - item.recipes.length }, (_, i) => (
              <View key={`gap-${i}`} style={{ flex: 1 }} />
            ))}
          </View>
        ) : (
          renderRecipe(item.recipes[0], index, false)
        )}
      </Animated.View>
    ),
    [flipStyle, numColumns, renderRecipe],
  );

  const searching = search.trim().length > 0;
  const resultCount = hasActiveFilters ? displayedRecipes.length : total || displayedRecipes.length;
  const countWords = t(resultCount === 1 ? 'library.recipeCountOne' : 'library.recipeCountOther', {
    count: resultCount,
  });

  const listHeader = (
    <View style={{ gap: 16, paddingBottom: 16 }}>
      <TopBar />
      <LibrarySearchBar value={search} onChange={setSearch} />

      {savedBanner ? (
        <Notice
          tone="success"
          icon="checkmark-circle"
          message={t('library.saved')}
          action={
            <IconButton
              icon="close"
              iconSize={18}
              color={colors.success}
              label={t('common.dismiss')}
              trackId="library.saved_banner.dismiss"
              onPress={() => setSavedBanner(false)}
            />
          }
        />
      ) : null}

      {showRefreshFailed ? (
        <Notice
          tone="warning"
          icon="warning-outline"
          message={t('library.refreshFailed')}
          action={
            <Button
              variant="link"
              trackId="library.load_error.retry"
              accessibilityLabel={t('a11y.retryLoadingRecipes')}
              onPress={() => refresh()}
            >
              {t('common.retry')}
            </Button>
          }
        />
      ) : null}

      {/* The tiles step aside while searching, so what was typed and what it found sit together. */}
      {searching || error ? null : <KitchenTiles pick={pick} onAnother={another} cooked={cooked} />}

      <View style={{ gap: 14, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1 }}>
            <Text variant="h2" numberOfLines={1} style={{ fontSize: 24, flexShrink: 1 }}>
              {t('library.title')}
            </Text>
            <Text
              accessibilityLabel={countWords}
              accessibilityLiveRegion="polite"
              tone="muted"
              style={[
                type.variant('h2'),
                { fontSize: 24, fontVariant: ['tabular-nums'] },
                isSearchPending ? { opacity: 0.6 } : null,
              ]}
            >
              {resultCount}
            </Text>
          </View>
          <LibraryLayoutToggle layout={layout} onChange={handleToggleLayout} />
        </View>

        <RecipeLibraryToolbar
          sort={sort}
          onSortChange={setSort}
          quick={quick}
          onToggleQuick={handleToggleQuick}
          onShowAll={handleShowAll}
          favoritesOnly={favoritesOnly}
          onToggleFavorites={() => setFavoritesOnly((v) => !v)}
          cookTonight={cookTonight}
          onToggleCookTonight={() => setCookTonight((v) => !v)}
          onFridgeMatch={() => {
            void ensureAllLoaded().then(() => setFridgeOpen(true));
          }}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          onClearTags={() => setSelectedTags([])}
          collections={collections.map((c) => ({ id: c.id, name: c.name }))}
          selectedCollectionId={selectedCollectionId}
          onSelectCollection={setSelectedCollectionId}
          onManageCollection={handleManageCollection}
          onCreateCollection={openCreateCollection}
        />
      </View>
    </View>
  );

  const collectionPendingDelete = deleteCollectionId
    ? collections.find((c) => c.id === deleteCollectionId)
    : null;

  if (loading) {
    return (
      <Screen tabScreen>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('a11y.loadingRecipes')}
          style={{ flex: 1, paddingHorizontal: GUTTER, gap: 16, overflow: 'hidden' }}
        >
          <TopBar />
          <View
            style={{ height: 52, borderRadius: Radii.inner, backgroundColor: colors.backgroundElement }}
          />
          <KitchenTilesSkeleton />
          <View style={{ width: 180, height: 28, marginTop: 4, borderRadius: 8, backgroundColor: colors.backgroundElement }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, aspectRatio: 1, borderRadius: 18, backgroundColor: colors.backgroundElement }} />
            <View style={{ flex: 1, aspectRatio: 1, borderRadius: 18, backgroundColor: colors.backgroundElement }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (error && recipes.length === 0) {
    return (
      <Screen tabScreen>
        <View style={{ paddingHorizontal: GUTTER }}>
          <TopBar />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER, paddingBottom: 40 }}>
          <Tile padding={24} style={{ alignItems: 'center', gap: 12 }}>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.dangerSoft,
              }}
            >
              <KitIcon icon="cloud-offline-outline" color={colors.danger} size={30} />
            </View>
            <Text variant="h2" align="center">
              {t('library.loadFailedTitle')}
            </Text>
            <Text variant="bodySmall" tone="muted" align="center">
              {error}
            </Text>
            <Button trackId="library.error.try_again" onPress={() => refresh()} style={{ alignSelf: 'center', marginTop: 4 }}>
              {t('common.tryAgainAction')}
            </Button>
          </Tile>
        </View>
      </Screen>
    );
  }

  if (recipes.length === 0) {
    return (
      <Screen tabScreen>
        <View style={{ paddingHorizontal: GUTTER }}>
          <TopBar />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER, paddingBottom: 40 }}>
          <Tile padding={24} style={{ gap: 14 }}>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primarySoft,
              }}
            >
              <CookieMark size={36} color={colors.primaryText} />
            </View>
            <Text variant="h1">{t('library.emptyTitle')}</Text>
            <Text variant="body" tone="muted">
              {t('library.emptyBody')}
            </Text>
            <Button
              trackId="library.empty.add_recipe"
              size="lg"
              fullWidth
              icon="add"
              onPress={() => router.push('/add')}
              style={{ marginTop: 6 }}
            >
              {t('library.snapFirst')}
            </Button>
            <Button
              variant="link"
              trackId="library.empty.write_recipe"
              onPress={() => openRecipeEditor({ signedIn: Boolean(user) })}
              style={{ alignSelf: 'center' }}
            >
              {t('recipeEditor.entry.libraryEmptyLink')}
            </Button>
          </Tile>
        </View>
      </Screen>
    );
  }

  const noResults: { icon: IconName; title: string; body: string } = cookTonight
    ? { icon: 'flame-outline', title: t('library.noCookTonight'), body: t('library.noCookTonightHint') }
    : favoritesOnly &&
        !deferredSearch &&
        selectedTags.length === 0 &&
        selectedCollectionId == null &&
        quick.length === 0
      ? { icon: 'heart-outline', title: t('library.noFavorites'), body: t('library.noFavoritesHint') }
      : { icon: 'search-outline', title: t('library.noMatches'), body: t('library.noMatchesHint') };

  return (
    <Screen tabScreen>
      <FlatList
        data={lines}
        extraData={recipes}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={numColumns > 1 ? GridGap : RowGap}
        style={{ flex: 1 }}
        onScroll={handleListScroll}
        scrollEventThrottle={160}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              style={{ paddingVertical: 16 }}
              color={colors.primaryText}
              accessibilityLabel={t('a11y.loadingMoreRecipes')}
            />
          ) : null
        }
        ListEmptyComponent={
          hasActiveFilters ? (
            <Tile padding={24} style={{ alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.backgroundElement,
                }}
              >
                <KitIcon icon={noResults.icon} color={colors.textSecondary} size={26} />
              </View>
              <Text variant="h3" align="center">
                {noResults.title}
              </Text>
              <Text variant="bodySmall" tone="muted" align="center">
                {noResults.body}
              </Text>
              <Button
                variant="secondary"
                trackId="library.filters.clear"
                onPress={clearFilters}
                style={{ alignSelf: 'center', marginTop: 6 }}
              >
                {t('library.clearFilters')}
              </Button>
            </Tile>
          ) : null
        }
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingBottom: 28,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
      />

      <RecipeActionsMenu
        visible={menuRecipe != null}
        recipeTitle={menuRecipe ? recipeVisibleName(menuRecipe) : ''}
        onClose={() => setMenuRecipe(null)}
        onAddToCollection={() => {
          if (!menuRecipe) return;
          setCollectionRecipe(menuRecipe);
          setMenuRecipe(null);
        }}
        onEdit={() => {
          if (!menuRecipe) return;
          const recipeId = menuRecipe.id;
          setMenuRecipe(null);
          openRecipeEditor({ signedIn: Boolean(user), recipeId });
        }}
        onRename={() => {
          if (!menuRecipe) return;
          setRenameTarget(menuRecipe);
          setMenuRecipe(null);
        }}
        onDelete={() => {
          if (!menuRecipe) return;
          setDeleteTarget(menuRecipe);
          setMenuRecipe(null);
        }}
      />

      <AddToCollectionModal
        visible={collectionRecipe != null}
        collections={collections}
        selectedIds={
          collectionRecipe ? collectionsForRecipe(collectionRecipe.id).map((c) => c.id) : []
        }
        onClose={() => setCollectionRecipe(null)}
        onCreate={createCollection}
        onSave={async (ids) => {
          if (!collectionRecipe) return;
          await setMembershipsForRecipe(collectionRecipe.id, ids);
        }}
      />

      <NameEditModal
        trackId="library.rename_recipe"
        visible={renameTarget != null}
        title={t('library.renameRecipe')}
        initialValue={renameTarget ? recipeVisibleName(renameTarget) : ''}
        placeholder={t('library.recipeNamePlaceholder')}
        onClose={() => setRenameTarget(null)}
        onSave={handleRenameRecipe}
      />

      <ConfirmDialog
        trackId="library.delete_recipe_dialog"
        visible={deleteTarget != null}
        title={t('library.deleteRecipeTitle')}
        message={
          deleteTarget
            ? t('library.deleteRecipeBody', { name: recipeVisibleName(deleteTarget) })
            : ''
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deletingRecipe}
        onCancel={() => {
          if (!deletingRecipe) setDeleteTarget(null);
        }}
        onConfirm={() => void handleConfirmDeleteRecipe()}
      />

      <ConfirmDialog
        trackId="library.delete_collection_dialog"
        visible={deleteCollectionId != null}
        title={t('library.deleteCollectionTitle')}
        message={
          collectionPendingDelete
            ? t('library.deleteCollectionBody', { name: collectionPendingDelete.name })
            : t('library.deleteCollectionBodyGeneric')
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deletingCollection}
        onCancel={() => {
          if (!deletingCollection) setDeleteCollectionId(null);
        }}
        onConfirm={() => void handleConfirmDeleteCollection()}
      />

      <NameEditModal
        trackId="library.collection_name"
        visible={nameModal != null}
        title={
          nameModal?.mode === 'rename'
            ? t('library.renameCollection')
            : t('library.newCollection')
        }
        initialValue={nameDraft}
        placeholder={t('library.collectionNamePlaceholder')}
        onClose={() => setNameModal(null)}
        onSave={async (name) => {
          if (!nameModal) return;
          const trimmed = name.trim();
          if (!trimmed) {
            throw new UserFacingError(t('library.collectionNameRequired'));
          }
          const excludeId = nameModal.mode === 'rename' ? nameModal.id : undefined;
          if (isCollectionNameTaken(collections, trimmed, excludeId)) {
            throw new UserFacingError(t('library.collectionNameTaken'));
          }
          if (nameModal.mode === 'create') {
            const created = await createCollection(trimmed);
            setSelectedCollectionId(created.id);
          } else {
            await renameCollection(nameModal.id, trimmed);
          }
        }}
        footer={
          nameModal?.mode === 'rename' ? (
            <Button
              variant="danger"
              fullWidth
              icon="trash-outline"
              trackId="library.collection.delete"
              onPress={() => {
                setDeleteCollectionId(nameModal.id);
                setNameModal(null);
              }}
              style={{ marginTop: 24 }}
            >
              {t('library.deleteCollection')}
            </Button>
          ) : null
        }
      />
      <FridgeMatchModal
        visible={fridgeOpen}
        recipes={recipes}
        onClose={() => setFridgeOpen(false)}
      />
    </Screen>
  );
}

function GridGap() {
  return <View style={{ height: 20 }} />;
}

function RowGap() {
  return <View style={{ height: 12 }} />;
}

/** A one-line message above the tiles: saved, or couldn't refresh. */
function Notice({
  tone,
  icon,
  message,
  action,
}: {
  tone: 'success' | 'warning';
  icon: IconName;
  message: string;
  action: ReactNode;
}) {
  const { colors } = useThemePreference();
  const fg = tone === 'success' ? colors.success : colors.warning;
  const bg = tone === 'success' ? colors.successSoft : colors.warningSoft;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 52,
        borderRadius: Radii.inner,
        paddingStart: 14,
        paddingEnd: 4,
        backgroundColor: bg,
      }}
    >
      <KitIcon icon={icon} color={fg} size={18} />
      <Text variant="bodySmall" weight="semibold" color={fg} style={{ flex: 1 }}>
        {message}
      </Text>
      {action}
    </View>
  );
}
