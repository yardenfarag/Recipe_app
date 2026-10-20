import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';
import {
  formatTokens,
  formatUsd,
  shortModelName,
  summarizeAiCost,
  type AiCostRow,
} from '@/lib/aiCostSummary';
import { errorText } from '@/lib/errorText';
import { fetchAdminCostRows, formatUsageAction } from '@/lib/supabase/adminUsage';

type WindowKey = '24h' | '7d' | '30d';

const WINDOW_HOURS: Record<WindowKey, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

type Colors = ReturnType<typeof useThemePreference>['colors'];

type Column = { label: string; width: number; align?: 'left' | 'right' };

/**
 * Owner-only AI spend: totals, then cost and tokens per model, per task kind
 * and per user-facing action. Reads `ai_usage_events` for the chosen window.
 */
export function AiCostDashboard({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [windowKey, setWindowKey] = useState<WindowKey>('7d');
  const [rows, setRows] = useState<AiCostRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - WINDOW_HOURS[windowKey] * 3_600_000).toISOString();
    fetchAdminCostRows(since)
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTruncated(result.truncated);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, t('admin.cost.loadFailed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowKey, refreshKey, t]);

  const summary = useMemo(() => summarizeAiCost(rows), [rows]);

  const windows: { key: WindowKey; label: string }[] = [
    { key: '24h', label: t('admin.cost.window24h') },
    { key: '7d', label: t('admin.cost.window7d') },
    { key: '30d', label: t('admin.cost.window30d') },
  ];

  return (
    <View
      className="mb-4 rounded-[22px] p-4"
      style={{ backgroundColor: colors.frosted, borderWidth: 1, borderColor: colors.frostedBorder }}
    >
      <Text className="mb-1 text-sm font-semibold" style={{ color: colors.text }} accessibilityRole="header">
        {t('admin.cost.costTitle')}
      </Text>
      <Text className="mb-3 text-xs" style={{ color: colors.textSecondary }}>
        {t('admin.cost.costHint')}
      </Text>

      <View className="mb-3 flex-row flex-wrap gap-2" accessibilityRole="tablist">
        {windows.map((w) => {
          const active = w.key === windowKey;
          return (
            <Pressable
              key={w.key}
              onPress={() => setWindowKey(w.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="rounded-[14px] px-3 py-1.5"
              style={{ backgroundColor: active ? colors.primary : colors.primarySoft }}
            >
              <Text className="text-xs font-semibold" style={{ color: active ? colors.onPrimary : colors.primary }}>
                {w.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text className="mb-2 text-xs" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : summary.events === 0 ? (
        <Text className="text-xs" style={{ color: colors.textSecondary }}>
          {t('admin.cost.empty')}
        </Text>
      ) : (
        <>
          {truncated ? (
            <Text className="mb-2 text-xs" style={{ color: colors.textSecondary }}>
              {t('admin.cost.truncated', { count: rows.length })}
            </Text>
          ) : null}

          <View className="mb-4 flex-row flex-wrap gap-2">
            <Tile label={t('admin.cost.totalCost')} value={formatUsd(summary.totalCostUsd)} colors={colors} strong />
            <Tile label={t('admin.cost.modelCost')} value={formatUsd(summary.modelCostUsd)} colors={colors} />
            <Tile label={t('admin.cost.scrapeCost')} value={formatUsd(summary.scrapeCostUsd)} colors={colors} />
            <Tile
              label={t('admin.cost.perRecipe')}
              value={summary.costPerRecipeUsd == null ? '—' : formatUsd(summary.costPerRecipeUsd)}
              colors={colors}
            />
            <Tile label={t('admin.cost.events')} value={String(summary.events)} colors={colors} />
            <Tile label={t('admin.cost.llmCalls')} value={String(summary.llmCalls)} colors={colors} />
            <Tile label={t('admin.cost.tokensIn')} value={formatTokens(summary.promptTokens)} colors={colors} />
            <Tile
              label={t('admin.cost.tokensOut')}
              value={`${formatTokens(summary.outputTokens)}${summary.thinkingTokens > 0 ? ` + ${formatTokens(summary.thinkingTokens)}` : ''}`}
              colors={colors}
            />
          </View>

          <SubHeader title={t('admin.cost.byModel')} colors={colors} />
          <CostTable
            colors={colors}
            columns={[
              { label: t('admin.cost.colModel'), width: 150 },
              { label: t('admin.cost.colShare'), width: 96 },
              { label: t('admin.cost.colCost'), width: 70, align: 'right' },
              { label: t('admin.cost.colCalls'), width: 50, align: 'right' },
              { label: t('admin.cost.colAvg'), width: 70, align: 'right' },
              { label: t('admin.cost.colIn'), width: 56, align: 'right' },
              { label: t('admin.cost.colOut'), width: 56, align: 'right' },
              { label: t('admin.cost.colPerM'), width: 56, align: 'right' },
            ]}
            rows={summary.byModel.map((m) => [
              shortModelName(m.model),
              <ShareBar key="share" share={m.costShare} colors={colors} />,
              formatUsd(m.costUsd),
              String(m.calls),
              formatUsd(m.avgCostUsd),
              formatTokens(m.promptTokens),
              formatTokens(m.outputTokens + m.thinkingTokens),
              m.usdPerMTokens > 0 ? `$${m.usdPerMTokens.toFixed(2)}` : '—',
            ])}
          />

          <SubHeader title={t('admin.cost.byTask')} colors={colors} />
          <CostTable
            colors={colors}
            columns={[
              { label: t('admin.cost.colTask'), width: 110 },
              { label: t('admin.cost.colModels'), width: 170 },
              { label: t('admin.cost.colCost'), width: 70, align: 'right' },
              { label: t('admin.cost.colCalls'), width: 50, align: 'right' },
              { label: t('admin.cost.colAvg'), width: 70, align: 'right' },
              { label: t('admin.cost.colIn'), width: 56, align: 'right' },
              { label: t('admin.cost.colOut'), width: 56, align: 'right' },
            ]}
            rows={summary.byTask.map((task) => [
              task.kind,
              task.models.map(shortModelName).join(', '),
              formatUsd(task.costUsd),
              String(task.calls),
              formatUsd(task.avgCostUsd),
              formatTokens(task.promptTokens),
              formatTokens(task.outputTokens),
            ])}
          />

          <SubHeader title={t('admin.cost.byAction')} colors={colors} />
          <CostTable
            colors={colors}
            columns={[
              { label: t('admin.cost.colAction'), width: 100 },
              { label: t('admin.cost.events'), width: 56, align: 'right' },
              { label: t('admin.cost.colFailed'), width: 56, align: 'right' },
              { label: t('admin.cost.colCached'), width: 56, align: 'right' },
              { label: t('admin.cost.colCost'), width: 70, align: 'right' },
              { label: t('admin.cost.scrapeCost'), width: 96, align: 'right' },
              { label: t('admin.cost.colAvg'), width: 70, align: 'right' },
              { label: t('admin.cost.colP50'), width: 64, align: 'right' },
              { label: t('admin.cost.colP95'), width: 64, align: 'right' },
            ]}
            rows={summary.byAction.map((a) => [
              formatUsageAction(a.action),
              String(a.events),
              String(a.failed),
              String(a.cached),
              formatUsd(a.totalCostUsd),
              formatUsd(a.scrapeCostUsd),
              formatUsd(a.avgCostUsd),
              a.p50Ms == null ? '—' : String(a.p50Ms),
              a.p95Ms == null ? '—' : String(a.p95Ms),
            ])}
          />
        </>
      )}
    </View>
  );
}

function Tile({ label, value, colors, strong }: { label: string; value: string; colors: Colors; strong?: boolean }) {
  return (
    <View
      className="min-w-[132px] flex-1 rounded-[16px] px-3 py-2"
      style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.frostedBorder }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
      <Text className={strong ? 'text-lg font-bold' : 'text-base font-semibold'} style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

function SubHeader({ title, colors }: { title: string; colors: Colors }) {
  return (
    <Text className="mb-2 mt-1 text-xs font-bold uppercase" style={{ color: colors.textSecondary }} accessibilityRole="header">
      {title}
    </Text>
  );
}

/** Single-hue bar: one series, so the column header names it and no legend is needed. */
function ShareBar({ share, colors }: { share: number; colors: Colors }) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <View className="flex-row items-center gap-1.5" accessibilityLabel={`${Math.round(pct)}%`}>
      <View className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.primarySoft }}>
        <View className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: colors.primary }} />
      </View>
      <Text className="w-8 text-right text-[10px]" style={{ color: colors.textSecondary }}>
        {Math.round(pct)}%
      </Text>
    </View>
  );
}

function CostTable({
  columns,
  rows,
  colors,
}: {
  columns: Column[];
  rows: (string | React.ReactNode)[][];
  colors: Colors;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator className="mb-4">
      <View>
        <View className="mb-1 flex-row border-b pb-1.5" style={{ borderBottomColor: colors.frostedBorder }}>
          {columns.map((c) => (
            <Text
              key={c.label}
              className="mr-2 text-[10px] font-bold uppercase"
              style={{ width: c.width, color: colors.textSecondary, textAlign: c.align ?? 'left' }}
            >
              {c.label}
            </Text>
          ))}
        </View>
        {rows.map((cells, rowIndex) => (
          <View key={rowIndex} className="flex-row items-center py-1">
            {cells.map((cell, i) => (
              <View key={i} className="mr-2" style={{ width: columns[i].width }}>
                {typeof cell === 'string' ? (
                  <Text
                    className="text-[11px]"
                    style={{ color: colors.text, textAlign: columns[i].align ?? 'left', fontVariant: ['tabular-nums'] }}
                    numberOfLines={2}
                  >
                    {cell}
                  </Text>
                ) : (
                  cell
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
