import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { TextInput } from '@/components/text-input';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

const COOK_NOTE_MAX = 160;

type CookedNoteModalProps = {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (note: string) => void;
};

/** Optional one-line note after marking a recipe cooked. Empty is allowed. */
export function CookedNoteModal({
  visible,
  initialValue,
  onClose,
  onSave,
}: CookedNoteModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign } = useRtl();
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    if (!visible) return;
    setDraft(initialValue);
  }, [visible, initialValue]);

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('recipe.cookedNoteTitle')}
      maxWidth={480}
      showCloseButton={false}
      headerLeft={
        <Pressable onPress={onClose}>
          <Text style={{ color: colors.textSecondary }}>{t('common.notNow')}</Text>
        </Pressable>
      }
      headerRight={
        <Pressable
          onPress={() => {
            onSave(draft.trim());
            onClose();
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('common.save')}</Text>
        </Pressable>
      }
    >
      <View className="px-5 pb-6">
        <Text className="mb-3 text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('recipe.cookedNoteHint')}
        </Text>
        <TextInput
          value={draft}
          onChangeText={(value) => setDraft(value.slice(0, COOK_NOTE_MAX))}
          placeholder={t('recipe.cookedNotePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          maxLength={COOK_NOTE_MAX}
          className="min-h-[48px] rounded-2xl border px-4 py-3 text-base"
          style={{ borderColor: colors.border, color: colors.text, textAlign }}
        />
      </View>
    </SheetModal>
  );
}
