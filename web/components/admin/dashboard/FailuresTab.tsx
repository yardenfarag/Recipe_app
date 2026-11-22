"use client";

import { featureName, formatCount, formatDate, formatPercent, humanize, num, rangeLabel, type Dashboard } from "@shared/lib/adminDashboard";
import { platformName } from "@shared/lib/adminDashboardView";
import { formatMs, MIN_SAMPLE, platformFailureRows, type DashboardInsights } from "@shared/lib/adminHints";

import { DailyBars, RankBars } from "@/components/admin/charts";
import { Badge, Card, EmptyLine, PersonCell, StatTile, TableWrap, numClass, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);

/** Extraction attempts, failures and speed per platform, from admin_dashboard_insights. */
function PlatformFailures({ insights }: { insights: DashboardInsights }) {
  const rows = platformFailureRows(insights);
  return (
    <Card title="Failure rate by platform" subtitle="Extraction attempts that returned a recipe or failed. Cache hits and non-food posts are left out.">
      {rows.length === 0 ? (
        <EmptyLine>No extractions in this period.</EmptyLine>
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>Platform</th>
                <th scope="col" className={cn(thClass, "text-end")}>Attempts</th>
                <th scope="col" className={cn(thClass, "text-end")}>Failed</th>
                <th scope="col" className={cn(thClass, "text-end")}>Failure rate</th>
                <th scope="col" className={cn(thClass, "text-end")}>Before</th>
                <th scope="col" className={cn(thClass, "text-end")}>Needed video</th>
                <th scope="col" className={cn(thClass, "text-end")}>Slowest 5%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.platform}>
                  <td className={tdClass}>{r.label}</td>
                  <td className={cn(tdClass, numClass)}>{formatCount(r.attempts)}</td>
                  <td className={cn(tdClass, numClass)}>{formatCount(r.failed)}</td>
                  <td
                    className={cn(
                      tdClass,
                      numClass,
                      "font-semibold",
                      r.attempts >= MIN_SAMPLE && r.failureRate >= 0.2 ? "text-danger" : undefined,
                    )}
                  >
                    {pct(r.failureRate)}
                  </td>
                  <td className={cn(tdClass, numClass, "text-muted")}>{pct(r.previousRate)}</td>
                  <td className={cn(tdClass, numClass)}>{pct(r.videoShare)}</td>
                  <td className={cn(tdClass, numClass, "whitespace-nowrap")}>{formatMs(r.p95Ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

/** How long each AI feature takes: the typical call and the slowest 5%. */
function Speed({ insights }: { insights: DashboardInsights }) {
  return (
    <Card title="How long AI features take" subtitle="Typical is the middle call; the slowest 5% is what the unluckiest people waited.">
      {insights.latency.length === 0 ? (
        <EmptyLine>No timed calls in this period.</EmptyLine>
      ) : (
        <TableWrap>
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>Feature</th>
                <th scope="col" className={cn(thClass, "text-end")}>Calls</th>
                <th scope="col" className={cn(thClass, "text-end")}>Typical</th>
                <th scope="col" className={cn(thClass, "text-end")}>Slowest 5%</th>
              </tr>
            </thead>
            <tbody>
              {insights.latency.map((row) => (
                <tr key={row.action}>
                  <td className={tdClass}>{featureName(row.action)}</td>
                  <td className={cn(tdClass, numClass)}>{formatCount(row.calls)}</td>
                  <td className={cn(tdClass, numClass, "whitespace-nowrap")}>{formatMs(row.p50_ms)}</td>
                  <td className={cn(tdClass, numClass, "whitespace-nowrap")}>{formatMs(row.p95_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function FailuresTab({
  data,
  insights,
  onOpenPerson,
}: {
  data: Dashboard;
  insights: DashboardInsights | null;
  onOpenPerson: (id: string) => void;
}) {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const attempts = num(now.extractions) + num(now.extraction_failures);
  const prevAttempts = num(before.extractions) + num(before.extraction_failures);
  const rate = attempts ? num(now.extraction_failures) / attempts : 0;
  const prevRate = prevAttempts ? num(before.extraction_failures) / prevAttempts : 0;
  const byFeature = data.cost_by_action
    .filter((a) => num(a.failed) > 0)
    .map((a) => ({ label: featureName(a.action), value: num(a.failed), sub: `of ${formatCount(a.events)}` }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-3 @5xl:grid-cols-5">
        <StatTile
          label="Failed extractions"
          value={formatCount(now.extraction_failures)}
          current={now.extraction_failures}
          previous={before.extraction_failures}
          upIsGood={false}
          sub={`out of ${formatCount(attempts)} attempts`}
          spark={data.daily.map((d) => num(d.failures))}
        />
        <StatTile
          label="Failure rate"
          value={formatPercent(now.extraction_failures, attempts)}
          current={Math.round(rate * 1000)}
          previous={Math.round(prevRate * 1000)}
          upIsGood={false}
          sub={`${formatPercent(before.extraction_failures, prevAttempts)} the period before`}
        />
      </div>

      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Failed extractions per day">
          <DailyBars days={data.daily} metric={{ key: "failures", label: "Failed extractions", format: formatCount, tone: "bad" }} height={200} />
        </Card>
        <Card title="Failures by feature" subtitle="Every AI feature, not only extraction.">
          <RankBars items={byFeature} format={formatCount} tone="bad" empty="No failures in this period." />
        </Card>
      </div>

      {insights ? (
        <div className="grid gap-5 @5xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <PlatformFailures insights={insights} />
          <Speed insights={insights} />
        </div>
      ) : null}

      <Card title="Latest problems" subtitle={`The newest 40 from ${rangeLabel(data.range.days)}, including rejected (non-food) posts.`}>
        {data.recent_failures.length === 0 ? (
          <EmptyLine>Nothing went wrong in this period.</EmptyLine>
        ) : (
          <TableWrap>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>When</th>
                  <th scope="col" className={thClass}>Who</th>
                  <th scope="col" className={thClass}>Feature</th>
                  <th scope="col" className={thClass}>Result</th>
                  <th scope="col" className={thClass}>Where</th>
                  <th scope="col" className={thClass}>Message</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_failures.map((f, i) => (
                  <tr key={`${f.created_at}-${i}`} className="hover:bg-element">
                    <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(f.created_at, true)}</td>
                    <td className={cn(tdClass, "max-w-56")}>
                      {f.guest ? (
                        <span className="text-muted">Guest</span>
                      ) : f.user_id ? (
                        <Button
                          variant="ghost"
                          trackId="admin.dashboard.failures.person"
                          onClick={() => onOpenPerson(f.user_id as string)}
                          className="-mx-2 h-auto max-w-full justify-start rounded-xl px-2 py-1 text-start font-normal whitespace-normal"
                        >
                          <PersonCell email={f.email} />
                        </Button>
                      ) : (
                        <PersonCell email={f.email} />
                      )}
                    </td>
                    <td className={tdClass}>{featureName(f.action)}</td>
                    <td className={tdClass}>
                      <Badge tone={f.status === "rejected" ? undefined : "bad"}>{humanize(f.status)}</Badge>
                    </td>
                    <td className={tdClass}>
                      {[f.platform ? platformName(f.platform) : null, f.source ? humanize(f.source) : null].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={cn(tdClass, "max-w-[26rem] text-xs break-words")}>{f.message || <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
