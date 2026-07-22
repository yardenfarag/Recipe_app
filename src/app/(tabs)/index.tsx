import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/BrandHeader';
import { RecipeLibraryToolbar } from '@/components/RecipeLibraryToolbar';
import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { removeGuestRecipe } from '@/lib/guestRecipes';
import {
  filterAndSortRecipes,
  isRecipeLibraryFiltered,
  RecipeSortKey,
} from '@/lib/recipeListQuery';
import { collectLibraryTags } from '@/lib/recipeTags';
import { deleteRecipe } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/** Alert.alert button actions are unreliable on web — use window.confirm there. */
function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
) {
  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    if (ok) void onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}
type CollectionNameModalState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; name: string }
  | null;

export default function HomeScreen() {
  const { user } = useAuth();
  const { recipes, loading, error, refresh, toggleFavorite } = useRecipes();
  const {
    collections,
    createCollection,
    renameCollection,
    deleteCollection,
  } = useCollections();
  const { colors } = useThemePreference();
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
  const [savingName, setSavingName] = useState(false);
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

  const handleSaveCollectionName = useCallback(async () => {
    if (!nameModal) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Enter a collection name.');
      return;
    }

    setSavingName(true);
    try {
      if (nameModal.mode === 'create') {
        const created = await createCollection(trimmed);
        setSelectedCollectionId(created.id);
      } else {
        await renameCollection(nameModal.id, trimmed);
      }
      setNameModal(null);
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSavingName(false);
    }
  }, [createCollection, nameDraft, nameModal, renameCollection]);

  const handleManageCollection = useCallback(
    (id: string) => {
      const collection = collections.find((c) => c.id === id);
      if (!collection) return;

      Alert.alert(collection.name, undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: () => {
            setNameDraft(collection.name);
            setNameModal({ mode: 'rename', id, name: collection.name });
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete collection?',
              'Recipes stay in your library — only this collection is removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteCollection(id);
                      if (selectedCollectionId === id) setSelectedCollectionId(null);
                    } catch (err) {
                      Alert.alert(
                        'Could not delete',
                        err instanceof Error ? err.message : 'Please try again.',
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ]);
    },
    [collections, deleteCollection, selectedCollectionId],
  );

  const handleToggleFavorite = useCallback(
    async (recipe: Recipe) => {
      try {
        await toggleFavorite(recipe);
      } catch (err) {
        Alert.alert(
          'Could not update favorite',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    },
    [toggleFavorite],
  );

  const confirmDeleteRecipe = useCallback(
    (recipe: Recipe) => {
      confirmDestructive('Delete this recipe?', recipe.title, 'Delete', async () => {
        try {
          if (recipe.id.startsWith('guest-')) {
            await removeGuestRecipe(recipe.id);
          } else {
            await deleteRecipe(recipe.id);
          }
          refresh();
        } catch (err) {
          Alert.alert(
            'Could not delete',
            err instanceof Error ? err.message : 'Please try again.',
          );
        }
      });
    },
    [refresh],
  );

  const openRecipe = useCallback((recipe: Recipe) => {
    router.push(`/recipe/${recipe.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Recipe; index: number }) => (
      <RecipeListRow
        recipe={item}
        index={index}
        onPress={() => openRecipe(item)}
        onLongPress={() => confirmDeleteRecipe(item)}
        onDelete={() => confirmDeleteRecipe(item)}
        onToggleFavorite={() => handleToggleFavorite(item)}
      />
    ),
    [confirmDeleteRecipe, handleToggleFavorite, openRecipe],
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
              Saved to your library
            </Text>
            <Pressable onPress={() => setSavedBanner(false)} hitSlop={8}>
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
              Could not refresh — showing saved recipes.
            </Text>
            <Pressable onPress={() => refresh()} hitSlop={8}>
              <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        <BrandHeader title="Your recipes" subtitle="Your kitchen" />

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
    ],
  );

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
          Could not load recipes
        </Text>
        <Text className="mb-6 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
          {error}
        </Text>
        <Pressable
          onPress={() => refresh()}
          className="rounded-[22px] px-6 py-3.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-bold text-white">Try again</Text>
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
            title="Your kitchen awaits"
            subtitle="Snap a recipe from social — keep cooking calm and simple."
          />

          <Pressable
            className="mt-8 w-full items-center rounded-[22px] py-4 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.push('/add')}
          >
            <Text className="text-base font-bold text-white">Snap first recipe</Text>
          </Pressable>

          {!user && (
            <Pressable
              onPress={() => router.push('/auth?mode=signin&reason=sync')}
              className="mt-5 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                Sign in to sync recipes
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
        data={displayedRecipes}
        extraData={recipes}
        keyExtractor={(item) => item.id}
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
                  ? 'No favorites yet'
                  : 'No matches'}
              </Text>
              <Text className="mb-5 text-center text-sm" style={{ color: colors.textSecondary }}>
                {favoritesOnly &&
                !deferredSearch &&
                selectedTags.length === 0 &&
                selectedCollectionId == null
                  ? 'Tap the heart on a recipe to see it here.'
                  : 'Try a different search, tag, or collection.'}
              </Text>
              <Pressable
                onPress={clearFilters}
                className="rounded-[22px] px-5 py-2.5 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-semibold text-white">Clear filters</Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
      />

      <Modal
        visible={nameModal != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNameModal(null)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <View
            className="flex-row items-center justify-between border-b px-5 py-4"
            style={{ borderColor: colors.frostedBorder }}
          >
            <Pressable onPress={() => setNameModal(null)}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Text className="text-base font-bold" style={{ color: colors.text }}>
              {nameModal?.mode === 'rename' ? 'Rename collection' : 'New collection'}
            </Text>
            <Pressable onPress={() => void handleSaveCollectionName()} disabled={savingName}>
              {savingName ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text className="font-bold" style={{ color: colors.primary }}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>
          <View className="px-5 pt-5">
            <TextInput
              className="rounded-2xl border px-4 py-3 text-base"
              style={{
                color: colors.text,
                borderColor: colors.frostedBorder,
                backgroundColor: colors.surface,
              }}
              placeholder="Collection name"
              placeholderTextColor={colors.textSecondary}
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void handleSaveCollectionName()}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
