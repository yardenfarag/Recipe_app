import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { translateAppError } from '@/lib/translateAppError';

interface NameEditModalProps {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  /** Extra content below the field (e.g. delete action). */
  footer?: ReactNode;
}

/** Page-sheet name editor used for renaming recipes (and similar flows). */
export function NameEditModal({
  visible,
  title,
  initialValue,
  placeholder,
  onClose,
  onSave,
  footer,
}: NameEditModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(initialValue);
    setSaving(false);
    setError(null);
  }, [visible, initialValue]);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(t('library.nameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(translateAppError(err, t, 'library.couldNotSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={title}
      maxWidth={480}
      showCloseButton={false}
      headerLeft={
        <Pressable onPress={onClose} disabled={saving}>
          <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
        </Pressable>
      }
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
      <View className="px-5 pt-5">
        <TextInput
          className="rounded-2xl border px-4 py-3 text-base"
          style={{
            color: colors.text,
            borderColor: colors.frostedBorder,
            backgroundColor: colors.surface,
          }}
          placeholder={placeholder ?? t('library.namePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (error) setError(null);
          }}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void handleSave()}
        />
        {error ? (
          <Text className="mt-3 text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        {footer}
      </View>
    </SheetModal>
  );
}
