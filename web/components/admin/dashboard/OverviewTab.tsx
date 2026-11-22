"use client";

import { useState } from "react";

import {
  buildHighlights,
  countryName,
  formatCount,
  formatPercent,
  formatUsd,
  humanize,
  num,
  plural,
  rangeLabel,
  relativeTime,
  summarizeTraffic,
  type Dashboard,
} from "@shared/lib/adminDashboard";
import { countryCounts, platformName } from "@shared/lib/adminDashboardView";
import type { DashboardInsights, HintTab } from "@shared/lib/adminHints";

import { DailyBars, Funnel, RankBars, type DayMetric } from "@/components/admin/charts";
import { HintsCard } from "@/components/admin/dashboard/HintsCard";
import { Card, EmptyLine, MiniRow, PersonCell, Segmented, StatTile, SubHeading, Thumb } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export const DAY_METRICS: DayMetric[] = [
  { key: "signups", label: "New sign-ups", format: formatCount },
  { key: "active_users", label: "Active people", format: formatCount },
  { key: "recipes", label: "Recipes saved", format: formatCount },
  { key: "extractions", label: "Extractions", format: formatCount },
  { key: "failures", label: "Failed extractions", format: formatCount, tone: "bad" },
  { key: "ai_cost_usd", label: "AI cost", format: (v) => formatUsd(v) },
  { key: "revenue_usd", label: "Revenue", format: (v) => formatUsd(v) },
];

