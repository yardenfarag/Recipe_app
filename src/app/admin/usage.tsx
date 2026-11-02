import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { AiCostDashboard } from '@/components/admin/AiCostDashboard';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/text-input';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { errorText } from '@/lib/errorText';
import { ADMIN_PRICE_CARD } from '@/lib/quotas';
import { formatTokens, shortModelName } from '@/lib/aiCostSummary';
import { creditHealthWarnings, type CreditHealth } from '@/lib/creditHealth';
import {
  fetchAdminTokenLedger,
  fetchAdminUsageEvents,
  fetchCreditHealth,
  formatUsageAction,
  type AiUsageEvent,
  type TokenLedgerRow,
} from '@/lib/supabase/adminUsage';
import { adminAdjustRecipeCredits } from '@/lib/supabase/profile';
import {
  closeSupportTicket,
  fetchSupportTickets,
  type SupportTicket,
} from '@/lib/supabase/supportTickets';
import { fetchFeedback, type Feedback } from '@/lib/supabase/feedback';

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin, loading: profileLoading } = useProfile();
  const { colors } = useThemePreference();
  const [events, setEvents] = useState<AiUsageEvent[]>([]);
  const [ledger, setLedger] = useState<TokenLedgerRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [health, setHealth] = useState<CreditHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState('10');
  const [grantBusy, setGrantBusy] = useState(false);
  const [costRefreshKey, setCostRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    setCostRefreshKey((k) => k + 1);
    try {
      const [usageRows, ledgerRows, ticketRows, feedbackRows, healthReport] = await Promise.all([
        fetchAdminUsageEvents(120),
        fetchAdminTokenLedger(80),
        fetchSupportTickets(80),
        fetchFeedback(80),
        // A health failure shouldn't hide the rest of the screen.
        fetchCreditHealth().catch((err: unknown) => {
          setHealthError(errorText(err, 'Could not load credit health.'));
          return null;
        }),
      ]);
      if (healthReport) setHealthError(null);
      setHealth(healthReport);
      setEvents(usageRows);
      setLedger(ledgerRows);
      setTickets(ticketRows);
      setFeedback(feedbackRows);
    } catch (err) {
      setError(errorText(err, 'Could not load admin usage.'));
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

  async function handleGrant() {
    const id = grantUserId.trim();
    const amount = Number.parseInt(grantAmount, 10);
    if (!id || !Number.isInteger(amount) || amount === 0 || grantBusy) return;
    setGrantBusy(true);
    try {
      const balance = await adminAdjustRecipeCredits(id, amount);
      Alert.alert(
        t('admin.creditUpdated'),
        t('admin.creditBalance', { user: shortId(id), balance }),
      );
      setGrantUserId('');
    } catch (err) {
      Alert.alert(
        t('admin.creditUpdateFailed'),
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
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="rounded-[18px] px-5 py-3"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Text style={{ color: colors.primary }} className="font-semibold">
              Go back
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const openTickets = tickets.filter((t) => t.status === 'open');

  return (
    <Screen dense>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}>
        <Text
          className="mb-1 mt-2 text-2xl font-bold"
          style={{ color: colors.text }}
          accessibilityRole="header"
        >
          Usage & support
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          Owner-only cost log, tickets, and recipe-credit tools.
        </Text>

        <Pressable
          onPress={() => void refresh()}
          accessibilityRole="button"
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
            <CreditHealthSection health={health} error={healthError} colors={colors} />

            <AiCostDashboard refreshKey={costRefreshKey} />

            <Section title="Limits & rates" colors={colors}>
              <Row
                label="ScrapeCreators credit"
                value={usd(ADMIN_PRICE_CARD.scrapecreatorsUsdPerCredit)}
                colors={colors}
              />
              <Row label="Free extracts" value={String(ADMIN_PRICE_CARD.freeExtractLimit)} colors={colors} />
              <Row label="Guest extracts" value={String(ADMIN_PRICE_CARD.guestExtractLimit)} colors={colors} />
            </Section>

            <Section title={t('admin.creditAdjustment')} colors={colors}>
              <Text className="mb-2 text-xs" style={{ color: colors.textSecondary }}>
                {t('admin.creditAdjustmentHint')}
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
                accessibilityLabel="User ID"
                placeholderTextColor={colors.textSecondary}
                value={grantUserId}
                onChangeText={setGrantUserId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                className="mb-3 rounded-[14px] px-3 py-2 text-sm"
                style={{
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.frostedBorder,
                }}
                placeholder={t('admin.creditAmountPlaceholder')}
                accessibilityLabel={t('admin.creditAmountPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={grantAmount}
                onChangeText={setGrantAmount}
                keyboardType="number-pad"
              />
              <Pressable
                className="self-start rounded-[14px] px-3 py-2"
                style={{ backgroundColor: colors.primary }}
                onPress={() => void handleGrant()}
                disabled={grantBusy}
                accessibilityRole="button"
                accessibilityState={{ disabled: grantBusy, busy: grantBusy }}
              >
                <Text className="text-xs font-bold" style={{ color: colors.onPrimary }}>
                  {t('admin.applyAdjustment')}
                </Text>
              </Pressable>
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
                        accessibilityRole="button"
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

            <Section title={`Feedback (${feedback.length})`} colors={colors}>
              {feedback.length === 0 ? (
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
                  No feedback yet.
                </Text>
              ) : (
                feedback.map((item) => (
                  <View
                    key={item.id}
                    className="mb-3 border-b pb-3"
                    style={{ borderBottomColor: colors.frostedBorder }}
                  >
                    <Text className="mb-1 text-xs font-semibold" style={{ color: colors.text }}>
                      {item.profile?.email ?? item.contact_email ?? shortId(item.user_id)} ·{' '}
                      {fmtWhen(item.created_at)}
                    </Text>
                    <Text className="mb-1 text-xs" style={{ color: colors.textSecondary }}>
                      {[
                        item.source === 'website' ? 'website form' : null,
                        item.app_version
                          ? `v${item.app_version}${item.build_number ? ` (${item.build_number})` : ''}`
                          : null,
                        item.platform,
                        item.device_model,
                        item.os_version,
                        item.locale,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text className="text-sm leading-5" style={{ color: colors.text }}>
                      {item.message}
                    </Text>
                  </View>
                ))
              )}
            </Section>

            <Section title="AI usage log" colors={colors}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <TableHeader
                    cells={['When', 'Action', 'Status', 'Model', 'In', 'Out', 'Plat', 'Src', 'Model$', 'SC$', 'Tot$', 'ms']}
                    colors={colors}
                  />
                  {events.map((event) => (
                    <TableRow
                      key={event.id}
                      colors={colors}
                      cells={[
                        fmtWhen(event.created_at),
                        formatUsageAction(event.action),
                        event.status,
                        event.model ? shortModelName(event.model) : '—',
                        formatTokens(event.prompt_tokens || 0),
                        formatTokens((event.output_tokens || 0) + (event.thinking_tokens || 0)),
                        event.platform ?? '—',
                        event.extraction_source ?? '—',
                        usd(Number(event.gemini_cost_usd) || 0),
                        usd(Number(event.scrapecreators_cost_usd) || 0),
                        usd(Number(event.total_cost_usd) || 0),
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

function CreditHealthSection({
  health,
  error,
  colors,
}: {
  health: CreditHealth | null;
  error: string | null;
  colors: ReturnType<typeof useThemePreference>['colors'];
}) {
  if (!health) {
    return (
      <Section title="Credits health" colors={colors}>
        <Text className="text-xs" style={{ color: error ? colors.danger : colors.textSecondary }}>
          {error ?? 'No report yet.'}
        </Text>
      </Section>
    );
  }
  const warnings = creditHealthWarnings(health);
  const { purchases, reservations, webhook, refundJob, extraction } = health;
  const pct = (n: number) =>
    extraction.count7d ? `${Math.round((n / extraction.count7d) * 100)}%` : '—';

  return (
    <Section title="Credits health" colors={colors}>
      {warnings.length === 0 ? (
        <Text className="mb-3 text-xs font-semibold" style={{ color: colors.primary }}>
          All clear.
        </Text>
      ) : (
        warnings.map((warning) => (
          <Text key={warning} className="mb-1.5 text-xs font-semibold" style={{ color: colors.danger }}>
            {warning}
          </Text>
        ))
      )}
      <Row label="Purchases (24h / 7d)" value={`${purchases.last24h} / ${purchases.last7d}`} colors={colors} />
      <Row label="Credits sold (7d)" value={String(purchases.credits7d)} colors={colors} />
      {purchases.byStore7d.map((row) => (
        <Row
          key={`${row.store}-${row.environment}`}
          label={`  ${row.store} · ${row.environment}`}
          value={String(row.count)}
          colors={colors}
        />
      ))}
      <Row
        label="Last purchase"
        value={purchases.lastAt ? fmtWhen(purchases.lastAt) : '—'}
        colors={colors}
      />
      <Row
        label="Stuck / awaiting refund"
        value={`${reservations.stuck} / ${reservations.pendingCompensation}`}
        colors={colors}
      />
      <Row label="Refunded (24h)" value={String(reservations.refunded24h)} colors={colors} />
      <Row
        label="Refund job last run"
        value={
          refundJob.lastRunAt ? `${fmtWhen(refundJob.lastRunAt)} · ${refundJob.lastStatus ?? '?'}` : '—'
        }
        colors={colors}
      />
      <Row
        label="Webhook failures (24h / 7d / unresolved)"
        value={`${webhook.failures24h} / ${webhook.failures7d} / ${webhook.unresolved7d}`}
        colors={colors}
      />
      {webhook.lastFailureAt ? (
        <Row
          label="Last webhook failure"
          value={`${fmtWhen(webhook.lastFailureAt)} · ${webhook.lastFailureReason ?? '?'}`}
          colors={colors}
        />
      ) : null}
      <Row label="Extractions (7d)" value={String(extraction.count7d)} colors={colors} />
      <Row label="Failed (7d)" value={pct(extraction.failed7d)} colors={colors} />
      <Row label="Video fallback (7d)" value={pct(extraction.video7d)} colors={colors} />
      <Row label="p95 cost (7d)" value={usd(extraction.p95CostUsd7d)} colors={colors} />
    </Section>
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
      <Text
        className="mb-3 text-sm font-semibold"
        style={{ color: colors.text }}
        accessibilityRole="header"
      >
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
