import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { ADMIN_PRICE_CARD } from '@/lib/quotas';
import {
  fetchAdminTokenLedger,
  fetchAdminUsageEvents,
  summarizeUsage,
  type AiUsageEvent,
  type TokenLedgerRow,
} from '@/lib/supabase/adminUsage';
import { adminSetSubscription } from '@/lib/supabase/profile';
import {
  closeSupportTicket,
  fetchSupportTickets,
  type SupportTicket,
} from '@/lib/supabase/supportTickets';

function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function shortId(id: string | null): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminUsageScreen() {
  const { user } = useAuth();
  const { isAdmin, loading: profileLoading } = useProfile();
  const { colors } = useThemePreference();
  const [events, setEvents] = useState<AiUsageEvent[]>([]);
  const [ledger, setLedger] = useState<TokenLedgerRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [usageRows, ledgerRows, ticketRows] = await Promise.all([
        fetchAdminUsageEvents(120),
        fetchAdminTokenLedger(80),
        fetchSupportTickets(80),
      ]);
      setEvents(usageRows);
      setLedger(ledgerRows);
      setTickets(ticketRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin usage.');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (profileLoading) return;
      if (!user || !isAdmin) {
        setLoading(false);
        return;
      }
      void refresh();
    }, [profileLoading, user, isAdmin, refresh]),
  );

  async function handleGrant(active: boolean) {
    const id = grantUserId.trim();
    if (!id || grantBusy) return;
    setGrantBusy(true);
    try {
      await adminSetSubscription(id, active);
      Alert.alert(active ? 'Plus granted' : 'Plus revoked', `User ${shortId(id)}`);
      setGrantUserId('');
    } catch (err) {
      Alert.alert(
        'Could not update plan',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setGrantBusy(false);
    }
  }

  async function handleCloseTicket(id: string) {
    try {
      await closeSupportTicket(id);
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'closed' as const } : t)),
      );
    } catch (err) {
      Alert.alert(
        'Could not close ticket',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }

  if (profileLoading) {
    return (
      <Screen dense>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Screen dense>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-3 text-center text-base font-semibold" style={{ color: colors.text }}>
            Admin only
          </Text>
          <Text className="mb-5 text-center text-sm" style={{ color: colors.textSecondary }}>
            This usage tracker is limited to your account.
          </Text>
          <Pressable onPress={() => router.back()} className="rounded-[18px] px-5 py-3" style={{ backgroundColor: colors.primarySoft }}>
            <Text style={{ color: colors.primary }} className="font-semibold">
              Go back
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const totals = summarizeUsage(events);
  const openTickets = tickets.filter((t) => t.status === 'open');

  return (
    <Screen dense>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}>
        <Text className="mb-1 mt-2 text-2xl font-bold" style={{ color: colors.text }}>
          Usage & support
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          Owner-only cost log, tickets, and plan tools. Users can also self-upgrade until IAP.
        </Text>

        <Pressable
          onPress={() => void refresh()}
          className="mb-4 self-start rounded-[16px] px-4 py-2 active:opacity-70"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
            Refresh
          </Text>
        </Pressable>

        {error ? (
          <Text className="mb-4 text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Section title="Price card" colors={colors}>
              <Row label="Gemini input" value={`${ADMIN_PRICE_CARD.geminiInputUsdPerM}/M`} colors={colors} />
              <Row label="Gemini output (+thinking)" value={`${ADMIN_PRICE_CARD.geminiOutputUsdPerM}/M`} colors={colors} />
              <Row
                label="ScrapeCreators credit"
                value={usd(ADMIN_PRICE_CARD.scrapecreatorsUsdPerCredit)}
                colors={colors}
              />
              <Row label="Free extracts" value={String(ADMIN_PRICE_CARD.freeExtractLimit)} colors={colors} />
              <Row
                label="Plus monthly extracts"
                value={String(ADMIN_PRICE_CARD.plusMonthlyExtractLimit)}
                colors={colors}
              />
              <Row label="Guest extracts" value={String(ADMIN_PRICE_CARD.guestExtractLimit)} colors={colors} />
              <Row label="Plus display price" value={ADMIN_PRICE_CARD.plusPriceDisplay} colors={colors} />
            </Section>

            <Section title="Grant / revoke Plus" colors={colors}>
              <Text className="mb-2 text-xs" style={{ color: colors.textSecondary }}>
                Optional support tool. Paste a profile user id.
              </Text>
              <TextInput
                className="mb-3 rounded-[14px] px-3 py-2 text-sm"
                style={{
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.frostedBorder,
                }}
                placeholder="user uuid"
                placeholderTextColor={colors.textSecondary}
                value={grantUserId}
                onChangeText={setGrantUserId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View className="flex-row gap-2">
                <Pressable
                  className="rounded-[14px] px-3 py-2"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => void handleGrant(true)}
                  disabled={grantBusy}
                >
                  <Text className="text-xs font-bold text-white">Grant Plus</Text>
                </Pressable>
                <Pressable
                  className="rounded-[14px] px-3 py-2"
                  style={{ backgroundColor: colors.warningSoft }}
                  onPress={() => void handleGrant(false)}
                  disabled={grantBusy}
                >
                  <Text className="text-xs font-bold" style={{ color: colors.warning }}>
                    Revoke Plus
                  </Text>
                </Pressable>
              </View>
            </Section>

            <Section title={`Support tickets (${openTickets.length} open)`} colors={colors}>
              {tickets.length === 0 ? (
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
                  No tickets yet.
                </Text>
              ) : (
                tickets.map((ticket) => (
                  <View
                    key={ticket.id}
                    className="mb-3 border-b pb-3"
                    style={{ borderBottomColor: colors.frostedBorder }}
                  >
                    <Text className="mb-1 text-xs font-semibold" style={{ color: colors.text }}>
                      {ticket.status.toUpperCase()} · {ticket.category} · {fmtWhen(ticket.created_at)}
                    </Text>
                    <Text className="mb-1 text-xs" style={{ color: colors.textSecondary }}>
                      {ticket.email ?? shortId(ticket.user_id)} · {shortId(ticket.id)}
                    </Text>
                    <Text className="mb-2 text-sm leading-5" style={{ color: colors.text }}>
                      {ticket.message}
                    </Text>
                    {ticket.status === 'open' ? (
                      <Pressable
                        className="self-start rounded-[12px] px-3 py-1.5"
                        style={{ backgroundColor: colors.primarySoft }}
                        onPress={() => void handleCloseTicket(ticket.id)}
                      >
                        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                          Mark closed
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </Section>

            <Section title={`Totals (last ${events.length} events)`} colors={colors}>
              <Row label="Provider cost" value={usd(totals.totalCostUsd)} colors={colors} />
              <Row label="Gemini" value={usd(totals.geminiCostUsd)} colors={colors} />
              <Row label="ScrapeCreators" value={usd(totals.scrapecreatorsCostUsd)} colors={colors} />
              <Row label="Tokens charged (legacy)" value={String(totals.tokensCharged)} colors={colors} />
              <Row label="Extracts / remixes" value={`${totals.extracts} / ${totals.remixes}`} colors={colors} />
              <Row label="Cached / failed" value={`${totals.cached} / ${totals.failed}`} colors={colors} />
              <Row
                label="Gemini tokens in/out"
                value={`${totals.promptTokens} / ${totals.outputTokens}`}
                colors={colors}
              />
            </Section>

            <Section title="AI usage log" colors={colors}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <TableHeader
                    cells={['When', 'Action', 'Status', 'Plat', 'Src', 'Tok$', 'SC$', 'Tot$', 'Chg', 'ms']}
                    colors={colors}
                  />
                  {events.map((event) => (
                    <TableRow
                      key={event.id}
                      colors={colors}
                      cells={[
                        fmtWhen(event.created_at),
                        event.action,
                        event.status,
                        event.platform ?? '—',
                        event.extraction_source ?? '—',
                        usd(Number(event.gemini_cost_usd) || 0),
                        usd(Number(event.scrapecreators_cost_usd) || 0),
                        usd(Number(event.total_cost_usd) || 0),
                        String(event.tokens_charged),
                        event.duration_ms != null ? String(event.duration_ms) : '—',
                      ]}
                    />
                  ))}
                </View>
              </ScrollView>
            </Section>

            <Section title="Token ledger (legacy)" colors={colors}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <TableHeader
                    cells={['When', 'User', 'Δ', 'After', 'Reason', 'Ref']}
                    colors={colors}
                  />
                  {ledger.map((row) => (
                    <TableRow
                      key={row.id}
                      colors={colors}
                      cells={[
                        fmtWhen(row.created_at),
                        shortId(row.user_id),
                        String(row.delta),
                        String(row.balance_after),
                        row.reason,
                        row.ref_id ? shortId(row.ref_id) : '—',
                      ]}
                    />
                  ))}
                </View>
              </ScrollView>
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: ReactNode;
  colors: { frosted: string; frostedBorder: string; text: string };
}) {
  return (
    <View
      className="mb-4 rounded-[22px] p-4"
      style={{ backgroundColor: colors.frosted, borderWidth: 1, borderColor: colors.frostedBorder }}
    >
      <Text className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { textSecondary: string; text: string };
}) {
  return (
    <View className="mb-1.5 flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-xs" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
      <Text className="text-xs font-semibold" style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

function TableHeader({
  cells,
  colors,
}: {
  cells: string[];
  colors: { textSecondary: string; frostedBorder: string };
}) {
  return (
    <View
      className="mb-1 flex-row border-b pb-2"
      style={{ borderBottomColor: colors.frostedBorder }}
    >
      {cells.map((cell) => (
        <Text
          key={cell}
          className="mr-3 w-24 text-[10px] font-bold uppercase"
          style={{ color: colors.textSecondary }}
        >
          {cell}
        </Text>
      ))}
    </View>
  );
}

function TableRow({
  cells,
  colors,
}: {
  cells: string[];
  colors: { text: string };
}) {
  return (
    <View className="mb-1 flex-row py-1">
      {cells.map((cell, index) => (
        <Text
          key={`${index}-${cell}`}
          className="mr-3 w-24 text-[10px]"
          style={{ color: colors.text }}
          numberOfLines={2}
        >
          {cell}
        </Text>
      ))}
    </View>
  );
}
