import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FieldInput } from '@/components/text-input';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { showNotice } from '@/lib/confirmAction';
import { supportErrorKey } from '@shared/lib/serverErrors';
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
      const limitKey = supportErrorKey(err);
      void showNotice(
        t('feedback.sendFailed'),
        limitKey ? t(limitKey) : err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetModal
      trackId="feedback.sheet"
      visible={visible}
      onClose={onClose}
      title={t('feedback.title')}
      maxWidth={520}
      showCloseButton
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Text variant="bodySmall" tone="muted" style={{ marginBottom: 8 }}>
            {t('feedback.hint')}
          </Text>

          <FieldInput
            multiline
            maxLength={FEEDBACK_MAX_LENGTH}
            value={message}
            onChangeText={setMessage}
            placeholder={t('feedback.placeholder')}
            accessibilityLabel={t('feedback.title')}
            editable={!submitting}
            containerStyle={{ minHeight: 140 }}
          />
          <Text variant="caption" tone="muted">
            {t('feedback.deviceNote')}
          </Text>

          <Button
            trackId="feedback.submit"
            size="lg"
            fullWidth
            busy={submitting}
            disabled={!canSubmit && !submitting}
            onPress={() => void handleSubmit()}
            style={{ marginTop: 8 }}
          >
            {t('feedback.submit')}
          </Button>
          <Button trackId="feedback.cancel" variant="ghost" fullWidth onPress={onClose}>
            {t('common.cancel')}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
