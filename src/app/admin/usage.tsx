import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { ADMIN_PRICE_CARD, TOKEN_PACKS } from '@/lib/tokens';
import {
  fetchAdminTokenLedger,
  fetchAdminUsageEvents,
  summarizeUsage,
  type AiUsageEvent,
  type TokenLedgerRow,
} from '@/lib/supabase/adminUsage';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [usageRows, ledgerRows] = await Promise.all([
        fetchAdminUsageEvents(120),
        fetchAdminTokenLedger(80),
      ]);
      setEvents(usageRows);
      setLedger(ledgerRows);
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

  return (
    <Screen dense>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}>
        <Text className="mb-1 mt-2 text-2xl font-bold" style={{ color: colors.text }}>
          Usage & tokens
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          Owner-only cost log. Prices are list rates from the Phase B research card.
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
              <Row label="Extract charge" value={`${ADMIN_PRICE_CARD.extractTokens} tokens`} colors={colors} />
              <Row label="Remix charge" value={`${ADMIN_PRICE_CARD.remixTokens} tokens`} colors={colors} />
              <Row label="Signup bonus" value={`${ADMIN_PRICE_CARD.signupBonus} tokens`} colors={colors} />
              <Row label="Guest extracts" value={String(ADMIN_PRICE_CARD.guestExtractLimit)} colors={colors} />
              {TOKEN_PACKS.map((pack) => (
                <Row
                  key={pack.tokens}
                  label={`Pack ${pack.label}`}
                  value={`$${pack.priceUsd.toFixed(2)}`}
                  colors={colors}
                />
              ))}
            </Section>

            <Section title={`Totals (last ${events.length} events)`} colors={colors}>
              <Row label="Provider cost" value={usd(totals.totalCostUsd)} colors={colors} />
              <Row label="Gemini" value={usd(totals.geminiCostUsd)} colors={colors} />
              <Row label="ScrapeCreators" value={usd(totals.scrapecreatorsCostUsd)} colors={colors} />
              <Row label="Tokens charged" value={String(totals.tokensCharged)} colors={colors} />
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

            <Section title="Token ledger" colors={colors}>
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
