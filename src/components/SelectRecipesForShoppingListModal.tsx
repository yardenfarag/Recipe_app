import Ionicons from '@expo/vector-icons/Ionicons';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { filterAndSortRecipes } from '@/lib/recipeListQuery';
import { translateAppError } from '@/lib/translateAppError';
import type { RecipeCollection } from '@/types/collection';
import type { Recipe } from '@/types/recipe';

interface SelectRecipesForShoppingListModalProps {
  visible: boolean;
  recipes: Recipe[];
  collections: RecipeCollection[];
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => Promise<void>;
}

/**
 * Multi-select recipes (search + collection filter) to assemble a shopping list.
 */
export function SelectRecipesForShoppingListModal({
  visible,
  recipes,
  collections,
  onClose,
  onConfirm,
}: SelectRecipesForShoppingListModalProps) {
  const { t } = useTranslation();
  const { colors, scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const inactiveChipBg = isDark ? 'rgba(40,36,48,0.6)' : 'rgba(255,255,255,0.55)';

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelectedCollectionId(null);
    setChecked(new Set());
    setError(null);
    setSaving(false);
  }, [visible]);

  const collectionAllowlist = useMemo(() => {
    if (!selectedCollectionId) return null;
    const collection = collections.find((c) => c.id === selectedCollectionId);
    return new Set(collection?.recipeIds ?? []);
  }, [collections, selectedCollectionId]);

  const displayedRecipes = useMemo(
    () =>
      filterAndSortRecipes(recipes, {
        searchQuery: deferredSearch,
        sort: 'title_asc',
        recipeIdAllowlist: collectionAllowlist,
      }),
    [recipes, deferredSearch, collectionAllowlist],
  );

  const selectedCount = checked.size;
  const visibleIds = useMemo(
    () => displayedRecipes.map((r) => r.id),
    [displayedRecipes],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => checked.has(id));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  function deselectVisible() {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setChecked(new Set());
  }

  async function handleConfirm() {
    if (selectedCount === 0) {
      setError(t('list.pickRecipes'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm([...checked]);
      onClose();
    } catch (err) {
      setError(translateAppError(err, t, 'list.fromRecipesFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('list.fromRecipesTitle')}
      maxWidth={560}
      footer={
        <View className="border-t px-5 py-4" style={{ borderColor: colors.border }}>
          {error ? (
            <Text className="mb-3 text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            className="items-center justify-center rounded-2xl py-3.5 active:opacity-80"
            style={{
              backgroundColor: colors.primary,
              opacity: saving || selectedCount === 0 ? 0.55 : 1,
            }}
            disabled={saving || selectedCount === 0}
            onPress={() => void handleConfirm()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">
                {selectedCount === 1
                  ? t('list.addRecipesOne', { count: selectedCount })
                  : t('list.addRecipesOther', { count: selectedCount })}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View className="flex-1 px-5">
        <Text className="mb-3 text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('list.fromRecipesHint')}
        </Text>

        <View
          className="mb-3 flex-row items-center rounded-[20px] px-3.5"
          style={{
            backgroundColor: colors.frosted,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
          }}
        >
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            className="flex-1 px-3 py-3.5 text-base"
            style={{ color: colors.text }}
            placeholder={t('list.searchRecipes')}
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={8}
              className="active:opacity-70"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {collections.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3 flex-grow-0"
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            <Pressable
              onPress={() => setSelectedCollectionId(null)}
              className="rounded-[14px] px-3.5 py-2 active:opacity-80"
              style={{
                backgroundColor:
                  selectedCollectionId == null ? colors.primary : inactiveChipBg,
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCollectionId == null }}
            >
              <Text
                className="text-sm font-semibold"
                style={{
                  color: selectedCollectionId == null ? '#fff' : colors.text,
                }}
              >
                {t('list.allCollections')}
              </Text>
            </Pressable>
            {collections.map((collection) => {
              const selected = selectedCollectionId === collection.id;
              return (
                <Pressable
                  key={collection.id}
                  onPress={() =>
                    setSelectedCollectionId((prev) =>
                      prev === collection.id ? null : collection.id,
                    )
                  }
                  className="rounded-[14px] px-3.5 py-2 active:opacity-80"
                  style={{
                    backgroundColor: selected ? colors.primary : inactiveChipBg,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: selected ? '#fff' : colors.text }}
                  >
                    {collection.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View className="mb-2 flex-row items-center justify-between gap-2">
          <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
            {t('list.recipesVisible', { count: displayedRecipes.length })}
          </Text>
          <View className="flex-row items-center gap-3">
            {selectedCount > 0 ? (
              <Pressable onPress={clearSelection} hitSlop={6} className="active:opacity-70">
                <Text className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                  {t('list.clearSelection')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={allVisibleSelected ? deselectVisible : selectAllVisible}
              hitSlop={6}
              className="active:opacity-70"
              disabled={visibleIds.length === 0}
            >
              <Text
                className="text-xs font-bold"
                style={{
                  color: visibleIds.length === 0 ? colors.textSecondary : colors.primary,
                }}
              >
                {allVisibleSelected ? t('list.clearSelection') : t('list.selectAll')}
              </Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerStyle={
            displayedRecipes.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : undefined
          }
          ListEmptyComponent={
            <Text className="py-8 text-center text-sm" style={{ color: colors.textSecondary }}>
              {recipes.length === 0 ? t('list.noRecipesYet') : t('list.noRecipesMatch')}
            </Text>
          }
          renderItem={({ item, index }) => {
            const isOn = checked.has(item.id);
            const title = item.display_title?.trim() || item.title;
            const ingredientCount = item.ingredients?.length ?? 0;
            return (
              <Pressable
                className={`flex-row items-center gap-3 py-3.5 active:opacity-80 ${
                  index < displayedRecipes.length - 1 ? 'border-b' : ''
                }`}
                style={
                  index < displayedRecipes.length - 1
                    ? { borderColor: colors.primarySoft }
                    : undefined
                }
                onPress={() => toggle(item.id)}
              >
                <View
                  className="h-6 w-6 items-center justify-center rounded-md border-2"
                  style={{
                    borderColor: isOn ? colors.primary : colors.textSecondary,
                    backgroundColor: isOn ? colors.primary : 'transparent',
                  }}
                >
                  {isOn ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-base font-medium"
                    style={{ color: colors.text }}
                    numberOfLines={2}
                  >
                    {title}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.textSecondary }}>
                    {ingredientCount === 1
                      ? t('list.ingredientCountOne', { count: ingredientCount })
                      : t('list.ingredientCountOther', { count: ingredientCount })}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </SheetModal>
  );
}
