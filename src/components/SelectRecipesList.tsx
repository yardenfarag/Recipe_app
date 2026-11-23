import Ionicons from '@expo/vector-icons/Ionicons';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, View } from 'react-native';

import { FieldInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { HAIRLINE } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { filterAndSortRecipes } from '@shared/lib/recipeListQuery';
import type { RecipeCollection } from '@shared/types/collection';
import type { Recipe } from '@shared/types/recipe';

function toggleOrderedId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((item) => item !== id);
  return [...ids, id];
}

/** The hairline between two recipes, from the end of the checkbox. */
function RowDivider() {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={{ height: HAIRLINE, backgroundColor: colors.border, marginStart: 44, marginEnd: 8 }}
    />
  );
}

type SelectRecipesListProps = {
  recipes: Recipe[];
  collections: RecipeCollection[];
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  hint?: string;
};

/** Search + collection chips + checkbox rows on a tile. Selection order is tap order. */
export function SelectRecipesList({
  recipes,
  collections,
  selectedIds,
  onChangeSelectedIds,
  hint,
}: SelectRecipesListProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

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

  const selectedCount = selectedIds.length;
  const visibleIds = useMemo(
    () => displayedRecipes.map((recipe) => recipe.id),
    [displayedRecipes],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  function selectAllVisible() {
    const next = [...selectedIds];
    for (const id of visibleIds) {
      if (!next.includes(id)) next.push(id);
    }
    onChangeSelectedIds(next);
  }

  function deselectVisible() {
    onChangeSelectedIds(selectedIds.filter((id) => !visibleIds.includes(id)));
  }

  return (
    <View style={{ flex: 1, gap: 12 }}>
      {hint ? (
        <Text variant="bodySmall" tone="muted">
          {hint}
        </Text>
      ) : null}

      <FieldInput
        placeholder={t('list.searchRecipes')}
        accessibilityLabel={t('a11y.searchRecipes')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        leading={<Ionicons name="search-outline" size={18} color={colors.textSecondary} />}
        trailing={
          search.length > 0 ? (
            <IconButton
              trackId="select_recipes.search.clear"
              icon="close-circle"
              iconSize={18}
              label={t('a11y.clearSearch')}
              onPress={() => setSearch('')}
            />
          ) : null
        }
      />

      {collections.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8 }}
        >
          <Chip
            trackId="select_recipes.collection.all"
            size="sm"
            selected={selectedCollectionId == null}
            onPress={() => setSelectedCollectionId(null)}
          >
            {t('list.allCollections')}
          </Chip>
          {collections.map((collection) => (
            <Chip
              key={collection.id}
              trackId="select_recipes.collection.select"
              size="sm"
              selected={selectedCollectionId === collection.id}
              onPress={() =>
                setSelectedCollectionId((prev) => (prev === collection.id ? null : collection.id))
              }
            >
              {collection.name}
            </Chip>
          ))}
        </ScrollView>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="label" style={{ flexShrink: 1 }}>
          {t('list.recipesVisible', { count: displayedRecipes.length })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {selectedCount > 0 ? (
            <Button
              trackId="select_recipes.selection.clear"
              variant="ghost"
              size="sm"
              accessibilityLabel={t('a11y.clearSelectedRecipes')}
              onPress={() => onChangeSelectedIds([])}
            >
              {t('list.clearSelection')}
            </Button>
          ) : null}
          <Button
            trackId={allVisibleSelected ? 'select_recipes.deselect_visible' : 'select_recipes.select_all_visible'}
            variant="secondary"
            size="sm"
            disabled={visibleIds.length === 0}
            onPress={allVisibleSelected ? deselectVisible : selectAllVisible}
          >
            {allVisibleSelected ? t('list.clearSelection') : t('list.selectAll')}
          </Button>
        </View>
      </View>

      <Tile style={{ flex: 1, overflow: 'hidden' }}>
        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={[
            { paddingHorizontal: 8, paddingVertical: 4 },
            displayedRecipes.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : null,
          ]}
          ItemSeparatorComponent={RowDivider}
          ListEmptyComponent={
            <Text variant="bodySmall" tone="muted" align="center" style={{ paddingVertical: 32 }}>
              {recipes.length === 0 ? t('list.noRecipesYet') : t('list.noRecipesMatch')}
            </Text>
          }
          renderItem={({ item }) => {
            const isOn = selectedIds.includes(item.id);
            const title = item.display_title?.trim() || item.title;
            const ingredientCount = item.ingredients?.length ?? 0;
            const countLabel =
              ingredientCount === 1
                ? t('list.ingredientCountOne', { count: ingredientCount })
                : t('list.ingredientCountOther', { count: ingredientCount });
            return (
              <Pressable
                trackId="select_recipes.recipe.toggle"
                onPress={() => onChangeSelectedIds(toggleOrderedId(selectedIds, item.id))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOn }}
                accessibilityLabel={`${title}, ${countLabel}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 56,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 16,
                  backgroundColor: pressed ? colors.backgroundElement : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: isOn ? 0 : 2,
                    borderColor: colors.textSecondary,
                    backgroundColor: isOn ? colors.primary : 'transparent',
                  }}
                >
                  {isOn ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodySmall" weight="semibold" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {countLabel}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      </Tile>
    </View>
  );
}
