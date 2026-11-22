"use client";

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { formatDate, humanize, rangeLabel, type Dashboard } from "@shared/lib/adminDashboard";
import { platformName } from "@shared/lib/adminDashboardView";

import { Badge, Card, EmptyLine, SearchBox, Segmented, Thumb } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";

export function RecipesTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
  const [platform, setPlatform] = useState<string>("all");
  const [query, setQuery] = useState("");

  const platforms = useMemo(() => ["all", ...data.recipes_by_platform.map((p) => p.label)], [data.recipes_by_platform]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.recent_recipes.filter((r) => {
      if (platform !== "all" && (r.platform || "unknown") !== platform) return false;
      if (!needle) return true;
      return (r.title ?? "").toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle);
    });
  }, [data.recent_recipes, platform, query]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Recipes saved"
        subtitle={`Newest first, from ${rangeLabel(data.range.days)} (up to 150).`}
        actions={<SearchBox label="Search recipes" placeholder="Search title or email" value={query} onChange={setQuery} />}
      >
        <Segmented
          label="Filter by platform"
          options={platforms.map((p) => ({ value: p, label: p === "all" ? "All" : platformName(p) }))}
          value={platform}
          onChange={setPlatform}
          trackPrefix="admin.dashboard.recipes.platform"
        />
      </Card>

      {rows.length === 0 ? (
        <EmptyLine>No recipes match.</EmptyLine>
      ) : (
        <ul className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="flex min-w-0 gap-3 rounded-3xl border border-frosted-border bg-surface p-3 shadow-soft">
              <Thumb src={r.image_url} className="h-24 w-24 rounded-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                <div className="line-clamp-2 font-semibold text-text">{r.title || "Untitled recipe"}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge>{platformName(r.platform)}</Badge>
                  {r.source ? <span>from {humanize(r.source).toLowerCase()}</span> : null}
                  {r.status && r.status !== "full" ? <Badge tone="bad">{humanize(r.status)}</Badge> : null}
                </div>
                <Button
                  variant="link"
                  trackId="admin.dashboard.recipes.person"
                  onClick={() => onOpenPerson(r.user_id)}
                  className="mt-auto -ms-1 block max-w-full truncate text-start text-xs"
                >
                  {r.email ?? "unknown"}
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>{formatDate(r.created_at, true)}</span>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer noopener" data-track="admin.dashboard.recipes.source" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                      Source
                      <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
