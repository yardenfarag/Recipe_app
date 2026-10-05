import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { SheetModal } from '@/components/SheetModal';
import { TextInput } from '@/components/text-input';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { normalizeRecipeTags, translateRecipeTag } from '@/lib/recipeTags';

interface EditTagsModalProps {
  visible: boolean;
  tags: string[];
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
}

export function EditTagsModal({ visible, tags, onClose, onSave }: EditTagsModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [draft, setDraft] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft([...tags]);
    setInput('');
    setError(null);
    setSaving(false);
  }, [visible, tags]);

  function addTag() {
    const next = normalizeRecipeTags([...draft, input]);
    setDraft(next);
    setInput('');
  }

  function removeTag(tag: string) {
    setDraft((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(normalizeRecipeTags(draft));
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tags.saveFailed');
      setError(message);
      announce(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('tags.editTitle')}
      maxWidth={480}
      showCloseButton={false}
      headerLeft={
        <Pressable
          onPress={onClose}
          className="active:opacity-70"
          hitSlop={12}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
        </Pressable>
      }
      headerRight={
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.save')}
          accessibilityState={{ disabled: saving, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text className="font-bold" style={{ color: colors.primary }}>
              {t('common.save')}
            </Text>
          )}
        </Pressable>
      }
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        className="flex-1 px-5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View className="mb-4 flex-row flex-wrap gap-2">
          {draft.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => removeTag(tag)}
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
          {draft.length === 0 ? (
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {t('tags.empty')}
            </Text>
          ) : null}
        </View>

        <View className="mb-3 flex-row gap-2">
          <TextInput
            className="flex-1 rounded-2xl border px-4 py-3 text-base"
            style={{
              color: colors.text,
              borderColor: colors.frostedBorder,
              backgroundColor: colors.surface,
            }}
            placeholder={t('tags.addPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('tags.addPlaceholder')}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={addTag}
          />
          <Pressable
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            onPress={addTag}
            accessibilityRole="button"
            accessibilityLabel={t('tags.add')}
          >
            <Ionicons name="add" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>

        {error ? (
          <Text
            className="text-sm"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
