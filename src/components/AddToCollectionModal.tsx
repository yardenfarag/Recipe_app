import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { translateAppError } from '@/lib/translateAppError';
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
  const { t } = useTranslation();
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
      setError(translateAppError(err, t, 'library.couldNotCreateCollection'));
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
      setError(translateAppError(err, t, 'library.couldNotUpdateCollections'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('library.addToCollection')}
      maxWidth={520}
      headerRight={
        <Pressable onPress={() => void handleSave()} disabled={saving}>
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
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <View
          className="mb-4 rounded-3xl border px-4"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          {localCollections.length === 0 ? (
            <Text className="py-4 text-sm" style={{ color: colors.textSecondary }}>
              {t('library.noCollectionsYet')}
            </Text>
          ) : (
            localCollections.map((collection, index) => {
              const isOn = checked.has(collection.id);
              const count = collection.recipeIds.length;
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
                      {count === 1
                        ? t('library.recipeCountOne', { count })
                        : t('library.recipeCountOther', { count })}
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
          {t('library.newCollection')}
        </Text>
        <View className="mb-4 flex-row gap-2">
          <TextInput
            className="flex-1 rounded-2xl border px-4 py-3 text-base"
            style={{
              color: colors.text,
              borderColor: colors.frostedBorder,
              backgroundColor: colors.surface,
            }}
            placeholder={t('library.namePlaceholder')}
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
    </SheetModal>
  );
}
