"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useMemo } from "react";

import { formatCount, formatDate, formatUsd, relativeTime, type UserDetail } from "@shared/lib/adminDashboard";
import { buildUserTimeline, platformName, userDetailStats } from "@shared/lib/adminDashboardView";
import { fetchAdminUserDetail } from "@shared/lib/supabase/adminDashboard";

import { Badge, Card, EmptyLine, ErrorLine, Figure, Skeleton, Thumb } from "@/components/admin/ui";
import { Sheet, SheetContent } from "@/components/ui/Sheet";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

/**
 * One person in full: their figures, recipes and everything they did, from `admin_user_detail` (admins only).
 * Opens beside the dashboard; Escape or the close button goes back to where it was opened from.
 */
export function PersonSheet({
  userId,
  onClose,
  load = fetchAdminUserDetail,
}: {
  userId: string | null;
  onClose: () => void;
  load?: (userId: string) => Promise<UserDetail>;
}) {
  return (
    <Sheet open={userId != null} onOpenChange={(open) => !open && onClose()}>
      {userId ? <PersonSheetBody key={userId} userId={userId} load={load} /> : null}
    </Sheet>
  );
}

function PersonSheetBody({ userId, load }: { userId: string; load: (userId: string) => Promise<UserDetail> }) {
  const read = useCallback(() => load(userId), [load, userId]);
  const { data: detail, error, loading } = useAdminData(userId, read, "Could not load this person.");
  const timeline = useMemo(() => (detail ? buildUserTimeline(detail) : []), [detail]);
  const stats = useMemo(() => (detail ? userDetailStats(detail, timeline) : null), [detail, timeline]);

  return (
    <SheetContent
      title={detail?.profile.email ?? (error ? "Person" : "Loading…")}
      description={
        detail && stats
          ? `Joined ${formatDate(detail.profile.created_at, true)} (${relativeTime(detail.profile.created_at)}) · last active ${relativeTime(stats.lastActive)}${detail.profile.is_admin ? " · admin" : ""}`
          : undefined
      }
      className="sm:max-w-2xl"
    >
      <div dir="ltr" lang="en" className="flex flex-col gap-5">
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        {loading && !detail ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-60" />
            <Skeleton className="h-80" />
          </>
        ) : null}
        {detail && stats ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Figure label="Recipes" value={formatCount(detail.recipes.length)} />
              <Figure label="Extractions" value={formatCount(stats.extractions)} />
              <Figure label="Failed" value={formatCount(stats.failures)} />
              <Figure label="AI cost" value={formatUsd(stats.cost)} />
              <Figure label="Credits bought" value={formatCount(stats.bought)} />
              <Figure label="Credit balance" value={formatCount(detail.profile.token_balance)} />
              <Figure label="Free extracts this month" value={formatCount(detail.profile.free_extracts_this_month)} />
              <Figure label="Recipes cooked" value={formatCount(stats.cooked)} />
            </div>
            {detail.profile.is_admin ? (
              <div>
                <Badge>admin</Badge>
              </div>
            ) : null}

            <Card title={`Recipes (${detail.recipes.length})`}>
              {detail.recipes.length === 0 ? <EmptyLine>No saved recipes.</EmptyLine> : null}
              <ul className="flex flex-col gap-2">
                {detail.recipes.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 text-sm">
                    <Thumb src={r.image_url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text">{r.title || "Untitled recipe"}</span>
                      <span className="block text-xs text-muted">
                        {platformName(r.platform)} · {formatDate(r.created_at)}
                        {r.minutes ? ` · ${r.minutes} min` : ""}
                        {r.ingredients ? ` · ${r.ingredients} ingredients` : ""}
                        {r.is_favorite ? " · ♥" : ""}
                        {r.last_cooked_at ? " · cooked" : ""}
                      </span>
                    </span>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer noopener" data-track="admin.dashboard.person.recipe_source" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        Source
                        <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Everything they did" subtitle="Newest first. Grey rows are app events and background checks.">
              {timeline.length === 0 ? <EmptyLine>No activity recorded.</EmptyLine> : null}
              <ul className="flex flex-col">
                {timeline.map((item, i) => (
                  <li key={`${item.when}-${i}`} className="grid grid-cols-[8.5rem_0.5rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-border/60 py-2 text-sm last:border-b-0">
                    <span className="text-xs whitespace-nowrap text-muted">{formatDate(item.when, true)}</span>
                    <span
                      aria-hidden
                      className={cn("mt-1.5 h-2 w-2 rounded-full", item.tone === "bad" ? "bg-danger" : item.tone === "muted" ? "bg-border" : "bg-primary")}
                    />
                    <span className="min-w-0">
                      <span className={item.tone === "muted" ? "text-muted" : item.tone === "bad" ? "text-danger" : "text-text"}>{item.text}</span>
                      {item.detail ? <span className="block text-xs break-words text-muted">{item.detail}</span> : null}
                    </span>
                    <span className="text-xs text-muted tabular-nums">{item.cost ? formatUsd(item.cost, { precise: true }) : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : null}
      </div>
    </SheetContent>
  );
}
