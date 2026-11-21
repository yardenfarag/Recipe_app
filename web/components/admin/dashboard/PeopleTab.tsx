"use client";

import { useMemo, useState } from "react";

import {
  classifySource,
  countryName,
  deviceName,
  formatCount,
  formatDate,
  formatPercent,
  formatUsd,
  num,
  personSource,
  plural,
  rangeLabel,
  relativeTime,
  sortPeople,
  summarizeSignupSources,
  summarizeWebsiteVisitors,
  type Dashboard,
  type DashboardPerson,
  type PersonSort,
} from "@shared/lib/adminDashboard";

import { RankBars } from "@/components/admin/charts";
import {
  Badge,
  Card,
  EmptyLine,
  Figure,
  PersonCell,
  SearchBox,
  Segmented,
  SubHeading,
  TableWrap,
  numClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Filter = "new" | "all" | "active" | "paying" | "stuck";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "new", label: "New in period" },
  { key: "all", label: "Everyone" },
  { key: "active", label: "Active in period" },
  { key: "paying", label: "Paid" },
  { key: "stuck", label: "Never extracted" },
];

const COLUMNS: { key: PersonSort | null; label: string; num?: boolean }[] = [
  { key: "created_at", label: "Person · joined" },
  { key: "last_active_at", label: "Last active" },
  { key: "recipes", label: "Recipes", num: true },
  { key: "extractions", label: "Extractions", num: true },
  { key: "ai_cost_usd", label: "AI cost", num: true },
  { key: "spent_usd", label: "Paid", num: true },
  { key: null, label: "Came from" },
  { key: null, label: "Country" },
  { key: null, label: "Device" },
];

/** Who is in each filter. Exported for the unit tests. */
export function matchesFilter(person: DashboardPerson, filter: Filter, since: number): boolean {
  if (filter === "new") return new Date(person.created_at).getTime() >= since;
  if (filter === "active") return !!person.last_active_at && new Date(person.last_active_at).getTime() >= since;
  if (filter === "paying") return num(person.credits_bought) > 0;
  if (filter === "stuck") return num(person.extractions) === 0;
  return true;
}

