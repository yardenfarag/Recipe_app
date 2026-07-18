import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';
import { RECIPE_SORT_OPTIONS, RecipeSortKey } from '@/lib/recipeListQuery';

interface RecipeLibraryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: RecipeSortKey;
  onSortChange: (value: RecipeSortKey) => void;
  resultCount: number;
  isSearchPending?: boolean;
}

export function RecipeLibraryToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  resultCount,
  isSearchPending,
}: RecipeLibraryToolbarProps) {
  const { colors } = useThemePreference();

  return (
    <View className="gap-3">
      <View className="flex-row items-center rounded-2xl border border-pinch-border bg-pinch-surface px-3.5 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          className="flex-1 px-3 py-3 text-base text-pinch-dark dark:text-pinch-text-dark"
          placeholder="Search recipes or ingredients"
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
              className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-80 ${
                active
                  ? 'border-pinch-primary bg-pinch-primary dark:border-pinch-primary-dark dark:bg-pinch-primary-dark'
                  : 'border-pinch-border bg-pinch-surface dark:border-pinch-border-dark dark:bg-pinch-surface-dark'
              }`}
            >
              <Ionicons
                name={option.icon as keyof typeof Ionicons.glyphMap}
                size={14}
                color={active ? '#fff' : colors.primary}
              />
              <Text
                className={`text-sm font-semibold ${
                  active ? 'text-white' : 'text-pinch-dark dark:text-pinch-text-dark'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text
        className={`text-xs text-pinch-muted dark:text-pinch-muted-dark ${isSearchPending ? 'opacity-60' : ''}`}
      >
        {resultCount} {resultCount === 1 ? 'recipe' : 'recipes'}
      </Text>
    </View>
  );
}
