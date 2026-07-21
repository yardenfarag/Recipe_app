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
import type { RecipeCollection } from '@/types/collection';

interface AddToCollectionModalProps {
  visible: boolean;
  collections: RecipeCollection[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (collectionIds: string[]) => Promise<void>;
  onCreate: (name: string) => Promise<RecipeCollection>;
}

export function AddToCollectionModal({
  visible,
  collections,
  selectedIds,
  onClose,
  onSave,
  onCreate,
}: AddToCollectionModalProps) {
  const { colors } = useThemePreference();
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localCollections, setLocalCollections] = useState<RecipeCollection[]>([]);

  useEffect(() => {
    if (!visible) return;
    setChecked(new Set(selectedIds));
    setLocalCollections(collections);
    setNewName('');
    setError(null);
    setSaving(false);
    setCreating(false);
  }, [visible, selectedIds, collections]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(trimmed);
      setLocalCollections((prev) => [...prev, created]);
      setChecked((prev) => new Set([...prev, created.id]));
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create collection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave([...checked]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update collections.');
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
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            Add to collection
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
          <View
            className="mb-4 rounded-3xl border px-4"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            {localCollections.length === 0 ? (
              <Text className="py-4 text-sm" style={{ color: colors.textSecondary }}>
                No collections yet — create one below.
              </Text>
            ) : (
              localCollections.map((collection, index) => {
                const isOn = checked.has(collection.id);
                return (
                  <Pressable
                    key={collection.id}
                    className={`flex-row items-center gap-3 py-3.5 active:opacity-80 ${
                      index < localCollections.length - 1 ? 'border-b' : ''
                    }`}
                    style={
                      index < localCollections.length - 1
                        ? { borderColor: colors.primarySoft }
                        : undefined
                    }
                    onPress={() => toggle(collection.id)}
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
                      <Text className="text-base font-medium" style={{ color: colors.text }}>
                        {collection.name}
                      </Text>
                      <Text className="text-xs" style={{ color: colors.textSecondary }}>
                        {collection.recipeIds.length} recipe
                        {collection.recipeIds.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          <Text
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: colors.textSecondary }}
          >
            New collection
          </Text>
          <View className="mb-4 flex-row gap-2">
            <TextInput
              className="flex-1 rounded-2xl border px-4 py-3 text-base"
              style={{
                color: colors.text,
                borderColor: colors.frostedBorder,
                backgroundColor: colors.surface,
              }}
              placeholder="Name"
              placeholderTextColor={colors.textSecondary}
              value={newName}
              onChangeText={setNewName}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreate()}
            />
            <Pressable
              className="items-center justify-center rounded-2xl px-4 active:opacity-80"
              style={{ backgroundColor: colors.accent, opacity: creating ? 0.7 : 1 }}
              disabled={creating}
              onPress={() => void handleCreate()}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="add" size={22} color="#fff" />
              )}
            </Pressable>
          </View>

          {error ? (
            <View
              className="mb-4 rounded-2xl border px-4 py-3"
              style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
            >
              <Text className="text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="border-t px-5 py-4" style={{ borderColor: colors.border }}>
          <Pressable
            className="items-center rounded-full py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }}
            disabled={saving}
            onPress={() => void handleSave()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-sm font-bold text-white">Save</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
