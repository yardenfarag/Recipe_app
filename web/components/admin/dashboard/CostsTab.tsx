"use client";

import {
  featureName,
  formatCount,
  formatDate,
  formatPercent,
  formatUsd,
  modelName,
  num,
  plural,
  rangeLabel,
  type Dashboard,
} from "@shared/lib/adminDashboard";
import { packName, purchaseStoreName } from "@shared/lib/adminDashboardView";
import { gateRouteName, gateTextMisses, type DashboardInsights } from "@shared/lib/adminHints";

import { DailyBars, RankBars } from "@/components/admin/charts";
import { Badge, Card, EmptyLine, Figure, MiniRow, PersonCell, StatTile, TableWrap, numClass, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const usd = (v: number) => formatUsd(v);
const usdPrecise = (v: number) => formatUsd(v, { precise: true });

const LANGUAGE_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return null;
  }
})();

function languageName(code: string): string {
  if (code === "unknown") return "Unknown";
  try {
    return LANGUAGE_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** What the Jev extract gate decided and how those calls turned out. */
function GateCard({ insights }: { insights: DashboardInsights }) {
  const gate = insights.gate.current;
  const before = insights.gate.previous;
  const decisions = num(gate.decisions);
  const misses = gateTextMisses(gate);
  const prevMisses = gateTextMisses(before);
  return (
    <Card
      title="Jev extract gate"
      subtitle="Before extraction, Jev reads the post's text and picks a route. Only confident calls change the route; unsure ones run the normal ladder."
    >
      {decisions === 0 ? (
        <EmptyLine>The gate made no decisions in this period.</EmptyLine>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 @3xl:grid-cols-4">
            <Figure label="Decisions" value={formatCount(decisions)} sub={`${formatCount(before.decisions)} before`} />
            <Figure label="Confident" value={formatPercent(gate.confident, decisions)} sub={`${formatCount(gate.low_confidence)} unsure`} />
            <Figure
              label="Text calls that were wrong"
              value={misses.extracts ? formatPercent(misses.misses, misses.extracts) : "—"}
              sub={prevMisses.extracts ? `${formatPercent(prevMisses.misses, prevMisses.extracts)} before` : "needed video or failed"}
            />
            <Figure label="Errors · cost" value={`${formatCount(gate.errors)} · ${usdPrecise(num(gate.cost_usd))}`} />
          </div>
          {gate.routes.length > 0 ? (
            <TableWrap>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>Gate said</th>
                    <th scope="col" className={cn(thClass, "text-end")}>Extracts</th>
                    <th scope="col" className={cn(thClass, "text-end")}>Got a recipe</th>
                    <th scope="col" className={cn(thClass, "text-end")}>From the video</th>
                    <th scope="col" className={cn(thClass, "text-end")}>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {gate.routes.map((r) => (
                    <tr key={r.route}>
                      <td className={tdClass}>{gateRouteName(r.route)}</td>
                      <td className={cn(tdClass, numClass)}>{formatCount(r.extracts)}</td>
                      <td className={cn(tdClass, numClass)}>{formatCount(r.recipes)}</td>
                      <td className={cn(tdClass, numClass)}>{formatCount(r.video)}</td>
                      <td className={cn(tdClass, numClass)}>
                        {formatCount(r.failed)}
                        {num(r.blocked) > 0 ? <span className="text-muted"> ({formatCount(r.blocked)} stopped)</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** How many recipes were translated, into what, and what it cost. */
function TranslationsCard({ insights }: { insights: DashboardInsights }) {
  const tr = insights.translations.current;
  const before = insights.translations.previous;
  return (
    <Card title="Translations" subtitle="Recipes translated on request, into the reader's language.">
      {num(tr.calls) === 0 ? (
        <EmptyLine>No translations in this period.</EmptyLine>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Figure label="Translations" value={formatCount(tr.calls)} sub={`${formatCount(before.calls)} before`} />
            <Figure label="Failed" value={formatPercent(tr.failed, tr.calls)} sub={`${formatCount(tr.failed)} of ${formatCount(tr.calls)}`} />
            <Figure label="People" value={formatCount(tr.people)} />
            <Figure label="Cost" value={usdPrecise(num(tr.cost_usd))} sub={num(before.calls) > 0 ? `${usdPrecise(num(before.cost_usd))} before` : undefined} />
          </div>
          <RankBars items={tr.languages.map((l) => ({ label: languageName(l.label), value: num(l.count) }))} format={formatCount} empty="" />
        </>
      )}
    </Card>
  );
}

export function CostsTab({
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
  const cost = num(now.ai_cost_usd);
  const revenue = num(now.revenue_usd);
  const admin = num(now.ai_cost_admin_usd);
  const guests = num(now.ai_cost_guest_usd);
  const people = Math.max(0, cost - admin - guests);
  const scrape = num(data.scrape_cost_usd);
  const activePeople = num(now.active_users);
  const topSpenders = [...data.people]
    .filter((p) => num(p.window_ai_cost_usd) > 0)
    .sort((a, b) => num(b.window_ai_cost_usd) - num(a.window_ai_cost_usd))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-3 @5xl:grid-cols-5">
        <StatTile
          label="AI cost"
          value={usd(cost)}
          current={cost}
          previous={before.ai_cost_usd}
          upIsGood={null}
          sub={`${usd(data.totals.ai_cost_usd)} all time`}
          spark={data.daily.map((d) => num(d.ai_cost_usd))}
        />
        <StatTile
          label="Revenue (approx.)"
          value={usd(revenue)}
          current={revenue}
          previous={before.revenue_usd}
          sub={`${usd(data.totals.revenue_usd)} all time · ${data.totals.paying_users} paying`}
          spark={data.daily.map((d) => num(d.revenue_usd))}
        />
        <StatTile
          label="Revenue minus AI cost"
          value={usd(revenue - cost)}
          current={revenue - cost}
          previous={num(before.revenue_usd) - num(before.ai_cost_usd)}
          sub={`${usd(num(data.totals.revenue_usd) - num(data.totals.ai_cost_usd))} all time`}
        />
        <StatTile
          label="Cost per extraction"
          value={num(now.extractions) ? usdPrecise(cost / num(now.extractions)) : "—"}
          current={num(now.extractions) ? cost / num(now.extractions) : 0}
          previous={num(before.extractions) ? num(before.ai_cost_usd) / num(before.extractions) : 0}
          upIsGood={false}
          sub="All AI cost divided by successful extractions"
        />
        <StatTile
          label="Cost per active person"
          value={activePeople ? usdPrecise(cost / activePeople) : "—"}
          current={activePeople ? cost / activePeople : 0}
          previous={num(before.active_users) ? num(before.ai_cost_usd) / num(before.active_users) : 0}
          upIsGood={false}
          sub="Signed-in people only"
        />
      </div>

      <Card title="AI cost per day" subtitle="Every model call and scrape, including guests and admins.">
        <DailyBars days={data.daily} metric={{ key: "ai_cost_usd", label: "AI cost", format: usd }} />
      </Card>

      <div className="grid gap-5 @3xl:grid-cols-2">
        <Card title="Cost by feature" subtitle={`What the money went on in ${rangeLabel(data.range.days)}.`}>
          <RankBars
            items={data.cost_by_action.map((a) => ({
              label: featureName(a.action),
              value: num(a.cost_usd),
              sub: `${plural(a.events, "run")}${num(a.failed) ? ` · ${a.failed} failed` : ""}`,
            }))}
            format={usdPrecise}
            limit={10}
          />
        </Card>
        <Card title="Cost by model" subtitle="Scraping (ScrapeCreators) is listed separately.">
          <RankBars
            items={[
              ...data.cost_by_model.map((m) => ({
                label: modelName(m.model),
                value: num(m.cost_usd),
                sub: `${plural(m.calls, "call")} · ${plural(m.tokens, "token")}`,
              })),
              ...(scrape > 0 ? [{ label: "Scraping (ScrapeCreators)", value: scrape }] : []),
            ].sort((a, b) => b.value - a.value)}
            format={usdPrecise}
            limit={10}
          />
        </Card>
      </div>

      <div className="grid gap-5 @3xl:grid-cols-2">
        <Card title="Who the cost came from">
          <RankBars
            items={[
              { label: "Signed-in people", value: people },
              { label: "Guests (no account)", value: guests },
              { label: "Admin accounts (testing)", value: admin },
            ]}
            format={usdPrecise}
          />
        </Card>
        <Card title="Biggest AI users" subtitle={`By AI cost in ${rangeLabel(data.range.days)}.`}>
          {topSpenders.length === 0 ? <EmptyLine>No signed-in AI use in this period.</EmptyLine> : null}
          <div className="-mx-2 flex flex-col">
            {topSpenders.map((p) => (
              <MiniRow key={p.id} trackId="admin.dashboard.costs.person" onClick={() => onOpenPerson(p.id)}>
                <span className="min-w-0 flex-1">
                  <PersonCell email={p.email} sub={`${plural(p.extractions, "extraction")} · ${plural(p.recipes, "recipe")}`} />
                </span>
                <strong className="text-text tabular-nums">{usdPrecise(p.window_ai_cost_usd)}</strong>
              </MiniRow>
            ))}
          </div>
        </Card>
      </div>

      {insights ? (
        <div className="grid gap-5 @5xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <GateCard insights={insights} />
          <TranslationsCard insights={insights} />
        </div>
      ) : null}

      <Card
        title="Purchases"
        subtitle="Revenue uses the catalog price ($1.99 / $4.99 / $7.99), before store fees and tax. Refunded packs are left out."
      >
        {data.purchases.length === 0 ? (
          <EmptyLine>No purchases in this period.</EmptyLine>
        ) : (
          <TableWrap>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>When</th>
                  <th scope="col" className={thClass}>Person</th>
                  <th scope="col" className={thClass}>Pack</th>
                  <th scope="col" className={thClass}>Store</th>
                  <th scope="col" className={cn(thClass, numClass)}>Credits</th>
                  <th scope="col" className={cn(thClass, numClass)}>Price</th>
                </tr>
              </thead>
              <tbody>
                {data.purchases.map((p) => (
                  <tr key={`${p.created_at}-${p.user_id}`} className="hover:bg-element">
                    <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(p.created_at, true)}</td>
                    <td className={tdClass}>
                      <Button
                        variant="ghost"
                        trackId="admin.dashboard.costs.purchase_person"
                        onClick={() => onOpenPerson(p.user_id)}
                        className="-mx-2 h-auto max-w-full justify-start rounded-xl px-2 py-1 text-start font-normal whitespace-normal"
                      >
                        <PersonCell email={p.email} />
                      </Button>
                    </td>
                    <td className={tdClass}>{packName(p.product_id)}</td>
                    <td className={tdClass}>
                      <Badge>{purchaseStoreName(p.provider)}</Badge>
                    </td>
                    <td className={cn(tdClass, numClass)}>{p.credits}</td>
                    <td className={cn(tdClass, numClass)}>{usd(p.usd)}</td>
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
