"use client";

import { useState } from "react";

import { MESSAGE_LANGUAGES, PRESENTATION_LABELS } from "@shared/lib/adminMessageForm";
import { normalizeLanguage, resolveContentLanguage, type AdminMessageDraft } from "@shared/lib/inAppMessages";

import { InAppMessagePreview } from "@/components/inAppMessages/InAppMessagePreview";
import { Section } from "@/components/admin/messages/fields";
import { Segmented } from "@/components/admin/ui";
import { previewMessage } from "@/lib/admin/messagePreview";
import { cn } from "@/lib/cn";

/**
 * The message as the new web app draws it, in a chosen language, and which language a user in that language
 * actually gets when there is no text for theirs.
 */
export function MessagePreviewCard({ draft }: { draft: AdminMessageDraft }) {
  const [language, setLanguage] = useState<string>("en");
  const resolved = resolveContentLanguage(draft, language);
  const fellBack = normalizeLanguage(language) !== resolved;
  const languageLabel = MESSAGE_LANGUAGES.find((l) => l.code === language)?.label ?? language;
  const resolvedLabel = MESSAGE_LANGUAGES.find((l) => l.code === resolved)?.label ?? resolved;
  const rtl = resolved === "he" || resolved === "ar";
  const closable = draft.dismissible && !draft.required;

  return (
    <Section title="Preview" hint="As the web app shows it. The phone apps draw their own version of the same message.">
      <Segmented
        label="Preview language"
        options={MESSAGE_LANGUAGES.map((l) => ({ value: l.code as string, label: l.code.toUpperCase() }))}
        value={language}
        onChange={setLanguage}
        trackPrefix="admin.messages.preview.lang"
      />
      <p className="text-xs font-semibold text-muted">
        {PRESENTATION_LABELS[draft.presentation]}
        {draft.presentation === "banner" ? `, ${draft.bannerPosition ?? "top"}` : ""}
        {draft.required ? ", required (cannot be closed)" : closable ? "" : ", cannot be closed"}
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-bg p-3" data-testid="message-preview">
        <InAppMessagePreview message={previewMessage(draft)} language={language} />
      </div>
      <p className={cn("text-xs", fellBack ? "font-semibold text-warning" : "text-muted")}>
        {fellBack
          ? `No ${languageLabel} text yet: a user in ${languageLabel} sees ${resolvedLabel}.`
          : rtl
            ? `${resolvedLabel} reads right-to-left.`
            : `${resolvedLabel} reads left-to-right.`}
      </p>
    </Section>
  );
}
