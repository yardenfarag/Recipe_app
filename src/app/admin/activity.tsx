import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin/AdminOnly';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/text-input';
import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { insightSince } from '@/lib/adminInsights';
import { errorText } from '@/lib/errorText';
import {
  fetchActivitySessionEvents,
  fetchActivitySessions,
  fetchActivityTop,
  type ActivityEvent,
  type ActivitySession,
  type ActivityTopItem,
} from '@/lib/supabase/adminActivity';

const RANGES = [1, 7, 30] as const;
type Range = (typeof RANGES)[number];

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function fmtDuration(fromIso: string, toIso: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function AdminActivityScreen() {
  return (
    <AdminOnly>
      <ActivityBody />
    </AdminOnly>
  );
}

function ActivityBody() {
  const { colors } = useThemePreference();
  const [range, setRange] = useState<Range>(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [top, setTop] = useState<ActivityTopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);

  // Search runs after typing pauses, not on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(query), 400);
    return () => clearTimeout(handle);
  }, [query]);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const since = insightSince(range);
      const [nextSessions, nextTop] = await Promise.all([
        fetchActivitySessions(since, search),
        fetchActivityTop(since),
      ]);
      setSessions(nextSessions);
      setTop(nextTop);
    } catch (err) {
      setError(errorText(err, 'Could not load activity.'));
    } finally {
      setLoading(false);
    }
  }, [range, search]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const card = { backgroundColor: colors.frosted, borderWidth: 1, borderColor: colors.frostedBorder };

  return (
    <Screen dense>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}>
        <Text className="mb-1 mt-2 text-2xl font-bold" style={{ color: colors.text }} accessibilityRole="header">
          Activity
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          Every screen view, tap, login and signup, grouped by session. Kept until the account is deleted. Only admins can see this.
        </Text>

        <View className="mb-3 flex-row gap-2">
          {RANGES.map((days) => {
            const active = days === range;
            return (
              <Pressable
                key={days}
                trackId={`admin.activity.range.${days}d`}
                onPress={() => setRange(days)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: active ? colors.primary : colors.primarySoft }}
              >
                <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
                  {days === 1 ? 'Today' : `${days} days`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          className="mb-4 rounded-[14px] px-3 py-2 text-sm"
          style={{ color: colors.text, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.frostedBorder }}
          placeholder="Search email, user id or install id"
          accessibilityLabel="Search email, user id or install id"
          accessibilityRole="search"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {error ? (
          <Text className="mb-4 text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text className="mb-2 text-base font-bold" style={{ color: colors.text }} accessibilityRole="header">
              Most used
            </Text>
            <View className="mb-5 rounded-[22px] p-4" style={card}>
              {top.length === 0 ? (
                <Text className="text-sm" style={{ color: colors.textSecondary }}>
                  Nothing logged in this range yet.
                </Text>
              ) : (
                top.map((item) => (
                  <View key={`${item.kind}:${item.name}`} className="flex-row items-center justify-between py-1">
                    <Text className="mr-3 min-w-0 flex-1 text-xs" style={{ color: colors.text }} numberOfLines={1}>
                      {item.kind === 'screen' ? '▢ ' : item.kind === 'auth' ? '🔑 ' : '• '}
                      {item.name}
                    </Text>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {item.count} · {item.people} {item.people === 1 ? 'person' : 'people'}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <Text className="mb-2 text-base font-bold" style={{ color: colors.text }} accessibilityRole="header">
              Sessions ({sessions.length})
            </Text>
            {sessions.map((session) => {
              const open = openSession === session.sessionId;
              const who = session.email ?? (session.userId ? session.userId : `Guest ${session.guestInstallId?.slice(0, 8) ?? ''}`);
              return (
                <View key={session.sessionId} className="mb-3 rounded-[22px] p-4" style={card}>
                  <Pressable
                    trackId="admin.activity.session.toggle"
                    onPress={() => setOpenSession(open ? null : session.sessionId)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                      {who}
                    </Text>
                    <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      {fmtWhen(session.startedAt)} · {fmtDuration(session.startedAt, session.lastAt)} ·{' '}
                      {session.platform}
                      {session.appVersion ? ` ${session.appVersion}` : ''}
                    </Text>
                    <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                      {session.screenCount} screens · {session.tapCount} taps · {open ? 'Hide' : 'Show'} timeline
                    </Text>
                    {session.authEvents.length ? (
                      <Text className="mt-1 text-xs font-semibold" style={{ color: colors.primary }}>
                        {session.authEvents.map((name) => name.replace('auth.', '')).join(' · ')}
                      </Text>
                    ) : null}
                  </Pressable>
                  {open ? <SessionTimeline sessionId={session.sessionId} /> : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { colors } = useThemePreference();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActivitySessionEvents(sessionId)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Could not load this session.'));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return (
      <Text className="mt-3 text-xs" style={{ color: colors.danger }}>
        {error}
      </Text>
    );
  }
  if (!events) return <ActivityIndicator className="mt-3" color={colors.primary} />;

  return (
    <View className="mt-3 border-t pt-3" style={{ borderColor: colors.frostedBorder }}>
      {events.map((event) => (
        <View key={event.id} className="flex-row py-0.5">
          <Text className="w-20 text-xs" style={{ color: colors.textSecondary }}>
            {fmtTime(event.occurredAt)}
          </Text>
          <Text
            className="min-w-0 flex-1 text-xs"
            style={{
              color: event.kind === 'tap' ? colors.text : event.kind === 'auth' ? colors.warning : colors.primary,
              fontWeight: event.kind === 'tap' ? '400' : '700',
            }}
          >
            {event.kind === 'screen' ? `→ ${event.name}` : event.kind === 'auth' ? `🔑 ${event.name}` : `   tap ${event.name}`}
            {Object.keys(event.properties).length ? ` ${JSON.stringify(event.properties)}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}
