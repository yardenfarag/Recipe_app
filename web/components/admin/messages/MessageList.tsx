"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { PRESENTATION_LABELS, STATUS_LABELS, TONE_LABELS, describeTargeting, describeWindow, statusActions } from "@shared/lib/adminMessageForm";
import { errorText } from "@shared/lib/errorText";
import { pickContent, type AdminMessage, type MessageStatus } from "@shared/lib/inAppMessages";
import { deleteAdminMessage, setAdminMessageStatus } from "@shared/lib/supabase/adminMessages";

import { EmptyLine, ErrorLine, Segmented, Skeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

type Filter = "all" | MessageStatus;
const FILTERS: Filter[] = ["all", "live", "scheduled", "draft", "stopped", "ended"];

const STATUS_CLASS: Record<MessageStatus, string> = {
  draft: "border-border text-muted",
  scheduled: "border-primary text-primary-text",
  live: "border-success text-success",
  stopped: "border-warning text-warning",
  ended: "border-border text-muted",
};

export type ListApi = { setStatus: typeof setAdminMessageStatus; remove: typeof deleteAdminMessage };
const DEFAULT_API: ListApi = { setStatus: setAdminMessageStatus, remove: deleteAdminMessage };

type Pending = { kind: "stop" | "delete"; message: AdminMessage } | null;

/** Every message with its status and counts, and Stop, Go live / Resume, Duplicate and Delete. */
export function MessageList({
  messages,
  loading,
  error,
  onNew,
  onEdit,
  onDuplicate,
  onChanged,
  api = DEFAULT_API,
}: {
  messages: AdminMessage[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onEdit: (message: AdminMessage) => void;
  onDuplicate: (message: AdminMessage) => void;
  /** After Stop, Resume or Delete: reload, and say what happened. */
  onChanged: (notice: string) => void;
  api?: ListApi;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  async function run(message: AdminMessage, work: () => Promise<void>, notice: string) {
    setActionError(null);
    setBusyId(message.id);
    try {
      await work();
      onChanged(notice);
    } catch (err) {
      setActionError(errorText(err, "That did not work."));
    } finally {
      setBusyId(null);
    }
  }

  const shown = filter === "all" ? messages : messages.filter((m) => m.status === filter);
  const count = (value: Filter) => (value === "all" ? messages.length : messages.filter((m) => m.status === value).length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Filter by status"
          options={FILTERS.map((value) => ({
            value,
            label: (
              <>
                {value === "all" ? "All" : STATUS_LABELS[value]} <span className="font-normal text-muted">{count(value)}</span>
              </>
            ),
          }))}
          value={filter}
          onChange={setFilter}
          trackPrefix="admin.messages.filter"
        />
        <Button trackId="admin.messages.new" onClick={onNew}>
          <Plus aria-hidden className="h-4 w-4" />
          New message
        </Button>
      </div>

      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {actionError ? <ErrorLine>{actionError}</ErrorLine> : null}

      {loading && messages.length === 0 ? (
        <Skeleton className="h-40" />
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface px-5">
          <EmptyLine>
            {messages.length === 0
              ? "No messages yet. Start with “New message”: pick a preset, write the words, then send it to yourself first."
              : "No messages with this status."}
          </EmptyLine>
        </div>
      ) : (
        <ul className="grid gap-4 @4xl:grid-cols-2">
          {shown.map((message) => {
            const actions = statusActions(message.status);
            const busy = busyId === message.id;
            const english = pickContent(message, "en");
            return (
              <li key={message.id} className="flex min-w-0 flex-col rounded-3xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-base font-bold break-words text-text">{message.name}</h2>
                  <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold", STATUS_CLASS[message.status])}>
                    <span className="sr-only">Status </span>
                    {STATUS_LABELS[message.status]}
                  </span>
                </div>
                {english.title ? <p className="mt-1 truncate text-sm text-text">{english.title}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  {PRESENTATION_LABELS[message.presentation]} · {TONE_LABELS[message.tone]}
                  {message.required ? " · Required" : ""} · Priority {message.priority}
                </p>
                <p className="mt-1 text-xs text-muted">{describeWindow(message.startsAt, message.endsAt)}</p>
                <p className="mt-1 text-xs text-muted">To: {describeTargeting(message.targeting)}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  {(
                    [
                      ["Seen", message.seenCount],
                      ["Dismissed", message.dismissedCount],
                      ["Clicked", message.clickedCount],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-baseline gap-1">
                      <dt>{label}</dt>
                      <dd className="text-sm font-bold text-text tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" trackId="admin.messages.row.edit_button" disabled={busy} aria-label={`Edit ${message.name}`} onClick={() => onEdit(message)}>
                    Edit
                  </Button>
                  {actions.stop ? (
                    <Button size="sm" variant="secondary" trackId="admin.messages.row.stop" busy={busy} onClick={() => setPending({ kind: "stop", message })}>
                      Stop
                    </Button>
                  ) : null}
                  {actions.start ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      trackId="admin.messages.row.start"
                      busy={busy}
                      onClick={() => void run(message, () => api.setStatus(message.id, "live"), `“${message.name}” is live.`)}
                    >
                      {message.status === "draft" ? "Go live" : "Resume"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" trackId="admin.messages.row.duplicate" disabled={busy} onClick={() => onDuplicate(message)}>
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    trackId="admin.messages.row.delete"
                    disabled={busy}
                    onClick={() => setPending({ kind: "delete", message })}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pending?.kind === "stop"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Stop this message?"
        description={pending ? `“${pending.message.name}” disappears for users the next time their app fetches messages. You can resume it later.` : undefined}
        confirmLabel="Stop"
        confirmVariant="primary"
        onConfirm={async () => {
          if (pending) await run(pending.message, () => api.setStatus(pending.message.id, "stopped"), `Stopped “${pending.message.name}”.`);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Delete this message?"
        description={
          pending
            ? `“${pending.message.name}” and its seen, dismissed and clicked records are deleted for good. To keep the counts, stop it instead.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (pending) await run(pending.message, () => api.remove(pending.message.id), `Deleted “${pending.message.name}”.`);
        }}
      />
    </div>
  );
}
