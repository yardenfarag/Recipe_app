import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin/AdminOnly';
import { Screen } from '@/components/Screen';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  INSIGHT_RANGES,
  insightSince,
  summarizeFailures,
  summarizeInsights,
  type FailureGroup,
  type InsightRange,
  type InsightSummary,
  type RankedItem,
} from '@/lib/adminInsights';
import {
  fetchAdminFailures,
  fetchAdminProductEvents,
  fetchAdminPurchases,
  type AdminPurchase,
} from '@/lib/supabase/adminUsage';
import { errorText } from '@/lib/errorText';

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function label(name: string): string {
  return name.replaceAll('_', ' ');
}

export default function AdminInsightsScreen() {
  return (
    <AdminOnly>
      <InsightsBody />
    </AdminOnly>
  );
}

function InsightsBody() {
  const { colors } = useThemePreference();
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [failures, setFailures] = useState<ReturnType<typeof summarizeFailures> | null>(null);
  const [costUsd, setCostUsd] = useState(0);
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [range, setRange] = useState<InsightRange>(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const since = insightSince(range);
      const [events, usage, purchaseRows] = await Promise.all([
        fetchAdminProductEvents(since),
        fetchAdminFailures(since),
        fetchAdminPurchases(since),
      ]);
      setSummary(summarizeInsights(events, new Date(), range));
      setFailures(summarizeFailures(usage));
      setPurchases(purchaseRows);
      setCostUsd(usage.reduce((sum, row) => sum + row.total_cost_usd, 0));
    } catch (err) {
      setError(errorText(err, 'Could not load insights.'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const peak = Math.max(1, ...(summary?.days.map((day) => day.count) ?? [1]));

  return (
    <Screen dense>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}>
        <Text className="mb-1 mt-2 text-2xl font-bold" style={{ color: colors.text }}>
          Insights
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          What people do in Pinch. Names and account ids stay off this page.
        </Text>
        <View className="mb-4 flex-row flex-wrap items-center gap-2">
          {INSIGHT_RANGES.map((days) => {
            const selected = days === range;
            return (
              <Pressable
                key={days}
                onPress={() => setRange(days)}
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: selected ? colors.primary : colors.primarySoft }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: selected ? '#fff' : colors.primary }}
                >
                  {days} days
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => void refresh()}
            className="rounded-full px-3 py-1.5"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
              Refresh
            </Text>
          </Pressable>
        </View>
        {error ? (
          <Text className="mb-4 text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        {loading || !summary || !failures ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View className="mb-4 flex-row flex-wrap gap-2">
              <Stat label="Events" value={String(summary.events)} colors={colors} />
              <Stat label="Signed-in people" value={String(summary.signedInPeople)} colors={colors} />
              <Stat label="Guest installs" value={String(summary.guestInstalls)} colors={colors} />
              <Stat label="AI failures" value={String(failures.failed)} colors={colors} />
              <Stat label="AI cost" value={`$${costUsd.toFixed(2)}`} colors={colors} />
              <Stat
                label="Credits sold"
                value={String(purchases.reduce((sum, row) => sum + row.credits, 0))}
                colors={colors}
              />
            </View>

            <Card title={`Last ${range} days`} colors={colors}>
              <View className="flex-row items-end gap-1">
                {summary.days.map((day, index) => (
                  <View key={day.label} className="flex-1 items-center">
                    <View
                      className="w-full rounded-t-[4px]"
                      style={{
                        height: Math.max(4, Math.round((day.count / peak) * 72)),
                        backgroundColor: day.count ? colors.primary : colors.frostedBorder,
                      }}
                    />
                    <Text className="mt-1 text-[9px]" style={{ color: colors.textSecondary }}>
                      {range > 14 && index % 7 !== 0 ? '' : day.label.slice(3)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card title="What people use" colors={colors}>
              <RankList items={summary.byName} empty="No product events yet." colors={colors} format={label} />
            </Card>
            <Card title="How Snaps start" colors={colors}>
              <RankList items={summary.snapSources} empty="No Snaps yet." colors={colors} />
              <RankList items={summary.snapModes} empty="" colors={colors} />
            </Card>
            <Card title="What gets saved" colors={colors}>
              <RankList items={summary.saveFrom} empty="No saves yet." colors={colors} />
            </Card>
            <Card title="Why the credit sheet opens" colors={colors}>
              <RankList items={summary.paywallTriggers} empty="No paywall views yet." colors={colors} />
            </Card>
            <Card title="Onboarding languages" colors={colors}>
              <RankList items={summary.locales} empty="Nobody has finished onboarding yet." colors={colors} />
            </Card>

            <Card title="Where AI fails" colors={colors}>
              <RankList items={failures.byAction} empty="No failures in the recent log." colors={colors} />
              {failures.byMessage.map((item) => (
                <MessageRow key={item.label} item={item} colors={colors} />
              ))}
            </Card>

            <Card title="Purchases" colors={colors}>
              <EventTable
                header={['When', 'Account', 'Credits', 'Product', 'Provider']}
                rows={purchases.map((row) => [
                  fmtWhen(row.createdAt),
                  row.email ?? '—',
                  String(row.credits),
                  row.productId,
                  row.provider,
                ])}
                colors={colors}
              />
            </Card>

            <Card title="Recent activity" colors={colors}>
              <EventTable
                header={['When', 'Event', 'Detail']}
                rows={summary.recent.map((row) => [fmtWhen(row.when), label(row.name), row.detail || '—'])}
                colors={colors}
              />
            </Card>
            <Card title="Recent failures" colors={colors}>
              <EventTable
                header={['When', 'Action', 'Where', 'Message']}
                rows={failures.recent.map((row) => [
                  fmtWhen(row.when),
                  row.action,
                  row.where,
                  row.message,
                ])}
                colors={colors}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({
  label: name,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { frosted: string; frostedBorder: string; text: string; textSecondary: string };
}) {
  return (
    <View
      className="min-w-[104px] flex-1 rounded-[18px] px-3 py-3"
      style={{ backgroundColor: colors.frosted, borderWidth: 1, borderColor: colors.frostedBorder }}
    >
      <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
        {name}
      </Text>
      <Text className="mt-1 text-lg font-bold" style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

function Card({
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

function RankList({
  items,
  empty,
  colors,
  format = (value) => value,
}: {
  items: RankedItem[];
  empty: string;
  colors: { text: string; textSecondary: string; primary: string; primarySoft: string };
  format?: (value: string) => string;
}) {
  if (items.length === 0) {
    return empty ? (
      <Text className="mb-2 text-xs" style={{ color: colors.textSecondary }}>
        {empty}
      </Text>
    ) : null;
  }
  const max = items[0]?.count ?? 1;
  return (
    <View className="mb-2">
      {items.map((item) => (
        <View key={item.label} className="mb-2">
          <View className="mb-1 flex-row justify-between">
            <Text className="text-xs" style={{ color: colors.text }}>
              {format(item.label)}
            </Text>
            <Text className="text-xs font-semibold" style={{ color: colors.text }}>
              {item.count}
            </Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.primarySoft }}>
            <View
              className="h-1.5 rounded-full"
              style={{ width: `${Math.max(8, Math.round((item.count / max) * 100))}%`, backgroundColor: colors.primary }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function MessageRow({
  item,
  colors,
}: {
  item: FailureGroup;
  colors: { text: string; textSecondary: string };
}) {
  return (
    <Text className="mb-1 text-xs leading-5" style={{ color: colors.textSecondary }}>
      {item.count}× {item.sample}
    </Text>
  );
}

function EventTable({
  header,
  rows,
  colors,
}: {
  header: string[];
  rows: string[][];
  colors: { text: string; textSecondary: string; frostedBorder: string };
}) {
  if (rows.length === 0) {
    return (
      <Text className="text-xs" style={{ color: colors.textSecondary }}>
        Nothing yet.
      </Text>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View className="mb-1 flex-row border-b pb-2" style={{ borderBottomColor: colors.frostedBorder }}>
          {header.map((cell) => (
            <Text key={cell} className="mr-3 w-36 text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
              {cell}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={`${row[0]}-${index}`} className="mb-1 flex-row py-1">
            {row.map((cell, cellIndex) => (
              <Text
                key={`${index}-${cellIndex}`}
                className="mr-3 w-36 text-[10px]"
                style={{ color: colors.text }}
                numberOfLines={2}
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
