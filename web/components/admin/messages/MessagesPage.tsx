"use client";

import { ArrowLeft, CircleCheck } from "lucide-react";
import { useState } from "react";

import { duplicateForm, emptyForm, formFromMessage, type MessageForm } from "@shared/lib/adminMessageForm";
import type { MessageStatus } from "@shared/lib/inAppMessages";
import { listAdminMessages } from "@shared/lib/supabase/adminMessages";

import { MessageComposer } from "@/components/admin/messages/MessageComposer";
import { MessageList } from "@/components/admin/messages/MessageList";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAdminData } from "@/lib/admin/useAdminData";

type Editing = { key: number; form: MessageForm; status: MessageStatus | null };

/** In-app messages: the list, and the composer to write, preview and send one. */
export function MessagesPage({ load = listAdminMessages }: { load?: typeof listAdminMessages }) {
  const { data, error, loading, reload } = useAdminData("messages", load, "Could not load messages.");
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const open = (form: MessageForm, status: MessageStatus | null) => {
    setNotice(null);
    setEditing({ key: Date.now(), form, status });
    window.scrollTo?.({ top: 0 });
  };

  const done = (text: string) => {
    setNotice(text);
    setEditing(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title={editing ? (editing.form.id ? "Edit message" : "New message") : "Messages"}
        tabTitle="Admin messages"
        subtitle="Popups, announcements and update prompts shown inside the app to signed-in users. Only admins can see this."
      />

      {notice ? (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <CircleCheck aria-hidden className="h-4 w-4 shrink-0" />
          {notice}
        </p>
      ) : null}

      {editing ? (
        <>
          <div className="mb-4">
            <Button variant="ghost" size="sm" className="-ms-2" trackId="admin.messages.back" onClick={() => setEditing(null)}>
              <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
              All messages
            </Button>
          </div>
          <MessageComposer
            key={editing.key}
            initial={editing.form}
            initialStatus={editing.status}
            onCancel={() => setEditing(null)}
            onDone={done}
          />
        </>
      ) : (
        <MessageList
          messages={data ?? []}
          loading={loading}
          error={error}
          onNew={() => open(emptyForm(), null)}
          onEdit={(message) => open(formFromMessage(message), message.status)}
          onDuplicate={(message) => open(duplicateForm(formFromMessage(message)), null)}
          onChanged={(text) => {
            setNotice(text);
            reload();
          }}
        />
      )}
    </>
  );
}
