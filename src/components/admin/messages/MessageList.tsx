import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ActionButton, Card } from '@/components/admin/messages/fields';
import {
  PRESENTATION_LABELS,
  STATUS_LABELS,
  TONE_LABELS,
  describeTargeting,
  describeWindow,
  statusActions,
} from '@/components/admin/messages/form';
import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { askConfirm } from '@/lib/dialog';
import { errorText } from '@shared/lib/errorText';
import { pickContent, type AdminMessage, type MessageStatus } from '@shared/lib/inAppMessages';
import { deleteAdminMessage, setAdminMessageStatus } from '@shared/lib/supabase/adminMessages';

type Filter = 'all' | MessageStatus;
const FILTERS: Filter[] = ['all', 'live', 'scheduled', 'draft', 'stopped', 'ended'];

type Props = {
  messages: AdminMessage[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onEdit: (message: AdminMessage) => void;
  onDuplicate: (message: AdminMessage) => void;
  /** After Stop, Resume or Delete: reload, and say what happened. */
  onChanged: (notice: string) => void;
};

export function MessageList({ messages, loading, error, onNew, onEdit, onDuplicate, onChanged }: Props) {
  const { colors } = useThemePreference();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const statusColor: Record<MessageStatus, string> = {
    draft: colors.textSecondary,
    scheduled: colors.primary,
    live: colors.success,
    stopped: colors.warning,
    ended: colors.textSecondary,
  };

  async function run(message: AdminMessage, work: () => Promise<void>, notice: string) {
    setActionError(null);
    setBusyId(message.id);
    try {
      await work();
      onChanged(notice);
    } catch (err) {
      setActionError(errorText(err, 'That did not work.'));
    } finally {
      setBusyId(null);
    }
  }

  async function stop(message: AdminMessage) {
    const ok = await askConfirm({
      trackId: 'admin.messages.stop_dialog',
      title: 'Stop this message?',
      message: `“${message.name}” disappears for users the next time their app fetches messages. You can resume it later.`,
      confirmLabel: 'Stop',
      cancelLabel: 'Cancel',
    });
    if (ok) await run(message, () => setAdminMessageStatus(message.id, 'stopped'), `Stopped “${message.name}”.`);
  }

  async function remove(message: AdminMessage) {
    const ok = await askConfirm({
      trackId: 'admin.messages.delete_dialog',
      title: 'Delete this message?',
      message: `“${message.name}” and its seen, dismissed and clicked records are deleted for good. To keep the counts, stop it instead.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (ok) await run(message, () => deleteAdminMessage(message.id), `Deleted “${message.name}”.`);
  }

  const shown = filter === 'all' ? messages : messages.filter((m) => m.status === filter);

  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
        <View className="flex-row flex-wrap gap-2" accessibilityRole="tablist">
          {FILTERS.map((value) => {
            const active = value === filter;
            const count = value === 'all' ? messages.length : messages.filter((m) => m.status === value).length;
            return (
              <Pressable
                key={value}
                trackId={`admin.messages.filter.${value}`}
                onPress={() => setFilter(value)}
                accessibilityRole="tab"
                accessibilityLabel={`${value === 'all' ? 'All' : STATUS_LABELS[value]}, ${count}`}
                accessibilityState={{ selected: active }}
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: active ? colors.primary : colors.primarySoft }}
              >
                <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
                  {value === 'all' ? 'All' : STATUS_LABELS[value]} {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <ActionButton label="New message" trackId="admin.messages.new" onPress={onNew} />
      </View>

      {error ? (
        <Text className="mb-3 text-sm" style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {actionError ? (
        <Text className="mb-3 text-sm" style={{ color: colors.danger }} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}

      {loading && messages.length === 0 ? (
        <ActivityIndicator color={colors.primary} />
      ) : shown.length === 0 ? (
        <Card>
          <Text className="text-sm" style={{ color: colors.textSecondary }}>
            {messages.length === 0
              ? 'No messages yet. Start with “New message”: pick a preset, write the words, then send it to yourself first.'
              : 'No messages with this status.'}
          </Text>
        </Card>
      ) : (
        shown.map((message) => {
          const actions = statusActions(message.status);
          const busy = busyId === message.id;
          const english = pickContent(message, 'en');
          return (
            <Card key={message.id}>
              <Pressable
                trackId="admin.messages.row.edit"
                onPress={() => onEdit(message)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${message.name}`}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-base font-bold" style={{ color: colors.text }}>
                    {message.name}
                  </Text>
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ borderWidth: 1, borderColor: statusColor[message.status] }}
                    accessibilityLabel={`Status ${STATUS_LABELS[message.status]}`}
                  >
                    <Text className="text-xs font-bold" style={{ color: statusColor[message.status] }}>
                      {STATUS_LABELS[message.status]}
                    </Text>
                  </View>
                </View>
                {english.title ? (
                  <Text className="mt-1 text-sm" style={{ color: colors.text }} numberOfLines={1}>
                    {english.title}
                  </Text>
                ) : null}
                <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                  {PRESENTATION_LABELS[message.presentation]} · {TONE_LABELS[message.tone]}
                  {message.required ? ' · Required' : ''} · Priority {message.priority}
                </Text>
                <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                  {describeWindow(message.startsAt, message.endsAt)}
                </Text>
                <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                  To: {describeTargeting(message.targeting)}
                </Text>
                <View className="mt-3 flex-row flex-wrap gap-x-5 gap-y-1">
                  <Count label="Seen" value={message.seenCount} />
                  <Count label="Dismissed" value={message.dismissedCount} />
                  <Count label="Clicked" value={message.clickedCount} />
                </View>
              </Pressable>

              <View className="mt-3 flex-row flex-wrap gap-2">
                <ActionButton label="Edit" kind="soft" trackId="admin.messages.row.edit_button" onPress={() => onEdit(message)} disabled={busy} />
                {actions.stop ? (
                  <ActionButton label="Stop" kind="soft" trackId="admin.messages.row.stop" onPress={() => void stop(message)} busy={busy} />
                ) : null}
                {actions.start ? (
                  <ActionButton
                    label={message.status === 'draft' ? 'Go live' : 'Resume'}
                    kind="soft"
                    trackId="admin.messages.row.start"
                    onPress={() => void run(message, () => setAdminMessageStatus(message.id, 'live'), `“${message.name}” is live.`)}
                    busy={busy}
                  />
                ) : null}
                <ActionButton label="Duplicate" kind="soft" trackId="admin.messages.row.duplicate" onPress={() => onDuplicate(message)} disabled={busy} />
                <ActionButton label="Delete" kind="danger" trackId="admin.messages.row.delete" onPress={() => void remove(message)} disabled={busy} />
              </View>
            </Card>
          );
        })
      )}
    </View>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  const { colors } = useThemePreference();
  return (
    <Text className="text-xs" style={{ color: colors.textSecondary }} accessibilityLabel={`${label} ${value}`}>
      {label} <Text className="text-sm font-bold" style={{ color: colors.text }}>{value}</Text>
    </Text>
  );
}
