import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { SheetModal } from '@/components/SheetModal';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
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
  const { colors } = useThemePreference();
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
      });
      setMessage('');
      setCategory('bug');
      onClose();
      Alert.alert(t('support.sentTitle'), t('support.sentBody'));
    } catch (err) {
      Alert.alert(
        t('support.sendFailed'),
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
      title={t('support.title')}
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
          {t('support.hint')}
        </Text>

        <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
          {t('support.category')}
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {CATEGORIES.map((item) => {
            const selected = category === item;
            return (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                className="rounded-full px-3 py-2"
                style={{
                  backgroundColor: selected ? colors.primarySoft : colors.frosted,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.frostedBorder,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selected ? colors.primary : colors.text }}
                >
                  {t(`support.categories.${item}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
          {t('support.whatHappened')}
        </Text>
        <TextInput
          className="mb-4 min-h-[140px] rounded-[18px] px-4 py-3 text-base"
          style={{
            color: colors.text,
            backgroundColor: colors.frosted,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
            textAlignVertical: 'top',
          }}
          multiline
          value={message}
          onChangeText={setMessage}
          placeholder={t('support.placeholder')}
          placeholderTextColor={colors.textSecondary}
          editable={!submitting}
        />

        <Pressable
          className="mb-3 items-center rounded-[22px] py-4"
          style={{ backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}
          onPress={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-bold text-white">{t('support.submit')}</Text>
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
