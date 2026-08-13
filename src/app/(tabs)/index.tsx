import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import { useTranslation } from 'react-i18next';

import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { BrandHeader } from '@/components/BrandHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { NameEditModal } from '@/components/NameEditModal';
import { RecipeActionsMenu } from '@/components/RecipeActionsMenu';
import { RecipeLibraryToolbar } from '@/components/RecipeLibraryToolbar';
import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCollections } from '@/hooks/useCollections';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { removeGuestRecipe, renameGuestRecipe } from '@/lib/guestRecipes';
import {
  filterAndSortRecipes,
  isRecipeLibraryFiltered,
  RecipeSortKey,
} from '@/lib/recipeListQuery';
import { collectLibraryTags } from '@/lib/recipeTags';
import { upsertRecipeTranslation } from '@/lib/supabase/recipeTranslations';
import { deleteRecipe, renameRecipe } from '@/lib/supabase/recipes';
import { translateAppError } from '@/lib/translateAppError';
import {
  isCollectionNameTaken,
  isRecipeNameTaken,
  recipeVisibleName,
} from '@/lib/uniqueNames';
import { Recipe } from '@/types/recipe';

type CollectionNameModalState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; name: string }
  | null;

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { recipes, loading, error, refresh, patchRecipe, toggleFavorite } = useRecipes();
  const {
    collections,
    createCollection,
    renameCollection,
    deleteCollection,
    setMembershipsForRecipe,
    collectionsForRecipe,
  } = useCollections();
  const { colors } = useThemePreference();
  const { isWide, isMediumUp } = useBreakpoint();
  const numColumns = isWide ? 3 : isMediumUp ? 2 : 1;
  const params = useLocalSearchParams<{
    tag?: string;
    collection?: string;
    favorites?: string;
    saved?: string;
  }>();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RecipeSortKey>('newest');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
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
      router.setParams({ saved: undefined });
    }
  }, [params.saved]);

  const availableTags = useMemo(() => collectLibraryTags(recipes), [recipes]);

  const collectionAllowlist = useMemo(() => {
    if (!selectedCollectionId) return null;
    const collection = collections.find((c) => c.id === selectedCollectionId);
    return new Set(collection?.recipeIds ?? []);
  }, [collections, selectedCollectionId]);

  const displayedRecipes = useMemo(() => {
    const filtered = filterAndSortRecipes(recipes, {
      searchQuery: deferredSearch,
      sort,
      selectedTags,
      recipeIdAllowlist: collectionAllowlist,
    });
    if (!favoritesOnly) return filtered;
    return filtered.filter((r) => r.is_favorite === true);
  }, [recipes, deferredSearch, sort, selectedTags, collectionAllowlist, favoritesOnly]);

  const hasActiveFilters =
    isRecipeLibraryFiltered(deferredSearch, sort, selectedTags, selectedCollectionId) ||
    favoritesOnly;

  const clearFilters = useCallback(() => {
    setSearch('');
    setSort('newest');
    setSelectedTags([]);
    setSelectedCollectionId(null);
    setFavoritesOnly(false);
  }, []);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

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
      if (!trimmed) throw new Error(t('library.recipeNameRequired'));
      if (isRecipeNameTaken(recipes, trimmed, renameTarget.id)) {
        throw new Error(t('library.recipeNameTaken'));
      }

      if (renameTarget.id.startsWith('guest-')) {
        const updated = await renameGuestRecipe(renameTarget.id, trimmed);
        if (!updated) throw new Error(t('library.recipeNotFound'));
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

  const renderItem = useCallback(
    ({ item, index }: { item: Recipe; index: number }) => (
      <View style={numColumns > 1 ? { flex: 1, paddingHorizontal: 6 } : undefined}>
        <RecipeListRow
          recipe={item}
          index={index}
          variant={numColumns > 1 ? 'card' : 'row'}
          onPress={() => openRecipe(item)}
          onLongPress={numColumns > 1 ? undefined : () => openRecipeMenu(item)}
          onMore={() => openRecipeMenu(item)}
          onToggleFavorite={() => handleToggleFavorite(item)}
        />
      </View>
    ),
    [handleToggleFavorite, numColumns, openRecipe, openRecipeMenu],
  );

  const listHeader = useMemo(
    () => (
      <View className="gap-4 pb-3 pt-1">
        {savedBanner && (
          <View
            className="flex-row items-center gap-2 rounded-[20px] px-3.5 py-2.5"
            style={{ backgroundColor: colors.successSoft }}
          >
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text className="flex-1 text-xs font-medium" style={{ color: colors.success }}>
              {t('library.saved')}
            </Text>
            <Pressable
              onPress={() => setSavedBanner(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.dismiss')}
            >
              <Ionicons name="close" size={16} color={colors.success} />
            </Pressable>
          </View>
        )}

        {error && recipes.length > 0 && (
          <View
            className="flex-row items-center gap-2 rounded-[20px] px-3.5 py-2.5"
            style={{ backgroundColor: colors.warningSoft }}
          >
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text className="flex-1 text-xs" style={{ color: colors.warning }}>
              {t('library.refreshFailed')}
            </Text>
            <Pressable onPress={() => refresh()} hitSlop={8}>
              <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        )}

        <BrandHeader title={t('library.title')} subtitle={t('library.subtitle')} />

        <RecipeLibraryToolbar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          resultCount={displayedRecipes.length}
          isSearchPending={isSearchPending}
          favoritesOnly={favoritesOnly}
          onToggleFavorites={() => setFavoritesOnly((v) => !v)}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          onClearTags={() => setSelectedTags([])}
          collections={collections.map((c) => ({ id: c.id, name: c.name }))}
          selectedCollectionId={selectedCollectionId}
          onSelectCollection={setSelectedCollectionId}
          onLongPressCollection={handleManageCollection}
          onManageCollection={handleManageCollection}
          onCreateCollection={openCreateCollection}
        />
      </View>
    ),
    [
      availableTags,
      collections,
      colors.primary,
      colors.success,
      colors.successSoft,
      colors.warning,
      colors.warningSoft,
      displayedRecipes.length,
      error,
      favoritesOnly,
      handleManageCollection,
      handleToggleTag,
      isSearchPending,
      openCreateCollection,
      recipes.length,
      refresh,
      savedBanner,
      search,
      selectedCollectionId,
      selectedTags,
      sort,
      t,
    ],
  );

  const collectionPendingDelete = deleteCollectionId
    ? collections.find((c) => c.id === deleteCollectionId)
    : null;

  if (loading) {
    return (
      <Screen tabScreen className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (error && recipes.length === 0) {
    return (
      <Screen tabScreen className="items-center justify-center px-8">
        <View
          className="mb-5 h-16 w-16 items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.dangerSoft }}
        >
          <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
        </View>
        <Text className="mb-2 text-center text-xl font-bold" style={{ color: colors.text }}>
          {t('library.loadFailedTitle')}
        </Text>
        <Text className="mb-6 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
          {error}
        </Text>
        <Pressable
          onPress={() => refresh()}
          className="rounded-[22px] px-6 py-3.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-bold text-white">{t('common.tryAgainAction')}</Text>
        </Pressable>
      </Screen>
    );
  }

  if (recipes.length === 0) {
    return (
      <Screen tabScreen>
        <View className="flex-1 items-center justify-center px-8 pb-10">
          <BrandHeader
            size="hero"
            align="center"
            title={t('library.emptyTitle')}
            subtitle={t('library.emptyBody')}
          />

          <Pressable
            className="mt-8 w-full items-center rounded-[22px] py-4 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.push('/add')}
          >
            <Text className="text-base font-bold text-white">{t('library.snapFirst')}</Text>
          </Pressable>

          {!user && (
            <Pressable
              onPress={() => router.push('/auth?mode=signin&reason=sync')}
              className="mt-5 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {t('library.signInToSync')}
              </Text>
            </Pressable>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen tabScreen>
      <FlatList
        key={`library-${numColumns}`}
        data={displayedRecipes}
        extraData={recipes}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 0, marginBottom: 12 } : undefined}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          hasActiveFilters ? (
            <View className="items-center px-4 py-10">
              <Text className="mb-1 text-center text-base font-semibold" style={{ color: colors.text }}>
                {favoritesOnly &&
                !deferredSearch &&
                selectedTags.length === 0 &&
                selectedCollectionId == null
                  ? t('library.noFavorites')
                  : t('library.noMatches')}
              </Text>
              <Text className="mb-5 text-center text-sm" style={{ color: colors.textSecondary }}>
                {favoritesOnly &&
                !deferredSearch &&
                selectedTags.length === 0 &&
                selectedCollectionId == null
                  ? t('library.noFavoritesHint')
                  : t('library.noMatchesHint')}
              </Text>
              <Pressable
                onPress={clearFilters}
                className="rounded-[22px] px-5 py-2.5 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-semibold text-white">{t('library.clearFilters')}</Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{
          paddingHorizontal: numColumns > 1 ? 14 : 20,
          paddingBottom: 28,
          gap: numColumns > 1 ? 0 : 12,
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
        visible={renameTarget != null}
        title={t('library.renameRecipe')}
        initialValue={renameTarget ? recipeVisibleName(renameTarget) : ''}
        placeholder={t('library.recipeNamePlaceholder')}
        onClose={() => setRenameTarget(null)}
        onSave={handleRenameRecipe}
      />

      <ConfirmDialog
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
            throw new Error(t('library.collectionNameRequired'));
          }
          const excludeId = nameModal.mode === 'rename' ? nameModal.id : undefined;
          if (isCollectionNameTaken(collections, trimmed, excludeId)) {
            throw new Error(t('library.collectionNameTaken'));
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
            <Pressable
              className="mt-6 items-center rounded-2xl py-3.5 active:opacity-80"
              style={{ backgroundColor: colors.dangerSoft }}
              onPress={() => {
                setDeleteCollectionId(nameModal.id);
                setNameModal(null);
              }}
            >
              <Text className="text-sm font-bold" style={{ color: colors.danger }}>
                {t('library.deleteCollection')}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </Screen>
  );
}
