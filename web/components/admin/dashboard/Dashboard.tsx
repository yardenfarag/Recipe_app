"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { DASHBOARD_RANGES, formatDate, num, relativeTime, type Dashboard as DashboardData } from "@shared/lib/adminDashboard";
import { fetchAdminDashboard } from "@shared/lib/supabase/adminDashboard";

import { CostsTab } from "@/components/admin/dashboard/CostsTab";
import { FailuresTab } from "@/components/admin/dashboard/FailuresTab";
import { OverviewTab } from "@/components/admin/dashboard/OverviewTab";
import { PeopleTab } from "@/components/admin/dashboard/PeopleTab";
import { PersonSheet } from "@/components/admin/dashboard/PersonSheet";
import { RecipesTab } from "@/components/admin/dashboard/RecipesTab";
import { ErrorLine, Segmented, Skeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { readDashboardPrefs, writeDashboardPrefs, type DashboardPrefs } from "@/lib/admin/dashboardPrefs";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

export type DashboardTab = "overview" | "people" | "recipes" | "costs" | "failures";

/**
 * Who signed up, what they saved, what AI cost and what sold, for a range of days. One call (`admin_dashboard`,
 * admins only) feeds every tab, bucketed by day in this browser's timezone, as on the Expo web app's dashboard.
 */
export function Dashboard({ load = fetchAdminDashboard }: { load?: typeof fetchAdminDashboard }) {
  // The saved range is read after the first render: the server can't see this browser's storage.
  const [prefs, setPrefs] = useState<DashboardPrefs | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readDashboardPrefs());
  }, []);
  if (!prefs) return <DashboardHeader />;
  return (
    <DashboardBody
      prefs={prefs}
      onPrefs={(next) => {
        setPrefs(next);
        writeDashboardPrefs(next);
      }}
      load={load}
    />
  );
}

function DashboardHeader({ data, actions }: { data?: DashboardData | null; actions?: ReactNode }) {
  return (
    <PageHeader
      title="Dashboard"
      tabTitle="Admin dashboard"
      subtitle={data ? `Updated ${relativeTime(data.range.generated_at)} · days in ${data.range.tz}` : "Loading…"}
      actions={actions}
    />
  );
}

function DashboardBody({
  prefs,
  onPrefs,
  load,
}: {
  prefs: DashboardPrefs;
  onPrefs: (prefs: DashboardPrefs) => void;
  load: typeof fetchAdminDashboard;
}) {
  const { days, includeAdmins } = prefs;
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [personId, setPersonId] = useState<string | null>(null);
  const read = useCallback(() => load(days, includeAdmins), [load, days, includeAdmins]);
  const { data, error, loading, reload } = useAdminData(`${days}:${includeAdmins}`, read, "Could not load the dashboard.");

  const failures = data ? num(data.kpis.current.extraction_failures) : 0;
  const since = data ? new Date(data.range.since).getTime() : 0;
  const newPeople = data ? data.people.filter((p) => new Date(p.created_at).getTime() >= since).length : 0;
  const tabs: { key: DashboardTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "people", label: "People", count: newPeople || undefined },
    { key: "recipes", label: "Recipes", count: data?.recent_recipes.length || undefined },
    { key: "costs", label: "Costs & revenue" },
    { key: "failures", label: "Failures", count: failures || undefined },
  ];

  return (
    <>
      <DashboardHeader
        data={data}
        actions={
          <Button variant="outline" size="sm" trackId="admin.dashboard.refresh" onClick={reload} busy={loading && data != null}>
            Refresh
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented
          label="Time range"
          options={DASHBOARD_RANGES.map((r) => ({ value: r.days, label: r.label }))}
          value={days}
          onChange={(next) => onPrefs({ days: next, includeAdmins })}
          trackPrefix="admin.dashboard.range"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted select-none" title="Your own and other admin accounts. AI cost always includes them.">
          <input
            type="checkbox"
            data-track="admin.dashboard.include_admins.toggle"
            className="h-4 w-4 accent-primary"
            checked={includeAdmins}
            onChange={(e) => onPrefs({ days, includeAdmins: e.target.checked })}
          />
          Include admin accounts
        </label>
      </div>

      <div role="tablist" aria-label="Dashboard sections" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <Button
            key={t.key}
            role="tab"
            id={`admin-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="admin-tab-panel"
            variant="ghost"
            size="sm"
            trackId={`admin.dashboard.tab.${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px rounded-none rounded-t-xl border-b-2 px-3",
              tab === t.key ? "border-primary text-text" : "border-transparent text-muted",
            )}
          >
            {t.label}
            {t.count ? <span className="rounded-full bg-element px-1.5 text-xs font-semibold text-muted tabular-nums">{t.count}</span> : null}
          </Button>
        ))}
      </div>

      {error ? (
        <div className="mb-5">
          <ErrorLine>{error}</ErrorLine>
        </div>
      ) : null}

      {!data && loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-32" />
          <Skeleton className="h-72" />
        </div>
      ) : null}

      {data ? (
        <div
          id="admin-tab-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${tab}`}
          aria-busy={loading || undefined}
          className={cn("transition-opacity duration-150", loading ? "opacity-60" : "opacity-100")}
        >
          {tab === "overview" ? <OverviewTab data={data} onOpenPerson={setPersonId} onShowTab={setTab} /> : null}
          {tab === "people" ? <PeopleTab data={data} onOpenPerson={setPersonId} /> : null}
          {tab === "recipes" ? <RecipesTab data={data} onOpenPerson={setPersonId} /> : null}
          {tab === "costs" ? <CostsTab data={data} onOpenPerson={setPersonId} /> : null}
          {tab === "failures" ? <FailuresTab data={data} onOpenPerson={setPersonId} /> : null}
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">
            Showing {formatDate(data.range.since)} to today
            {data.range.include_admins ? ", including admin accounts" : ", without admin accounts (AI cost still includes them)"}. “Before”
            compares with the {data.range.days} days just before that. Revenue is approximate: catalog prices before store fees and
            tax.
          </p>
        </div>
      ) : null}

      <PersonSheet userId={personId} onClose={() => setPersonId(null)} />
    </>
  );
}
