"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { formatTokens, formatUsd, shortModelName, summarizeAiCost, summarizeImports } from "@shared/lib/aiCostSummary";
import { fetchAdminCostRows, formatUsageAction } from "@shared/lib/supabase/adminUsage";

import { ShareBar } from "@/components/admin/charts";
import { Card, EmptyLine, ErrorLine, Figure, Segmented, Skeleton, SubHeading, TableWrap, numClass, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

type WindowKey = "24h" | "7d" | "30d";

const WINDOW_HOURS: Record<WindowKey, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
const WINDOWS: { value: WindowKey; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

type Column = { label: string; end?: boolean };

function usdOrDash(value: number | null): string {
  return value == null ? "—" : formatUsd(value);
}

/**
 * AI spend: totals, then cost and tokens per model, per task and per action, then imports by extraction step
 * (PIN-62). Reads `ai_usage_events` for the chosen window, which only admins can read.
 */
export function AiCostCard({ refreshKey, load = fetchAdminCostRows }: { refreshKey: number; load?: typeof fetchAdminCostRows }) {
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const read = useCallback(() => load(new Date(Date.now() - WINDOW_HOURS[windowKey] * 3_600_000).toISOString()), [load, windowKey]);
  const { data, error, loading } = useAdminData(`${windowKey}:${refreshKey}`, read, "Couldn’t load cost data.");
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const summary = useMemo(() => summarizeAiCost(rows), [rows]);
  const imports = useMemo(() => summarizeImports(rows), [rows]);

  return (
    <Card
      title="AI cost"
      subtitle="Model and ScrapeCreators spend from the usage log. Calls logged before the per-call breakdown count as one call on their model."
      actions={<Segmented label="Cost window" options={WINDOWS} value={windowKey} onChange={setWindowKey} trackPrefix="admin.cost.window" />}
    >
      {error ? (
        <div className="mb-3">
          <ErrorLine>{error}</ErrorLine>
        </div>
      ) : null}
      {loading && !data ? (
        <Skeleton className="h-48" />
      ) : summary.events === 0 ? (
        <EmptyLine>No AI calls in this window.</EmptyLine>
      ) : (
        <div className={cn("flex flex-col gap-5", loading ? "opacity-60" : "")} aria-busy={loading || undefined}>
          {data?.truncated ? (
            <p className="text-xs text-muted">Showing the newest {rows.length} events; older ones in this window aren’t counted.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4">
            <Figure label="Total cost" value={formatUsd(summary.totalCostUsd)} strong />
            <Figure label="Model cost" value={formatUsd(summary.modelCostUsd)} />
            <Figure label="ScrapeCreators" value={formatUsd(summary.scrapeCostUsd)} />
            <Figure label="Per recipe" value={summary.costPerRecipeUsd == null ? "—" : formatUsd(summary.costPerRecipeUsd)} />
            <Figure label="Events" value={String(summary.events)} />
            <Figure label="Model calls" value={String(summary.llmCalls)} />
            <Figure label="Tokens in" value={formatTokens(summary.promptTokens)} />
            <Figure
              label="Tokens out"
              value={`${formatTokens(summary.outputTokens)}${summary.thinkingTokens > 0 ? ` + ${formatTokens(summary.thinkingTokens)}` : ""}`}
            />
          </div>

          <div>
            <SubHeading>By model</SubHeading>
            <CostTable
              columns={[
                { label: "Model" },
                { label: "Share" },
                { label: "Cost", end: true },
                { label: "Calls", end: true },
                { label: "Avg", end: true },
                { label: "In", end: true },
                { label: "Out", end: true },
                { label: "$/1M", end: true },
              ]}
              rows={summary.byModel.map((m) => [
                shortModelName(m.model),
                <ShareBar key="share" share={m.costShare} />,
                formatUsd(m.costUsd),
                String(m.calls),
                formatUsd(m.avgCostUsd),
                formatTokens(m.promptTokens),
                formatTokens(m.outputTokens + m.thinkingTokens),
                m.usdPerMTokens > 0 ? `$${m.usdPerMTokens.toFixed(2)}` : "—",
              ])}
            />
          </div>

          <div>
            <SubHeading>By task</SubHeading>
            <CostTable
              columns={[
                { label: "Task" },
                { label: "Models" },
                { label: "Cost", end: true },
                { label: "Calls", end: true },
                { label: "Avg", end: true },
                { label: "In", end: true },
                { label: "Out", end: true },
              ]}
              rows={summary.byTask.map((task) => [
                task.kind,
                task.models.map(shortModelName).join(", "),
                formatUsd(task.costUsd),
                String(task.calls),
                formatUsd(task.avgCostUsd),
                formatTokens(task.promptTokens),
                formatTokens(task.outputTokens),
              ])}
            />
          </div>

          <div>
            <SubHeading>By action</SubHeading>
            <CostTable
              columns={[
                { label: "Action" },
                { label: "Events", end: true },
                { label: "Failed", end: true },
                { label: "Cached", end: true },
                { label: "Cost", end: true },
                { label: "ScrapeCreators", end: true },
                { label: "Avg", end: true },
                { label: "p50 ms", end: true },
                { label: "p95 ms", end: true },
              ]}
              rows={summary.byAction.map((a) => [
                formatUsageAction(a.action),
                String(a.events),
                String(a.failed),
                String(a.cached),
                formatUsd(a.totalCostUsd),
                formatUsd(a.scrapeCostUsd),
                formatUsd(a.avgCostUsd),
                a.p50Ms == null ? "—" : String(a.p50Ms),
                a.p95Ms == null ? "—" : String(a.p95Ms),
              ])}
            />
          </div>

          {imports.bySource.length > 0 ? (
            <div>
              <SubHeading>Imports by extraction step</SubHeading>
              <p className="mb-3 text-xs text-muted">
                Successful imports only for the rate; failed attempts still count toward cost. Video length and downloads are logged from
                PIN-62 on.
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2.5 @3xl:grid-cols-3">
                <Figure
                  label="Video fallback"
                  value={imports.videoShare == null ? "—" : `${Math.round(imports.videoShare * 100)}% (${imports.videoImports}/${imports.imports})`}
                  strong
                />
                <Figure label="Cost per import" value={usdOrDash(imports.blendedCostUsd)} />
                <Figure label="Text import" value={usdOrDash(imports.textCostPerImportUsd)} />
                <Figure label="Video import" value={usdOrDash(imports.videoCostPerImportUsd)} />
                <Figure label="Video downloads" value={String(imports.videoDownloads)} />
                <Figure
                  label="Video length p50 / p95"
                  value={imports.videoDurationP50 == null ? "—" : `${imports.videoDurationP50}s / ${imports.videoDurationP95}s`}
                />
              </div>
              <CostTable
                columns={[
                  { label: "Platform" },
                  { label: "Step" },
                  { label: "Imports", end: true },
                  { label: "Failed", end: true },
                  { label: "Cost", end: true },
                  { label: "Per import", end: true },
                  { label: "Max", end: true },
                ]}
                rows={imports.bySource.map((line) => [
                  line.platform,
                  line.source,
                  String(line.imports),
                  String(line.failed),
                  formatUsd(line.costUsd),
                  usdOrDash(line.costPerImportUsd),
                  formatUsd(line.maxCostUsd),
                ])}
              />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function CostTable({ columns, rows }: { columns: Column[]; rows: ReactNode[][] }) {
  return (
    <TableWrap>
      <table className={cn(tableClass, "text-xs")}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} scope="col" className={cn(thClass, c.end && numClass)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map((cell, i) => (
                <td key={i} className={cn(tdClass, "py-1.5", columns[i]?.end && numClass, i === 1 && "min-w-28")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
