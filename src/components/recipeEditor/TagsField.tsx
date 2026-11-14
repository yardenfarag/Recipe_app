import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { logTap } from '@/lib/interactionLog';
import { useTranslation } from 'react-i18next';

import { useThemePreference } from '@/hooks/useThemePreference';
import { translateRecipeTag } from '@/lib/recipeTags';

import { EditorInput } from './EditorParts';

/** Chips with remove, plus an input to add one, like EditTagsModal but inline. */
export function TagsField({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [input, setInput] = useState('');

  function add() {
    if (!input.trim()) return;
    onAdd(input);
    setInput('');
  }

  return (
    <View className="gap-2">
      {tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tags.map((tag) => (
            <Pressable
              trackId="recipe_editor.tag.remove"
              key={tag}
              onPress={() => onRemove(tag)}
              accessibilityRole="button"
              accessibilityLabel={t('tags.remove', { tag: translateRecipeTag(tag, t) })}
              hitSlop={6}
              className="flex-row items-center gap-1 rounded-full border px-3 py-1.5 active:opacity-80"
              style={{ borderColor: colors.frostedBorder, backgroundColor: colors.surface }}
            >
              <Text className="text-sm" style={{ color: colors.text }}>
                {translateRecipeTag(tag, t)}
              </Text>
              <Ionicons name="close" size={14} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <EditorInput
          value={input}
          onChangeText={setInput}
          placeholder={t('recipeEditor.placeholders.tag')}
          accessibilityLabel={t('recipeEditor.placeholders.tag')}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {
            logTap('recipe_editor.tag.submit');
            add();
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Pressable
          trackId="recipe_editor.tag.add"
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel={t('recipeEditor.add.tag')}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl px-3 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Ionicons name="add" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
