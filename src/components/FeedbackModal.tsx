import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { SheetModal } from '@/components/SheetModal';
import { TextInput } from '@/components/text-input';
import { useThemePreference } from '@/hooks/useThemePreference';
import { showNotice } from '@/lib/confirmAction';
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  submitFeedback,
} from '@/lib/supabase/feedback';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useThemePreference();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = message.trim().length >= FEEDBACK_MIN_LENGTH && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitFeedback({ message, locale: i18n.language ?? null });
      setMessage('');
      onClose();
      void showNotice(t('feedback.sentTitle'), t('feedback.sentBody'));
    } catch (err) {
      console.warn('[feedback] submit failed', err);
      void showNotice(
        t('feedback.sendFailed'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('feedback.title')}
      maxWidth={520}
      showCloseButton
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <Text className="mb-5 text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('feedback.hint')}
        </Text>

        <TextInput
          className="mb-2 min-h-[140px] rounded-[18px] px-4 py-3 text-base"
          style={{
            color: colors.text,
            backgroundColor: colors.frosted,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
            textAlignVertical: 'top',
          }}
          multiline
          maxLength={FEEDBACK_MAX_LENGTH}
          value={message}
          onChangeText={setMessage}
          placeholder={t('feedback.placeholder')}
          placeholderTextColor={colors.textSecondary}
          editable={!submitting}
        />
        <Text className="mb-4 text-xs leading-4" style={{ color: colors.textSecondary }}>
          {t('feedback.deviceNote')}
        </Text>

        <Pressable
          className="mb-3 items-center rounded-[22px] py-4"
          style={{ backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.6 }}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-bold text-white">{t('feedback.submit')}</Text>
          )}
        </Pressable>

        <Pressable onPress={onClose} className="items-center py-3 active:opacity-70">
          <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
            {t('common.cancel')}
          </Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
