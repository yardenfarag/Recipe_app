import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { normalizeRecipeTags } from '@/lib/recipeTags';

interface EditTagsModalProps {
  visible: boolean;
  tags: string[];
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
}

export function EditTagsModal({ visible, tags, onClose, onSave }: EditTagsModalProps) {
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
      setError(err instanceof Error ? err.message : 'Could not save tags.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
          <Pressable onPress={onClose} className="active:opacity-70">
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            Edit tags
          </Text>
          <Pressable onPress={() => void handleSave()} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text className="font-bold" style={{ color: colors.primary }}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
          <View className="mb-4 flex-row flex-wrap gap-2">
            {draft.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => removeTag(tag)}
                className="flex-row items-center gap-1 rounded-full border px-3 py-1.5 active:opacity-80"
                style={{ borderColor: colors.frostedBorder, backgroundColor: colors.surface }}
              >
                <Text className="text-sm capitalize" style={{ color: colors.text }}>
                  {tag}
                </Text>
                <Ionicons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            ))}
            {draft.length === 0 ? (
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                No tags yet — add a few below.
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
              placeholder="Add a tag"
              placeholderTextColor={colors.textSecondary}
              value={input}
              onChangeText={setInput}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={addTag}
            />
            <Pressable
              className="items-center justify-center rounded-2xl px-4 active:opacity-80"
              style={{ backgroundColor: colors.primary }}
              onPress={addTag}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          </View>

          {error ? (
            <Text className="text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
