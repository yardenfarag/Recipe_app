import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { TextInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { announce } from '@/lib/a11y';
import { logTap } from '@/lib/interactionLog';
import { translateAppError } from '@shared/lib/translateAppError';
import type { RecipeCollection } from '@shared/types/collection';

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
  const type = useTypography();
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
      const message = translateAppError(err, t, 'library.couldNotCreateCollection');
      setError(message);
      announce(message);
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
      const message = translateAppError(err, t, 'library.couldNotUpdateCollections');
      setError(message);
      announce(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      trackId="add_to_collection.sheet"
      visible={visible}
      onClose={onClose}
      title={t('library.addToCollection')}
      maxWidth={520}
      headerRight={
        <Button
          variant="secondary"
          size="sm"
          trackId="add_to_collection.save"
          busy={saving}
          accessibilityLabel={t('common.save')}
          onPress={() => void handleSave()}
        >
          {t('common.save')}
        </Button>
      }
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Tile style={{ paddingHorizontal: 16 }}>
          {localCollections.length === 0 ? (
            <Text variant="bodySmall" tone="muted" style={{ paddingVertical: 16 }}>
              {t('library.noCollectionsYet')}
            </Text>
          ) : (
            localCollections.map((collection, index) => {
              const isOn = checked.has(collection.id);
              const count = collection.recipeIds.length;
              const countText =
                count === 1
                  ? t('library.recipeCountOne', { count })
                  : t('library.recipeCountOther', { count });
              return (
                <Pressable
                  trackId="add_to_collection.collection.toggle"
                  key={collection.id}
                  onPress={() => toggle(collection.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isOn }}
                  accessibilityLabel={`${collection.name}, ${countText}`}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 60,
                      paddingVertical: 10,
                      borderBottomWidth: index < localCollections.length - 1 ? HAIRLINE : 0,
                      borderBottomColor: colors.border,
                    },
                    pressed ? { opacity: 0.8 } : null,
                  ]}
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
                    {isOn ? <KitIcon icon="checkmark" color={colors.onPrimary} size={16} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text weight="semibold" numberOfLines={1}>
                      {collection.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {countText}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </Tile>

        <View style={{ gap: 8 }}>
          <TileLabel accessibilityRole="header">{t('library.newCollection')}</TileLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[
                type.font('body', 'regular'),
                {
                  flex: 1,
                  minHeight: 48,
                  fontSize: 16,
                  paddingHorizontal: 16,
                  borderRadius: Radii.control,
                  borderWidth: HAIRLINE,
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  textAlign: type.rtl ? 'right' : 'left',
                },
              ]}
              placeholder={t('library.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('a11y.newCollectionName')}
              value={newName}
              onChangeText={setNewName}
              returnKeyType="done"
              onSubmitEditing={() => {
                logTap('add_to_collection.create.submit_key');
                void handleCreate();
              }}
            />
            {creating ? (
              <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primaryText} accessibilityLabel={t('a11y.createCollection')} />
              </View>
            ) : (
              <IconButton
                variant="tile"
                icon="add"
                label={t('a11y.createCollection')}
                trackId="add_to_collection.create"
                onPress={() => void handleCreate()}
                style={{ width: 48, height: 48 }}
              />
            )}
          </View>
        </View>

        {error ? (
          <View style={{ borderRadius: Radii.inner, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.dangerSoft }}>
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}
