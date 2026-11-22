"use client";

import { ExternalLink, Info, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH, submitFeedback } from "@shared/lib/supabase/feedback";
import { submitSupportTicket, type SupportTicketCategory } from "@shared/lib/supabase/supportTickets";
import { supportErrorKey } from "@shared/lib/serverErrors";
import { showToast } from "@shared/lib/toast";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { ChoiceGroup, SettingsCard, TextArea, choiceChipClass } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { LEGAL_BASE_URL, LEGAL_URLS, SUPPORT_EMAIL } from "@/lib/legal";
import { webFeedbackContext } from "@/lib/settings/feedbackContext";

const CATEGORIES: SupportTicketCategory[] = ["bug", "billing", "account", "other"];
/** The shortest ticket the server accepts (shared/lib/supabase/supportTickets.ts). */
const TICKET_MIN_LENGTH = 5;
const TICKET_MAX_LENGTH = 4000;

/**
 * Getting help: a support ticket (a person replies by email), feedback, or an email to support. The mobile app
 * opens these as sheets; here they are forms on the page, since there is room for them.
 */
export function SupportSettings() {
  const { t } = useTranslation();
  return (
    <>
      <SettingsPageHeader id="support" />
      <div className="flex flex-col gap-4">
        <SupportTicketForm />
        <FeedbackForm />
        <SettingsCard title={t("settings.emailSupport")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href={LEGAL_URLS.supportMailto} data-track="support.email_support" className={buttonClasses({ variant: "outline", className: "min-w-0 shrink" })}>
              <Mail aria-hidden className="h-4 w-4 shrink-0 text-primary-text" />
              <span dir="ltr" className="truncate">
                {SUPPORT_EMAIL}
              </span>
            </a>
            <a href={LEGAL_BASE_URL} data-track="support.about_pinch" target="_blank" rel="noreferrer" className={buttonClasses({ variant: "outline" })}>
              <Info aria-hidden className="h-4 w-4 text-primary-text" />
              {t("settings.aboutPinch")}
              <ExternalLink aria-hidden className="h-3.5 w-3.5 text-muted rtl:-scale-x-100" />
              <span className="sr-only">({t("web.recipe.opensInNewTab")})</span>
            </a>
          </div>
        </SettingsCard>
      </div>
    </>
  );
}

function SupportTicketForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [category, setCategory] = useState<SupportTicketCategory>("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = message.trim().length >= TICKET_MIN_LENGTH;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitSupportTicket({ category, message, email: user?.email ?? null, context: webFeedbackContext(language) });
      setMessage("");
      setCategory("bug");
      showToast(`${t("support.sentTitle")}. ${t("support.sentBody")}`);
    } catch (err) {
      const limitKey = supportErrorKey(err);
      setError(limitKey ? t(limitKey) : err instanceof Error && err.message ? err.message : t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t("settings.reportIssue")} hint={t("support.hint")}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-text">{t("support.category")}</p>
          <ChoiceGroup
            label={t("support.category")}
            trackId="support_ticket.category"
            value={category}
            onChange={setCategory}
            className="flex flex-wrap gap-2"
            optionClassName={choiceChipClass}
            options={CATEGORIES.map((item) => ({ value: item, label: t(`support.categories.${item}`) }))}
          />
        </div>
        <TextArea
          label={t("support.whatHappened")}
          placeholder={t("support.placeholder")}
          value={message}
          maxLength={TICKET_MAX_LENGTH}
          onChange={(event) => setMessage(event.target.value)}
          disabled={busy}
          hint={user?.email ? t("support.replyTo", { email: user.email }) : undefined}
        />
        {error ? (
          <ErrorAlert>
            <strong className="font-semibold">{t("support.sendFailed")}.</strong> {error}
          </ErrorAlert>
        ) : null}
        <div>
          <Button type="submit" trackId="support_ticket.submit" busy={busy} disabled={!ready}>
            {t("support.submit")}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

function FeedbackForm() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = message.trim().length >= FEEDBACK_MIN_LENGTH;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitFeedback({ message, context: webFeedbackContext(language) });
      setMessage("");
      showToast(`${t("feedback.sentTitle")} ${t("feedback.sentBody")}`);
    } catch (err) {
      const limitKey = supportErrorKey(err);
      setError(limitKey ? t(limitKey) : err instanceof Error && err.message ? err.message : t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t("settings.sendFeedback")} hint={t("feedback.hint")}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextArea
          label={t("feedback.placeholder")}
          value={message}
          maxLength={FEEDBACK_MAX_LENGTH}
          onChange={(event) => setMessage(event.target.value)}
          disabled={busy}
          hint={t("web.settings.feedbackBrowserNote")}
        />
        {error ? (
          <ErrorAlert>
            <strong className="font-semibold">{t("feedback.sendFailed")}.</strong> {error}
          </ErrorAlert>
        ) : null}
        <div>
          <Button type="submit" variant="secondary" trackId="feedback.submit" busy={busy} disabled={!ready}>
            {t("feedback.submit")}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