export function PeopleTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("new");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PersonSort>("created_at");
  const since = new Date(data.range.since).getTime();

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = data.people.filter((p) => {
      if (needle && !(p.email ?? "").toLowerCase().includes(needle) && !p.id.startsWith(needle)) return false;
      return matchesFilter(p, filter, since);
    });
    return sortPeople(filtered, sort);
  }, [data.people, filter, query, sort, since]);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, data.people.filter((p) => matchesFilter(p, f.key, since)).length])) as Record<
    Filter,
    number
  >;

  return (
    <div className="flex flex-col gap-5">
      <WebsiteVisitorsCard data={data} since={since} />
      <SignupSourcesCard data={data} since={since} />
      <Card
        title="People"
        subtitle="Click anyone to see their recipes, AI use and purchases. Numbers are all-time unless noted."
        actions={<SearchBox label="Search people by email" placeholder="Search by email" value={query} onChange={setQuery} />}
      >
        <Segmented
          label="Filter people"
          className="mb-4"
          options={FILTERS.map((f) => ({
            value: f.key,
            label: (
              <>
                {f.label} <span className="font-normal text-muted">{counts[f.key]}</span>
              </>
            ),
          }))}
          value={filter}
          onChange={setFilter}
          trackPrefix="admin.dashboard.people.filter"
        />
        {rows.length === 0 ? (
          <EmptyLine>Nobody matches.</EmptyLine>
        ) : (
          <TableWrap>
            <table className={tableClass}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.label} scope="col" className={cn(thClass, c.num && numClass)} aria-sort={c.key && sort === c.key ? "descending" : undefined}>
                      {c.key ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-pressed={sort === c.key}
                          trackId={`admin.dashboard.people.sort.${c.key}`}
                          onClick={() => setSort(c.key as PersonSort)}
                          className={cn("-mx-2 h-7 px-2 text-xs font-bold", sort === c.key ? "text-text" : "text-muted")}
                        >
                          {c.label}
                          {sort === c.key ? <span aria-hidden> ↓</span> : null}
                        </Button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-soft">
                    <td className={cn(tdClass, "max-w-64")}>
                      <Button
                        variant="ghost"
                        trackId="admin.dashboard.people.open"
                        onClick={() => onOpenPerson(p.id)}
                        className="-mx-2 h-auto max-w-full justify-start rounded-xl px-2 py-1 text-start font-normal whitespace-normal"
                      >
                        <PersonCell
                          email={p.email}
                          sub={
                            <>
                              {formatDate(p.created_at)} · {relativeTime(p.created_at)}
                              {p.is_admin ? (
                                <>
                                  {" "}
                                  <Badge>admin</Badge>
                                </>
                              ) : null}
                            </>
                          }
                        />
                      </Button>
                    </td>
                    <td className={cn(tdClass, "whitespace-nowrap text-muted")}>{relativeTime(p.last_active_at)}</td>
                    <td className={cn(tdClass, numClass)}>
                      {p.recipes}
                      {num(p.window_recipes) > 0 ? <div className="text-xs whitespace-nowrap text-muted">+{p.window_recipes} in period</div> : null}
                    </td>
                    <td className={cn(tdClass, numClass)}>
                      {p.extractions}
                      {num(p.failures) > 0 ? <div className="text-xs whitespace-nowrap text-danger">{p.failures} failed</div> : null}
                    </td>
                    <td className={cn(tdClass, numClass)}>{formatUsd(p.ai_cost_usd)}</td>
                    <td className={cn(tdClass, numClass)}>
                      {num(p.spent_usd) > 0 ? <Badge tone="good">{formatUsd(p.spent_usd)}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className={tdClass}>
                      <SourceCell person={p} />
                    </td>
                    <td className={tdClass}>{countryName(p.country)}</td>
                    <td className={cn(tdClass, "whitespace-nowrap")}>{deviceName(p.platform)}</td>
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

function SourceCell({ person }: { person: DashboardPerson }) {
  const source = personSource(person);
  if (!source.known) return <span className="text-muted">—</span>;
  return (
    <>
      {source.label}
      {source.detail ? <div className="text-xs text-muted">{source.detail}</div> : null}
    </>
  );
}

const NOT_DEPLOYED =
  "The database does not send this yet. It appears once the admin_dashboard update (migration 20261118120000) is deployed.";

/** New people in the period by where they came from, and how far each group got. */
function SignupSourcesCard({ data, since }: { data: Dashboard; since: number }) {
  const newcomers = data.people.filter((p) => new Date(p.created_at).getTime() >= since);
  const summary = summarizeSignupSources(newcomers);
  const available = data.people.length === 0 || data.people.some((p) => "heard_about" in p);
  const progress = (s: { people: number; extracted: number; paid: number }) =>
    `${formatPercent(s.extracted, s.people)} extracted · ${formatCount(s.paid)} paid`;
  return (
    <Card
      title="Where new people came from"
      subtitle={`Everyone who signed up in ${rangeLabel(data.range.days)}: ${formatCount(summary.known)} of ${plural(summary.total, "person", "people")} can be traced. Known for most sign-ups from Nov 14, 2026; older accounts have no record.`}
    >
      {!available ? (
        <EmptyLine>{NOT_DEPLOYED}</EmptyLine>
      ) : (
        <div className="grid gap-7 @3xl:grid-cols-2">
          <div>
            <SubHeading>What they answered in onboarding · how far they got</SubHeading>
            <RankBars
              items={summary.heard.map((s) => ({ label: s.label, value: s.people, sub: progress(s) }))}
              format={formatCount}
              empty="No sign-ups in this period."
            />
          </div>
          <div>
            <SubHeading>Site that sent them to pinch-app.io first (web sign-ups)</SubHeading>
            <RankBars
              items={summary.web.map((s) => ({ label: s.label, value: s.people, sub: progress(s) }))}
              format={formatCount}
              empty="No new people linked to a website visit yet."
            />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Everyone who opened pinch-app.io in the period, by where they came from, and how many went on. */
function WebsiteVisitorsCard({ data, since }: { data: Dashboard; since: number }) {
  const web = summarizeWebsiteVisitors(data);
  const available = data.web_totals != null || data.traffic != null;
  const signedUp = new Map<string, number>();
  for (const p of data.people) {
    if (p.web_source == null || new Date(p.created_at).getTime() < since) continue;
    const label = classifySource(p.web_source).label;
    signedUp.set(label, (signedUp.get(label) ?? 0) + 1);
  }
  const figures = [
    { label: "Visited the website", value: web.visitors, sub: plural(web.visits, "page view") },
    { label: "Just looked", value: web.justLooked, sub: `${formatPercent(web.justLooked, web.visitors)} left without tapping a button` },
    { label: "Went on", value: web.clicked, sub: `${formatPercent(web.clicked, web.visitors)} tapped App Store, Google Play or the web app` },
  ];
  return (
    <Card
      title="Website visitors"
      subtitle={`People who opened pinch-app.io (home page or a guide) in ${rangeLabel(data.range.days)}, counted once per browser. Sites other than ChatGPT are known from the referrer, recorded from Nov 17, 2026.`}
    >
      {!available ? (
        <EmptyLine>{NOT_DEPLOYED}</EmptyLine>
      ) : (
        <>
          <div className="mb-5 grid gap-3 @2xl:grid-cols-3">
            {figures.map((f) => (
              <Figure key={f.label} label={f.label} value={formatCount(f.value)} sub={f.sub} strong />
            ))}
          </div>
          <SubHeading>Where they came from · people, how many just looked, tapped and signed up</SubHeading>
          <RankBars
            items={web.sources.map((s) => ({
              label: s.label,
              value: s.visitors,
              sub: `${formatCount(s.justLooked)} just looked · ${formatCount(s.clicked)} tapped · ${formatCount(signedUp.get(s.label) ?? 0)} signed up`,
            }))}
            format={formatCount}
            empty="No website visits in this period."
            limit={12}
          />
        </>
      )}
    </Card>
  );
}
