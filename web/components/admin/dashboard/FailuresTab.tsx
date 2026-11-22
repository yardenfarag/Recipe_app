"use client";

import { featureName, formatCount, formatDate, formatPercent, humanize, num, rangeLabel, type Dashboard } from "@shared/lib/adminDashboard";
import { platformName } from "@shared/lib/adminDashboardView";

import { DailyBars, RankBars } from "@/components/admin/charts";
import { Badge, Card, EmptyLine, PersonCell, StatTile, TableWrap, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function FailuresTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
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
                  <tr key={`${f.created_at}-${i}`} className="hover:bg-surface-soft">
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
