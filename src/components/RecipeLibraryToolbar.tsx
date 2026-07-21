import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';
import { RECIPE_SORT_OPTIONS, RecipeSortKey } from '@/lib/recipeListQuery';

export type LibraryCollectionChip = {
  id: string;
  name: string;
};

interface RecipeLibraryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: RecipeSortKey;
  onSortChange: (value: RecipeSortKey) => void;
  resultCount: number;
  isSearchPending?: boolean;
  favoritesOnly?: boolean;
  onToggleFavorites?: () => void;
  availableTags?: string[];
  selectedTags?: string[];
  onToggleTag?: (tag: string) => void;
  onClearTags?: () => void;
  collections?: LibraryCollectionChip[];
  selectedCollectionId?: string | null;
  onSelectCollection?: (id: string | null) => void;
  onLongPressCollection?: (id: string) => void;
  onManageCollection?: (id: string) => void;
  onCreateCollection?: () => void;
}

export function RecipeLibraryToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  resultCount,
  isSearchPending,
  favoritesOnly = false,
  onToggleFavorites,
  availableTags = [],
  selectedTags = [],
  onToggleTag,
  onClearTags,
  collections = [],
  selectedCollectionId = null,
  onSelectCollection,
  onLongPressCollection,
  onManageCollection,
  onCreateCollection,
}: RecipeLibraryToolbarProps) {
  const { colors, scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const inactiveChipBg = isDark ? 'rgba(40,36,48,0.6)' : 'rgba(255,255,255,0.55)';

  const filtersActive =
    sort !== 'newest' ||
    selectedTags.length > 0 ||
    selectedCollectionId != null;

  const [filtersOpen, setFiltersOpen] = useState(filtersActive);

  return (
    <View className="gap-3">
      <View
        className="flex-row items-center rounded-[20px] px-3.5"
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
          placeholder="Search recipes…"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => onSearchChange('')}
            hitSlop={8}
            className="active:opacity-70"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <View className="flex-row items-center gap-2">
        {onToggleFavorites ? (
          <Pressable
            onPress={onToggleFavorites}
            className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
            style={{
              backgroundColor: favoritesOnly ? colors.primary : inactiveChipBg,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: favoritesOnly }}
            accessibilityLabel="Favorites filter"
          >
            <Ionicons
              name={favoritesOnly ? 'heart' : 'heart-outline'}
              size={14}
              color={favoritesOnly ? '#fff' : colors.primary}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: favoritesOnly ? '#fff' : colors.text }}
            >
              Favorites
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
          style={{
            backgroundColor: filtersOpen || filtersActive ? colors.primarySoft : inactiveChipBg,
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          accessibilityLabel="Toggle filters"
        >
          <Ionicons name="options-outline" size={14} color={colors.primary} />
          <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
            Filter
          </Text>
          {filtersActive ? (
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colors.primary }}
            />
          ) : null}
        </Pressable>

        <Text
          className={`ml-auto text-xs ${isSearchPending ? 'opacity-60' : ''}`}
          style={{ color: colors.textSecondary }}
        >
          {resultCount} {resultCount === 1 ? 'recipe' : 'recipes'}
        </Text>
      </View>

      {filtersOpen ? (
        <View className="gap-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {RECIPE_SORT_OPTIONS.map((option) => {
              const active = sort === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onSortChange(option.key)}
                  className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
                  style={{
                    backgroundColor: active ? colors.primary : inactiveChipBg,
                  }}
                >
                  <Ionicons
                    name={option.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={active ? '#fff' : colors.primary}
                  />
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: active ? '#fff' : colors.text }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {availableTags.length > 0 && (
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: colors.textSecondary }}
                >
                  Tags
                </Text>
                {selectedTags.length > 0 && onClearTags ? (
                  <Pressable onPress={onClearTags} hitSlop={8} className="active:opacity-70">
                    <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                      Clear
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                keyboardShouldPersistTaps="handled"
              >
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => onToggleTag?.(tag)}
                      className="rounded-[14px] px-3.5 py-2 active:opacity-80"
                      style={{
                        backgroundColor: active ? colors.primary : inactiveChipBg,
                      }}
                    >
                      <Text
                        className="text-sm font-semibold capitalize"
                        style={{ color: active ? '#fff' : colors.text }}
                      >
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View className="gap-1.5">
            <Text
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: colors.textSecondary }}
            >
              Collections
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={() => onSelectCollection?.(null)}
                className="rounded-[14px] px-3.5 py-2 active:opacity-80"
                style={{
                  backgroundColor: selectedCollectionId == null ? colors.primary : inactiveChipBg,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selectedCollectionId == null ? '#fff' : colors.text }}
                >
                  All
                </Text>
              </Pressable>
              {collections.map((collection) => {
                const active = selectedCollectionId === collection.id;
                return (
                  <Pressable
                    key={collection.id}
                    onPress={() => onSelectCollection?.(active ? null : collection.id)}
                    onLongPress={() => onLongPressCollection?.(collection.id)}
                    className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
                    style={{
                      backgroundColor: active ? colors.primary : inactiveChipBg,
                    }}
                  >
                    <Ionicons
                      name="folder-outline"
                      size={14}
                      color={active ? '#fff' : colors.primary}
                    />
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: active ? '#fff' : colors.text }}
                    >
                      {collection.name}
                    </Text>
                    {onManageCollection ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onManageCollection(collection.id);
                        }}
                        hitSlop={8}
                        accessibilityLabel={`Manage ${collection.name}`}
                      >
                        <Ionicons
                          name="ellipsis-horizontal"
                          size={14}
                          color={active ? '#fff' : colors.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}
              {onCreateCollection ? (
                <Pressable
                  onPress={onCreateCollection}
                  className="flex-row items-center gap-1 rounded-[14px] border px-3.5 py-2 active:opacity-80"
                  style={{ borderColor: colors.frostedBorder, backgroundColor: inactiveChipBg }}
                >
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                    New
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
