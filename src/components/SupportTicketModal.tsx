import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { FieldInput } from '@/components/text-input';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { TileLabel } from '@/components/ui/Tile';
import { useAuth } from '@/hooks/useAuth';
import { supportErrorKey } from '@shared/lib/serverErrors';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { getFeedbackContext } from '@/lib/supabase/feedback';
import {
  submitSupportTicket,
  type SupportTicketCategory,
} from '@/lib/supabase/supportTickets';

const CATEGORIES: SupportTicketCategory[] = ['bug', 'billing', 'account', 'other'];

interface SupportTicketModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SupportTicketModal({ visible, onClose }: SupportTicketModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguagePreference();
  const [category, setCategory] = useState<SupportTicketCategory>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitSupportTicket({
        category,
        message,
        email: user?.email ?? null,
        context: getFeedbackContext(language),
      });
      setMessage('');
      setCategory('bug');
      onClose();
      Alert.alert(t('support.sentTitle'), t('support.sentBody'));
    } catch (err) {
      const limitKey = supportErrorKey(err);
      Alert.alert(
        t('support.sendFailed'),
        limitKey ? t(limitKey) : err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetModal
      trackId="support_ticket.sheet"
      visible={visible}
      onClose={onClose}
      title={t('support.title')}
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
          {t('support.hint')}
        </Text>

        <TileLabel accessibilityRole="header">{t('support.category')}</TileLabel>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('support.category')}
        >
          {CATEGORIES.map((item) => (
            <Chip
              key={item}
              trackId={`support_ticket.category.${item}`}
              kind="radio"
              selected={category === item}
              onPress={() => setCategory(item)}
            >
              {t(`support.categories.${item}`)}
            </Chip>
          ))}
        </View>

        <TileLabel accessibilityRole="header">{t('support.whatHappened')}</TileLabel>
        <FieldInput
          multiline
          value={message}
          onChangeText={setMessage}
          placeholder={t('support.placeholder')}
          accessibilityLabel={t('support.whatHappened')}
          editable={!submitting}
          containerStyle={{ minHeight: 140 }}
        />

        {user?.email ? (
          <Text variant="caption" tone="muted">
            {t('support.replyTo', { email: user.email })}
          </Text>
        ) : null}

        <Button
          trackId="support_ticket.submit"
          size="lg"
          fullWidth
          busy={submitting}
          accessibilityLabel={t('support.submit')}
          onPress={() => void handleSubmit()}
          style={{ marginTop: 8 }}
        >
          {t('support.submit')}
        </Button>
        <Button trackId="support_ticket.cancel" variant="ghost" fullWidth onPress={onClose}>
          {t('common.cancel')}
        </Button>
      </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
