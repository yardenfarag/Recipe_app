"use client";

import { ArrowRight } from "lucide-react";

import type { Dashboard } from "@shared/lib/adminDashboard";
import { buildHints, type DashboardInsights, type HintTab } from "@shared/lib/adminHints";

import { Card, EmptyLine } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const TAB_NAMES: Record<HintTab, string> = {
  overview: "Overview",
  people: "People",
  costs: "Costs",
  failures: "Failures",
};

const TONE_LABEL = { fix: "Fix", watch: "Watch", good: "Better" } as const;

/**
 * PIN-49: what to look at next, from fixed rules over this range's numbers (shared/lib/adminHints.ts). Each hint
 * opens the tab that shows the numbers behind it.
 */
export function HintsCard({
  data,
  insights,
  insightsError,
  onShowTab,
}: {
  data: Dashboard;
  insights: DashboardInsights | null;
  insightsError: string | null;
  onShowTab: (tab: HintTab) => void;
}) {
  const hints = buildHints(data, insights);
  return (
    <Card
      title="What to look at next"
      subtitle="Rules over these numbers: failure rates, cost per extraction, the Jev gate, video share, translations, speed and sign-ups. Each needs at least 10 events before it speaks up."
    >
      {insightsError ? (
        <p className="mb-3 text-sm text-muted">
          Some hints are missing: the per-platform and Jev gate numbers did not load ({insightsError}).
        </p>
      ) : null}
      {hints.length === 0 ? (
        <EmptyLine>Nothing stands out in this period.</EmptyLine>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {hints.map((h) => (
            <li key={h.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <span
                className={cn(
                  "mt-0.5 inline-flex w-16 shrink-0 justify-center rounded-full px-2 py-0.5 text-xs font-bold",
                  h.tone === "fix" ? "bg-danger-soft text-danger" : h.tone === "good" ? "bg-success-soft text-success" : "bg-element text-muted",
                )}
              >
                {TONE_LABEL[h.tone]}
              </span>
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-semibold text-text">{h.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{h.detail}</p>
              </div>
              {h.tab !== "overview" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  trackId={`admin.dashboard.hint.${h.tab}`}
                  onClick={() => onShowTab(h.tab)}
                  className="shrink-0"
                >
                  {TAB_NAMES[h.tab]}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
