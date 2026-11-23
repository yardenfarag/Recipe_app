import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { TextInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { announce } from '@/lib/a11y';
import { logTap } from '@/lib/interactionLog';
import { translateAppError } from '@shared/lib/translateAppError';

interface NameEditModalProps {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  /** Extra content below the field (e.g. delete action). */
  footer?: ReactNode;
  /** Prefix for admin Activity log ids ('.cancel', '.save', '.submit'). */
  trackId?: string;
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
  trackId = 'name_edit',
}: NameEditModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

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
      announce(t('library.nameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      const message = translateAppError(err, t, 'library.couldNotSave');
      setError(message);
      announce(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      trackId={`${trackId}.sheet`}
      visible={visible}
      onClose={onClose}
      title={title}
      maxWidth={480}
      showCloseButton={false}
      headerLeft={
        <Button variant="ghost" size="sm" trackId={`${trackId}.cancel`} disabled={saving} onPress={onClose}>
          {t('common.cancel')}
        </Button>
      }
      headerRight={
        <Button
          variant="secondary"
          size="sm"
          trackId={`${trackId}.save`}
          busy={saving}
          accessibilityLabel={t('common.save')}
          onPress={() => void handleSave()}
        >
          {t('common.save')}
        </Button>
      }
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <TextInput
          style={[
            type.font('body', 'regular'),
            {
              minHeight: 52,
              fontSize: 16,
              paddingHorizontal: 16,
              borderRadius: Radii.inner,
              borderWidth: HAIRLINE,
              color: colors.text,
              borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
              backgroundColor: colors.surface,
              textAlign: type.rtl ? 'right' : 'left',
            },
          ]}
          placeholder={placeholder ?? t('library.namePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={title}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (error) setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            logTap(`${trackId}.submit`);
            void handleSave();
          }}
        />
        {error ? (
          <Text variant="bodySmall" tone="danger" style={{ marginTop: 10 }}>
            {error}
          </Text>
        ) : null}
        {footer}
      </View>
    </SheetModal>
  );
}
