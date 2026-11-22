"use client";

import { useCallback, useState } from "react";

import { feedbackMeta, feedbackSender, formatWhen, shortId, usd4 } from "@shared/lib/adminFormat";
import { formatTokens, shortModelName } from "@shared/lib/aiCostSummary";
import { creditHealthWarnings, type CreditHealth } from "@shared/lib/creditHealth";
import { errorText } from "@shared/lib/errorText";
import { ADMIN_PRICE_CARD } from "@shared/lib/quotas";
import { fetchAdminTokenLedger, fetchAdminUsageEvents, fetchCreditHealth, formatUsageAction } from "@shared/lib/supabase/adminUsage";
import { fetchFeedback } from "@shared/lib/supabase/feedback";
import { closeSupportTicket, fetchSupportTickets } from "@shared/lib/supabase/supportTickets";

import { AiCostCard } from "@/components/admin/usage/AiCostCard";
import { CreditGrantCard } from "@/components/admin/usage/CreditGrantCard";
import { Badge, Card, EmptyLine, ErrorLine, InfoRow, Skeleton, TableWrap, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

export type UsageData = {
  events: Awaited<ReturnType<typeof fetchAdminUsageEvents>>;
  ledger: Awaited<ReturnType<typeof fetchAdminTokenLedger>>;
  tickets: Awaited<ReturnType<typeof fetchSupportTickets>>;
  feedback: Awaited<ReturnType<typeof fetchFeedback>>;
  health: CreditHealth | null;
  healthError: string | null;
};

/** Everything on the page but the cost card, read together as the mobile screen does. Credit health may fail alone. */
export async function loadUsage(): Promise<UsageData> {
  let healthError: string | null = null;
  const [events, ledger, tickets, feedback, health] = await Promise.all([
    fetchAdminUsageEvents(120),
    fetchAdminTokenLedger(80),
    fetchSupportTickets(80),
    fetchFeedback(80),
    fetchCreditHealth().catch((err: unknown) => {
      healthError = errorText(err, "Could not load credit health.");
      return null;
    }),
  ]);
  return { events, ledger, tickets, feedback, health, healthError };
}

/** The owner's cost log, credit health, support tickets and feedback, and the credit tool. */
export function UsagePage({ load = loadUsage, closeTicket = closeSupportTicket }: { load?: typeof loadUsage; closeTicket?: typeof closeSupportTicket }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const read = useCallback(() => load(), [load]);
  const { data, error, loading, setData } = useAdminData(`usage:${refreshKey}`, read, "Could not load admin usage.");
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  async function close(id: string) {
    setTicketError(null);
    setClosing(id);
    try {
      await closeTicket(id);
      setData((current) =>
        current ? { ...current, tickets: current.tickets.map((t) => (t.id === id ? { ...t, status: "closed" as const } : t)) } : current,
      );
    } catch (err) {
      setTicketError(`Could not close ticket: ${errorText(err, "Please try again.")}`);
    } finally {
      setClosing(null);
    }
  }

  const openTickets = data?.tickets.filter((t) => t.status === "open").length ?? 0;

  return (
    <>
      <PageHeader
        title="Usage & support"
        tabTitle="Admin usage"
        subtitle="Owner-only cost log, tickets, and recipe-credit tools."
        actions={
          <Button
            variant="outline"
            size="sm"
            trackId="admin.usage.refresh"
            busy={loading && data != null}
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </Button>
        }
      />
      {error ? (
        <div className="mb-5">
          <ErrorLine>{error}</ErrorLine>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 @4xl:grid-cols-2">
          {data ? <CreditHealthCard health={data.health} error={data.healthError} /> : <Skeleton className="h-72" />}
          <div className="flex flex-col gap-5">
            <CreditGrantCard />
            <Card title="Limits & rates">
              <InfoRow label="ScrapeCreators credit" value={usd4(ADMIN_PRICE_CARD.scrapecreatorsUsdPerCredit)} />
              <InfoRow label="Free extracts" value={String(ADMIN_PRICE_CARD.freeExtractLimit)} />
              <InfoRow label="Guest extracts" value={String(ADMIN_PRICE_CARD.guestExtractLimit)} />
            </Card>
          </div>
        </div>

        <AiCostCard refreshKey={refreshKey} />

        {data ? (
          <>
            <div className="grid gap-5 @4xl:grid-cols-2">
              <Card title={`Support tickets (${openTickets} open)`}>
                {ticketError ? (
                  <div className="mb-3">
                    <ErrorLine>{ticketError}</ErrorLine>
                  </div>
                ) : null}
                {data.tickets.length === 0 ? (
                  <EmptyLine>No tickets yet.</EmptyLine>
                ) : (
                  <ul className="flex max-h-[36rem] flex-col overflow-y-auto">
                    {data.tickets.map((ticket) => (
                      <li key={ticket.id} className="border-b border-border/60 py-3 first:pt-0 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge tone={ticket.status === "open" ? "bad" : undefined}>{ticket.status.toUpperCase()}</Badge>
                          <span className="font-semibold text-text">{ticket.category}</span>
                          <span className="text-muted">{formatWhen(ticket.created_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {ticket.email ?? shortId(ticket.user_id)} · {shortId(ticket.id)}
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-text">{ticket.message}</p>
                        {ticket.status === "open" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-2"
                            trackId="admin.usage.ticket.close"
                            busy={closing === ticket.id}
                            onClick={() => void close(ticket.id)}
                          >
                            Mark closed
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title={`Feedback (${data.feedback.length})`}>
                {data.feedback.length === 0 ? (
                  <EmptyLine>No feedback yet.</EmptyLine>
                ) : (
                  <ul className="flex max-h-[36rem] flex-col overflow-y-auto">
                    {data.feedback.map((item) => (
                      <li key={item.id} className="border-b border-border/60 py-3 first:pt-0 last:border-b-0">
                        <div className="text-xs font-semibold text-text">
                          {feedbackSender(item)} · <span className="font-normal text-muted">{formatWhen(item.created_at)}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted">{feedbackMeta(item)}</div>
                        <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-text">{item.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card title="AI usage log" subtitle={`The newest ${data.events.length} AI calls.`}>
              <LogTable
                header={["When", "Action", "Status", "Model", "In", "Out", "Plat", "Src", "Model$", "SC$", "Tot$", "ms"]}
                numeric={[4, 5, 8, 9, 10, 11]}
                rows={data.events.map((event) => [
                  formatWhen(event.created_at),
                  formatUsageAction(event.action),
                  event.status,
                  event.model ? shortModelName(event.model) : "—",
                  formatTokens(event.prompt_tokens || 0),
                  formatTokens((event.output_tokens || 0) + (event.thinking_tokens || 0)),
                  event.platform ?? "—",
                  event.extraction_source ?? "—",
                  usd4(Number(event.gemini_cost_usd) || 0),
                  usd4(Number(event.scrapecreators_cost_usd) || 0),
                  usd4(Number(event.total_cost_usd) || 0),
                  event.duration_ms != null ? String(event.duration_ms) : "—",
                ])}
              />
            </Card>

            <Card title="Token ledger (legacy)">
              <LogTable
                header={["When", "User", "Δ", "After", "Reason", "Ref"]}
                numeric={[2, 3]}
                rows={data.ledger.map((row) => [
                  formatWhen(row.created_at),
                  shortId(row.user_id),
                  String(row.delta),
                  String(row.balance_after),
                  row.reason,
                  row.ref_id ? shortId(row.ref_id) : "—",
                ])}
              />
            </Card>
          </>
        ) : loading ? (
          <Skeleton className="h-72" />
        ) : null}
      </div>
    </>
  );
}

function CreditHealthCard({ health, error }: { health: CreditHealth | null; error: string | null }) {
  if (!health) {
    return (
      <Card title="Credits health">
        {error ? <ErrorLine>{error}</ErrorLine> : <EmptyLine>No report yet.</EmptyLine>}
      </Card>
    );
  }
  const warnings = creditHealthWarnings(health);
  const { purchases, reservations, webhook, refundJob, extraction } = health;
  const pct = (n: number) => (extraction.count7d ? `${Math.round((n / extraction.count7d) * 100)}%` : "—");
  return (
    <Card title="Credits health">
      {warnings.length === 0 ? (
        <p className="mb-3 text-sm font-semibold text-success">All clear.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {warnings.map((warning) => (
            <li key={warning} className="text-sm font-semibold text-danger">
              {warning}
            </li>
          ))}
        </ul>
      )}
      <InfoRow label="Purchases (24h / 7d)" value={`${purchases.last24h} / ${purchases.last7d}`} />
      <InfoRow label="Credits sold (7d)" value={String(purchases.credits7d)} />
      {purchases.byStore7d.map((row) => (
        <InfoRow key={`${row.store}-${row.environment}`} label={`· ${row.store} · ${row.environment}`} value={String(row.count)} />
      ))}
      <InfoRow label="Last purchase" value={purchases.lastAt ? formatWhen(purchases.lastAt) : "—"} />
      <InfoRow label="Stuck / awaiting refund" value={`${reservations.stuck} / ${reservations.pendingCompensation}`} />
      <InfoRow label="Refunded (24h)" value={String(reservations.refunded24h)} />
      <InfoRow label="Refund job last run" value={refundJob.lastRunAt ? `${formatWhen(refundJob.lastRunAt)} · ${refundJob.lastStatus ?? "?"}` : "—"} />
      <InfoRow label="Webhook failures (24h / 7d / unresolved)" value={`${webhook.failures24h} / ${webhook.failures7d} / ${webhook.unresolved7d}`} />
      {webhook.lastFailureAt ? (
        <InfoRow label="Last webhook failure" value={`${formatWhen(webhook.lastFailureAt)} · ${webhook.lastFailureReason ?? "?"}`} />
      ) : null}
      <InfoRow label="Extractions (7d)" value={String(extraction.count7d)} />
      <InfoRow label="Failed (7d)" value={pct(extraction.failed7d)} />
      <InfoRow label="Video fallback (7d)" value={pct(extraction.video7d)} />
      <InfoRow label="p95 cost (7d)" value={usd4(extraction.p95CostUsd7d)} />
    </Card>
  );
}

/** A dense log table. The `numeric` columns are aligned to the end. */
function LogTable({ header, rows, numeric = [] }: { header: string[]; rows: string[][]; numeric?: number[] }) {
  if (rows.length === 0) return <EmptyLine>Nothing yet.</EmptyLine>;
  const isNum = (i: number) => numeric.includes(i);
  return (
    <TableWrap>
      <table className={cn(tableClass, "text-xs")}>
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={cell} scope="col" className={cn(thClass, isNum(i) && "text-end")}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, i) => (
                <td key={i} className={cn(tdClass, "py-1.5", i === 0 ? "whitespace-nowrap" : "break-words", isNum(i) && "text-end tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
