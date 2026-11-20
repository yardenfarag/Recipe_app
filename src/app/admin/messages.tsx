import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, ScrollView, Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin/AdminOnly';
import { MessageComposer } from '@/components/admin/messages/MessageComposer';
import { MessageList } from '@/components/admin/messages/MessageList';
import { duplicateForm, emptyForm, formFromMessage, type MessageForm } from '@/components/admin/messages/form';
import { Screen } from '@/components/Screen';
import { Pressable } from '@/components/ui/Pressable';
import { refreshInAppMessagesNow } from '@/hooks/useInAppMessages';
import { useThemePreference } from '@/hooks/useThemePreference';
import { errorText } from '@shared/lib/errorText';
import type { AdminMessage, MessageStatus } from '@shared/lib/inAppMessages';
import { listAdminMessages } from '@shared/lib/supabase/adminMessages';

type Editing = { key: number; form: MessageForm; status: MessageStatus | null };

export default function AdminMessagesScreen() {
  return (
    <AdminOnly>
      <MessagesBody />
    </AdminOnly>
  );
}

function MessagesBody() {
  const { colors } = useThemePreference();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setMessages(await listAdminMessages());
    } catch (err) {
      setError(errorText(err, 'Could not load messages.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // The Android back button leaves the composer before it leaves the screen.
  useEffect(() => {
    if (!editing || Platform.OS === 'web') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditing(null);
      return true;
    });
    return () => subscription.remove();
  }, [editing]);

  const open = (form: MessageForm, status: MessageStatus | null) => {
    setNotice(null);
    setEditing({ key: Date.now(), form, status });
  };

  const done = (text: string) => {
    setNotice(text);
    setEditing(null);
    void refresh();
    // A message that targets this admin shows here without leaving the app and coming back.
    refreshInAppMessagesNow();
  };

  return (
    <Screen dense>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-1 mt-2 text-2xl font-bold" style={{ color: colors.text }} accessibilityRole="header">
          {editing ? (editing.form.id ? 'Edit message' : 'New message') : 'Messages'}
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          Popups, announcements and update prompts shown inside the app to signed-in users. Only admins can see this.
        </Text>

        {notice ? (
          <View className="mb-4 rounded-[14px] p-3" style={{ backgroundColor: colors.successSoft }} accessibilityRole="alert">
            <Text className="text-sm font-semibold" style={{ color: colors.success }}>
              {notice}
            </Text>
          </View>
        ) : null}

        {editing ? (
          <>
            <Pressable
              trackId="admin.messages.back"
              onPress={() => setEditing(null)}
              accessibilityRole="button"
              accessibilityLabel="Back to all messages"
              className="mb-3 self-start"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                ← All messages
              </Text>
            </Pressable>
            <MessageComposer
              key={editing.key}
              initial={editing.form}
              initialStatus={editing.status}
              onCancel={() => setEditing(null)}
              onDone={done}
            />
          </>
        ) : (
          <MessageList
            messages={messages}
            loading={loading}
            error={error}
            onNew={() => open(emptyForm(), null)}
            onEdit={(message) => open(formFromMessage(message), message.status)}
            onDuplicate={(message) => open(duplicateForm(formFromMessage(message)), null)}
            onChanged={(text) => {
              setNotice(text);
              void refresh();
              refreshInAppMessagesNow();
            }}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
