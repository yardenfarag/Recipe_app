"use client";

import { useCallback, useState } from "react";

import { eventLabel, formatWhen } from "@shared/lib/adminFormat";
import { INSIGHT_RANGES, insightSince, summarizeFailures, summarizeInsights, type InsightRange, type RankedItem } from "@shared/lib/adminInsights";
import { fetchAdminFailures, fetchAdminProductEvents, fetchAdminPurchases } from "@shared/lib/supabase/adminUsage";

import { Card, EmptyLine, ErrorLine, Figure, Segmented, Skeleton, TableWrap, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

/** Everything the page shows for one range, read and summed as the mobile Insights screen does. */
export async function loadInsights(range: InsightRange, now = new Date()) {
  const since = insightSince(range, now);
  const [events, usage, purchases] = await Promise.all([
    fetchAdminProductEvents(since),
    fetchAdminFailures(since),
    fetchAdminPurchases(since),
  ]);
  return {
    summary: summarizeInsights(events, now, range),
    failures: summarizeFailures(usage),
    purchases,
    costUsd: usage.reduce((sum, row) => sum + row.total_cost_usd, 0),
  };
}

export function InsightsPage({ load = loadInsights }: { load?: typeof loadInsights }) {
  const [range, setRange] = useState<InsightRange>(14);
  const read = useCallback(() => load(range), [load, range]);
  const { data, error, loading, reload } = useAdminData(String(range), read, "Could not load insights.");

  return (
    <>
      <PageHeader
        title="Insights"
        tabTitle="Admin insights"
        subtitle="What people do in Pinch. Names and account ids stay off this page."
        actions={
          <Button variant="outline" size="sm" trackId="admin.insights.refresh" onClick={reload} busy={loading && data != null}>
            Refresh
          </Button>
        }
      />
      <Segmented
        label="Time range"
        className="mb-5"
        options={INSIGHT_RANGES.map((days) => ({ value: days, label: `${days} days` }))}
        value={range}
        onChange={setRange}
        trackPrefix="admin.insights.range"
      />
      {error ? (
        <div className="mb-5">
          <ErrorLine>{error}</ErrorLine>
        </div>
      ) : null}
      {!data ? (
        loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-48" />
          </div>
        ) : null
      ) : (
        <div className={cn("flex flex-col gap-5 transition-opacity", loading ? "opacity-60" : "")} aria-busy={loading || undefined}>
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @5xl:grid-cols-6">
            <Figure label="Events" value={String(data.summary.events)} strong />
            <Figure label="Signed-in people" value={String(data.summary.signedInPeople)} strong />
            <Figure label="Guest installs" value={String(data.summary.guestInstalls)} strong />
            <Figure label="AI failures" value={String(data.failures.failed)} strong />
            <Figure label="AI cost" value={`$${data.costUsd.toFixed(2)}`} strong />
            <Figure label="Credits sold" value={String(data.purchases.reduce((sum, row) => sum + row.credits, 0))} strong />
          </div>

          <Card title={`Last ${range} days`} subtitle="Product events per day.">
            <DayColumns days={data.summary.days} range={range} />
          </Card>

          <Card title="Web intro">
            <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-5">
              <Figure label="Visits" value={String(data.summary.webIntro.visits)} />
              <Figure label="Visitors" value={String(data.summary.webIntro.visitors)} />
              <Figure label="App Store" value={String(data.summary.webIntro.appStoreClicks)} />
              <Figure label="Google Play" value={String(data.summary.webIntro.playStoreClicks)} />
              <Figure label="Continue on the web" value={String(data.summary.webIntro.continueClicks)} />
            </div>
          </Card>

          <div className="grid gap-5 @3xl:grid-cols-2">
            <Card title="Countries">
              <RankList items={data.summary.countries} empty="No product events yet." />
            </Card>
            <Card title="What people use">
              <RankList items={data.summary.byName} empty="No product events yet." format={eventLabel} />
            </Card>
            <Card title="How Snaps start">
              <RankList items={data.summary.snapSources} empty="No Snaps yet." />
              <RankList items={data.summary.snapModes} empty="" />
            </Card>
            <Card title="What gets saved">
              <RankList items={data.summary.saveFrom} empty="No saves yet." />
            </Card>
            <Card title="Why the credit sheet opens">
              <RankList items={data.summary.paywallTriggers} empty="No paywall views yet." />
            </Card>
            <Card title="How people heard about Pinch">
              <RankList items={data.summary.heardAbout} empty="No answers yet. New people are asked during onboarding." format={eventLabel} />
            </Card>
            <Card title="Onboarding languages">
              <RankList items={data.summary.locales} empty="Nobody has finished onboarding yet." />
            </Card>
            <Card title="Where AI fails">
              <RankList items={data.failures.byAction} empty="No failures in the recent log." />
              {data.failures.byMessage.length ? (
                <ul className="mt-3 flex flex-col gap-1 text-xs leading-5 text-muted">
                  {data.failures.byMessage.map((item) => (
                    <li key={item.label} className="break-words">
                      {item.count}× {item.sample}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </div>

          <Card title="Purchases">
            <EventTable
              header={["When", "Account", "Credits", "Product", "Provider"]}
              rows={data.purchases.map((row) => [formatWhen(row.createdAt), row.email ?? "—", String(row.credits), row.productId, row.provider])}
            />
          </Card>
          <Card title="Recent activity">
            <EventTable
              header={["When", "Event", "Country", "Detail"]}
              rows={data.summary.recent.map((row) => [formatWhen(row.when), eventLabel(row.name), row.country, row.detail || "—"])}
            />
          </Card>
          <Card title="Recent failures">
            <EventTable
              header={["When", "Action", "Where", "Message"]}
              rows={data.failures.recent.map((row) => [formatWhen(row.when), row.action, row.where, row.message])}
            />
          </Card>
        </div>
      )}
    </>
  );
}

/** Events per day as columns, labelled every day for short ranges and once a week for long ones. */
function DayColumns({ days, range }: { days: { label: string; count: number }[]; range: number }) {
  const peak = Math.max(1, ...days.map((day) => day.count));
  return (
    <div dir="ltr">
      <ol className="flex h-24 items-end gap-1" aria-label="Events per day">
        {days.map((day) => (
          <li key={day.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${day.label}: ${day.count}`}>
            <span className="sr-only">
              {day.label}: {day.count}
            </span>
            <span
              aria-hidden
              className={cn("block w-full rounded-t", day.count ? "bg-primary" : "bg-border")}
              style={{ height: `${Math.max(4, Math.round((day.count / peak) * 96))}px` }}
            />
          </li>
        ))}
      </ol>
      <div aria-hidden className="mt-1 flex gap-1">
        {days.map((day, index) => (
          <span key={day.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted">
            {range > 14 && index % 7 !== 0 ? "" : day.label.slice(3)}
          </span>
        ))}
      </div>
    </div>
  );
}

function RankList({ items, empty, format = (value) => value }: { items: RankedItem[]; empty: string; format?: (value: string) => string }) {
  if (items.length === 0) return empty ? <EmptyLine>{empty}</EmptyLine> : null;
  const max = items[0]?.count ?? 1;
  return (
    <ul className="mb-2 flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-text">{format(item.label)}</span>
            <span className="font-semibold text-text tabular-nums">{item.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-soft">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, Math.round((item.count / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EventTable({ header, rows }: { header: string[]; rows: string[][] }) {
  if (rows.length === 0) return <EmptyLine>Nothing yet.</EmptyLine>;
  return (
    <TableWrap>
      <table className={tableClass}>
        <thead>
          <tr>
            {header.map((cell) => (
              <th key={cell} scope="col" className={thClass}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cn(tdClass, cellIndex === 0 ? "whitespace-nowrap" : "break-words", "text-xs")}>
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
