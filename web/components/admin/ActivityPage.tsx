"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { formatClock, formatSessionDuration, formatWhen, sessionPlatform, sessionWho } from "@shared/lib/adminFormat";
import { insightSince } from "@shared/lib/adminInsights";
import {
  fetchActivitySessionEvents,
  fetchActivitySessions,
  fetchActivityTop,
  type ActivityEvent,
} from "@shared/lib/supabase/adminActivity";

import { Card, EmptyLine, ErrorLine, SearchBox, Segmented, Skeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

const RANGES = [1, 7, 30] as const;
type Range = (typeof RANGES)[number];

export async function loadActivity(range: Range, search: string) {
  const since = insightSince(range);
  const [sessions, top] = await Promise.all([fetchActivitySessions(since, search), fetchActivityTop(since)]);
  return { sessions, top };
}

/**
 * Every screen view, tap, sign-in and sign-up, grouped by session (`admin_interaction_*`, admins only). Each session
 * shows the platform and app version it was logged with, which tells the new web app apart from the Expo one.
 */
export function ActivityPage({
  load = loadActivity,
  loadEvents = fetchActivitySessionEvents,
}: {
  load?: typeof loadActivity;
  loadEvents?: typeof fetchActivitySessionEvents;
}) {
  const [range, setRange] = useState<Range>(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [openSession, setOpenSession] = useState<string | null>(null);

  // Search runs after typing pauses, not on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(query), 400);
    return () => clearTimeout(handle);
  }, [query]);

  const read = useCallback(() => load(range, search), [load, range, search]);
  const { data, error, loading, reload } = useAdminData(`${range}:${search}`, read, "Could not load activity.");

  return (
    <>
      <PageHeader
        title="Activity"
        tabTitle="Admin activity"
        subtitle="Every screen view, tap, login and signup, grouped by session. Kept until the account is deleted. Only admins can see this."
        actions={
          <Button variant="outline" size="sm" trackId="admin.activity.refresh" onClick={reload} busy={loading && data != null}>
            Refresh
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="Time range"
          options={RANGES.map((days) => ({ value: days, label: days === 1 ? "Today" : `${days} days`, trackName: `${days}d` }))}
          value={range}
          onChange={setRange}
          trackPrefix="admin.activity.range"
        />
        <SearchBox label="Search email, user id or install id" value={query} onChange={setQuery} />
      </div>
      {error ? (
        <div className="mb-5">
          <ErrorLine>{error}</ErrorLine>
        </div>
      ) : null}

      {!data ? (
        loading ? (
          <Skeleton className="h-64" />
        ) : null
      ) : (
        <div className={cn("grid items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_20rem]", loading ? "opacity-60" : "")} aria-busy={loading || undefined}>
          <section aria-labelledby="activity-sessions" className="order-2 flex min-w-0 flex-col gap-3 @4xl:order-1">
            <h2 id="activity-sessions" className="text-base font-bold text-text">
              Sessions ({data.sessions.length})
            </h2>
            {data.sessions.length === 0 ? <EmptyLine>No sessions in this range.</EmptyLine> : null}
            {data.sessions.map((session) => {
              const open = openSession === session.sessionId;
              return (
                <article key={session.sessionId} className="rounded-3xl border border-frosted-border bg-surface p-4 shadow-soft">
                  <Button
                    variant="ghost"
                    trackId="admin.activity.session.toggle"
                    aria-expanded={open}
                    onClick={() => setOpenSession(open ? null : session.sessionId)}
                    className="-m-2 h-auto w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-2xl p-2 text-start font-normal whitespace-normal"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">{sessionWho(session)}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {formatWhen(session.startedAt)} · {formatSessionDuration(session.startedAt, session.lastAt)} ·{" "}
                        <span className="font-semibold text-text">{sessionPlatform(session)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {session.screenCount} screens · {session.tapCount} taps
                      </span>
                      {session.authEvents.length ? (
                        <span className="mt-1 block text-xs font-semibold text-primary">
                          {session.authEvents.map((name) => name.replace("auth.", "")).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                      {open ? "Hide" : "Show"} timeline
                      <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                    </span>
                  </Button>
                  {open ? <SessionTimeline sessionId={session.sessionId} load={loadEvents} /> : null}
                </article>
              );
            })}
          </section>

          <Card title="Most used" className="order-1 @4xl:sticky @4xl:top-6 @4xl:order-2">
            {data.top.length === 0 ? (
              <EmptyLine>Nothing logged in this range yet.</EmptyLine>
            ) : (
              <ul className="flex flex-col">
                {data.top.map((item) => (
                  <li key={`${item.kind}:${item.name}`} className="flex items-baseline justify-between gap-3 py-1 text-xs">
                    <span className="min-w-0 truncate text-text">
                      <span className="me-1 text-muted">{item.kind === "screen" ? "screen" : item.kind === "auth" ? "auth" : "tap"}</span>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {item.count} · {item.people} {item.people === 1 ? "person" : "people"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function SessionTimeline({ sessionId, load }: { sessionId: string; load: typeof fetchActivitySessionEvents }) {
  const read = useCallback(() => load(sessionId), [load, sessionId]);
  const { data: events, error } = useAdminData<ActivityEvent[]>(sessionId, read, "Could not load this session.");

  if (error) return <p className="mt-3 text-xs text-danger">{error}</p>;
  if (!events) return <Spinner className="mt-3" />;
  return (
    <ol className="mt-3 border-t border-border pt-3 font-mono text-xs">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3 py-0.5">
          <span className="w-20 shrink-0 text-muted">{formatClock(event.occurredAt)}</span>
          <span
            className={cn(
              "min-w-0 flex-1 break-words",
              event.kind === "tap" ? "text-text" : event.kind === "auth" ? "font-bold text-warning" : "font-bold text-primary",
            )}
          >
            {event.kind === "screen" ? `→ ${event.name}` : event.kind === "auth" ? `auth ${event.name}` : `   tap ${event.name}`}
            {Object.keys(event.properties).length ? ` ${JSON.stringify(event.properties)}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
