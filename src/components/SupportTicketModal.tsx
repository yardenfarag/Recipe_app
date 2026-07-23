import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  submitSupportTicket,
  type SupportTicketCategory,
} from '@/lib/supabase/supportTickets';

const CATEGORIES: { key: SupportTicketCategory; label: string }[] = [
  { key: 'bug', label: 'Bug' },
  { key: 'billing', label: 'Billing / plan' },
  { key: 'account', label: 'Account' },
  { key: 'other', label: 'Other' },
];

interface SupportTicketModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SupportTicketModal({ visible, onClose }: SupportTicketModalProps) {
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
      Alert.alert('Ticket sent', 'Thanks — we’ll look into it.');
    } catch (err) {
      Alert.alert(
        'Could not send',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text className="mb-1 text-2xl font-bold" style={{ color: colors.text }}>
            Report an issue
          </Text>
          <Text className="mb-5 text-sm leading-5" style={{ color: colors.textSecondary }}>
            Tell us what went wrong. We read every ticket.
          </Text>

          <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
            Category
          </Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {CATEGORIES.map((item) => {
              const selected = category === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setCategory(item.key)}
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
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
            What happened?
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
            placeholder="Steps, what you expected, and what you saw…"
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
              <Text className="text-base font-bold text-white">Submit ticket</Text>
            )}
          </Pressable>

          <Pressable onPress={onClose} className="items-center py-3 active:opacity-70">
            <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
              Cancel
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