export function OverviewTab({
  data,
  insights,
  insightsError,
  onOpenPerson,
  onShowTab,
}: {
  data: Dashboard;
  insights: DashboardInsights | null;
  insightsError: string | null;
  onOpenPerson: (id: string) => void;
  onShowTab: (tab: HintTab | "recipes") => void;
}) {
  const [metricKey, setMetricKey] = useState<DayMetric["key"]>("signups");
  const metric = DAY_METRICS.find((m) => m.key === metricKey) ?? DAY_METRICS[0];
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const series = (key: DayMetric["key"]) => data.daily.map((d) => num(d[key]));
  const attempts = num(now.extractions) + num(now.extraction_failures);
  const highlights = buildHighlights(data);
  const since = new Date(data.range.since).getTime();
  const newcomers = data.people.filter((p) => new Date(p.created_at).getTime() >= since);
  const newest = newcomers.slice(0, 6);
  const f = data.funnel;
  const traffic = summarizeTraffic(data.traffic ?? []);

  return (
    <div className="flex flex-col gap-5">
      <HintsCard data={data} insights={insights} insightsError={insightsError} onShowTab={onShowTab} />
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title={`What happened in ${rangeLabel(data.range.days)}`} subtitle="Compared with the period just before it.">
          <ul className="flex flex-col gap-2.5">
            {highlights.map((h) => (
              <li key={h.text} className="flex items-start gap-2.5 text-sm text-text">
                <span
                  aria-hidden
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold",
                    h.tone === "good" ? "bg-success-soft text-success" : h.tone === "bad" ? "bg-danger-soft text-danger" : "bg-element text-muted",
                  )}
                >
                  {h.tone === "good" ? "↑" : h.tone === "bad" ? "!" : "•"}
                </span>
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="New people: how far they got" subtitle={`Everyone who signed up in ${rangeLabel(data.range.days)}.`}>
          <Funnel
            steps={[
              { label: "Signed up", count: num(f.signed_up) },
              { label: "Extracted a recipe", count: num(f.extracted) },
              { label: "Saved a recipe", count: num(f.saved) },
              { label: "Saved 3+ recipes", count: num(f.saved_3) },
              { label: "Cooked a recipe", count: num(f.cooked) },
              { label: "Bought credits", count: num(f.purchased) },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-3 @5xl:grid-cols-6">
        <StatTile
          label="New sign-ups"
          value={formatCount(now.new_users)}
          current={now.new_users}
          previous={before.new_users}
          sub={`${formatCount(data.totals.users)} accounts in total`}
          spark={series("signups")}
        />
        <StatTile
          label="Active people"
          value={formatCount(now.active_users)}
          current={now.active_users}
          previous={before.active_users}
          sub={`plus ${formatCount(now.active_guests)} guests without an account`}
          spark={series("active_users")}
        />
        <StatTile
          label="Recipes saved"
          value={formatCount(now.recipes_saved)}
          current={now.recipes_saved}
          previous={before.recipes_saved}
          sub={`${formatCount(data.totals.recipes)} recipes in total`}
          spark={series("recipes")}
        />
        <StatTile
          label="Extractions"
          value={formatCount(now.extractions)}
          current={now.extractions}
          previous={before.extractions}
          sub={`${formatCount(now.extraction_failures)} failed (${formatPercent(now.extraction_failures, attempts)})`}
          spark={series("extractions")}
        />
        <StatTile
          label="AI cost"
          value={formatUsd(now.ai_cost_usd)}
          current={now.ai_cost_usd}
          previous={before.ai_cost_usd}
          upIsGood={null}
          sub={
            num(now.extractions)
              ? `${formatUsd(num(now.ai_cost_usd) / num(now.extractions), { precise: true })} per extraction`
              : `${formatUsd(data.totals.ai_cost_usd)} all time`
          }
          spark={series("ai_cost_usd")}
        />
        <StatTile
          label="Revenue (approx.)"
          value={formatUsd(now.revenue_usd)}
          current={now.revenue_usd}
          previous={before.revenue_usd}
          sub={`${formatCount(now.purchases)} packs · ${formatCount(now.credits_sold)} credits`}
          spark={series("revenue_usd")}
        />
      </div>

      <Card
        title={`${metric.label} per day`}
        subtitle="Hover a bar for the exact number."
        actions={
          <Segmented
            label="Metric"
            options={DAY_METRICS.map((m) => ({ value: m.key, label: m.label }))}
            value={metricKey}
            onChange={setMetricKey}
            trackPrefix="admin.dashboard.overview.metric"
          />
        }
      >
        <DailyBars days={data.daily} metric={metric} />
      </Card>

      <div className="grid gap-5 @3xl:grid-cols-2 @5xl:grid-cols-3">
        <Card
          title="Newest people"
          actions={
            <Button size="sm" variant="outline" trackId="admin.dashboard.overview.all_people" onClick={() => onShowTab("people")}>
              All people
            </Button>
          }
        >
          {newest.length === 0 ? <EmptyLine>No sign-ups in this period.</EmptyLine> : null}
          <div className="-mx-2 flex flex-col">
            {newest.map((p) => (
              <MiniRow key={p.id} trackId="admin.dashboard.overview.person" onClick={() => onOpenPerson(p.id)}>
                <PersonCell
                  email={p.email}
                  sub={`Joined ${relativeTime(p.created_at)} · ${plural(p.recipes, "recipe")}${p.country ? ` · ${countryName(p.country)}` : ""}`}
                />
              </MiniRow>
            ))}
          </div>
        </Card>
        <Card
          title="Latest recipes"
          actions={
            <Button size="sm" variant="outline" trackId="admin.dashboard.overview.all_recipes" onClick={() => onShowTab("recipes")}>
              All recipes
            </Button>
          }
        >
          {data.recent_recipes.length === 0 ? <EmptyLine>No recipes saved in this period.</EmptyLine> : null}
          <div className="-mx-2 flex flex-col">
            {data.recent_recipes.slice(0, 6).map((r) => (
              <MiniRow key={r.id} trackId="admin.dashboard.overview.recipe" onClick={() => onOpenPerson(r.user_id)}>
                <Thumb src={r.image_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text">{r.title || "Untitled recipe"}</span>
                  <span className="block truncate text-xs text-muted">
                    {platformName(r.platform)} · {r.email ?? "unknown"} · {relativeTime(r.created_at)}
                  </span>
                </span>
              </MiniRow>
            ))}
          </div>
        </Card>
        <Card title="Where recipes come from" subtitle="Recipes saved in this period.">
          <RankBars
            items={data.recipes_by_platform.map((r) => ({ label: platformName(r.label), value: num(r.count) }))}
            format={formatCount}
            empty="No recipes saved in this period."
          />
          <div className="mt-5">
            <SubHeading>Where in the post the recipe was found</SubHeading>
            <RankBars items={data.recipes_by_source.map((r) => ({ label: humanize(r.label), value: num(r.count) }))} format={formatCount} empty="" />
          </div>
        </Card>
      </div>

      <Card
        title="Where website visitors come from"
        subtitle="Visits to pinch-app.io (home page and guides). ChatGPT tags its links; other sites are known from the referrer, which is recorded from Nov 17, 2026. Older untagged visits show as direct or unknown."
      >
        <div className="grid gap-7 @3xl:grid-cols-2">
          <div>
            <SubHeading>By kind · {formatCount(traffic.totalVisits)} visits</SubHeading>
            <RankBars
              items={traffic.groups.map((g) => ({ label: g.label, value: g.visits, sub: formatPercent(g.visits, traffic.totalVisits) }))}
              format={formatCount}
              empty="No website visits in this period."
            />
          </div>
          <div>
            <SubHeading>By site · people who then tapped a store or web-app button</SubHeading>
            <RankBars
              items={traffic.sources.map((s) => ({
                label: s.label,
                value: s.visits,
                sub: `${plural(s.visitors, "person", "people")} · ${formatCount(s.clicked)} tapped`,
              }))}
              format={formatCount}
              empty="No website visits in this period."
              limit={10}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 @3xl:grid-cols-2">
        <Card title="Where new people are from" subtitle="Country of their latest app event.">
          <RankBars items={countryCounts(newcomers.map((p) => p.country))} format={formatCount} empty="No sign-ups in this period." />
        </Card>
        <Card
          title="How people heard about Pinch"
          subtitle="All onboarding answers, including from guests who never made an account. The People tab shows the answer behind each new account."
        >
          <RankBars
            items={data.heard_about.map((h) => ({ label: humanize(h.label), value: num(h.count) }))}
            format={formatCount}
            empty="No answers in this period."
          />
        </Card>
      </div>
    </div>
  );
}
