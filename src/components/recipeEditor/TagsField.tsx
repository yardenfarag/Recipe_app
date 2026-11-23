import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { logTap } from '@/lib/interactionLog';
import { translateRecipeTag } from '@shared/lib/recipeTags';

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
  const type = useTypography();
  const [input, setInput] = useState('');

  function add() {
    if (!input.trim()) return;
    onAdd(input);
    setInput('');
  }

  return (
    <View style={{ gap: 10 }}>
      {tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tags.map((tag) => (
            <Chip
              key={tag}
              size="sm"
              trackId="recipe_editor.tag.remove"
              onPress={() => onRemove(tag)}
              accessibilityLabel={t('tags.remove', { tag: translateRecipeTag(tag, t) })}
            >
              <Text numberOfLines={1} style={{ ...type.font('body', 'semibold'), fontSize: 13, lineHeight: 17 }}>
                {translateRecipeTag(tag, t)}
              </Text>
              <Ionicons name="close" size={14} color={colors.textSecondary} />
            </Chip>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
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
        <IconButton
          variant="tile"
          icon="add"
          label={t('recipeEditor.add.tag')}
          trackId="recipe_editor.tag.add"
          onPress={add}
          style={{ width: 52, height: 52, borderRadius: 16 }}
        />
      </View>
    </View>
  );
}
