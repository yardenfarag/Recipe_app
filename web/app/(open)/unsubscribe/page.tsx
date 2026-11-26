"use client";

import { BellOff, MailCheck, MailX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isAppLanguageCode } from "@shared/lib/appLanguages";
import {
  readUnsubscribeLink,
  setEmailOptOutFromLink,
  type UnsubscribeLink,
  type UnsubscribeResult,
} from "@shared/lib/supabase/emailPreferences";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { Button, buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";

type State = "working" | "unsubscribed" | "resubscribed" | "invalid" | "failed";

function outcome(optOut: boolean, result: UnsubscribeResult): State {
  if (result === "ok") return optOut ? "unsubscribed" : "resubscribed";
  return result === "invalid_link" ? "invalid" : "failed";
}

/**
 * Where the unsubscribe link in every tips or reminder email lands (PIN-189): /unsubscribe?u=<account>&t=<token>&l=<lang>.
 * No sign-in. Opening it turns non-essential email off at once, says what that covers, and offers to turn it back
 * on. It runs in the browser, so a link scanner that only fetches the address changes nothing. The switch is the
 * same one Settings shows (profiles.email_opt_out).
 */
export default function UnsubscribePage() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const { user, loading } = useAuth();
  const { language, setLanguage, ready } = useLanguage();
  const link = readUnsubscribeLink(params);
  const [state, setState] = useState<State>(link ? "working" : "invalid");
  const started = useRef(false);
  // What the last request asked for, so "Try again" repeats it.
  const lastOptOut = useRef(true);

  function apply(target: UnsubscribeLink, optOut: boolean) {
    lastOptOut.current = optOut;
    setState("working");
    void setEmailOptOutFromLink(target, optOut).then((result) => setState(outcome(optOut, result)));
  }

  useEffect(() => {
    // Once, also under React's double effects in development.
    if (started.current) return;
    started.current = true;
    const target = readUnsubscribeLink(params);
    if (target) void setEmailOptOutFromLink(target, true).then((result) => setState(outcome(true, result)));
  }, [params]);

  // A guest reads the page in the email's language. A signed-in account already has its own.
  const emailLanguage = params.get("l") ?? "";
  useEffect(() => {
    if (loading || !ready || user || !isAppLanguageCode(emailLanguage) || emailLanguage === language) return;
    setLanguage(emailLanguage);
  }, [loading, ready, user, emailLanguage, language, setLanguage]);

  if (state === "working") {
    return (
      <div className="mx-auto w-full max-w-xl">
        <PageHeader title={t("messages.unsubscribePageTitle")} />
        <LoadingState label={t("messages.unsubscribing")} />
      </div>
    );
  }

  const view = {
    unsubscribed: { icon: MailX, title: t("messages.unsubscribedTitle"), body: t("messages.unsubscribedBody") },
    resubscribed: { icon: MailCheck, title: t("messages.resubscribedTitle"), body: t("messages.resubscribedBody") },
    invalid: { icon: BellOff, title: t("messages.invalidTitle"), body: t("messages.invalidBody") },
    failed: { icon: BellOff, title: t("messages.failedTitle"), body: t("messages.failedBody") },
  }[state];
  const Icon = view.icon;

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title={view.title} tabTitle={t("messages.unsubscribePageTitle")} />
      <Tile as="section" className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-text">
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1" role="status">
            <p className="text-[15px] leading-relaxed text-pretty text-text">{view.body}</p>
            {state === "unsubscribed" || state === "resubscribed" ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{t("messages.changeInSettings")}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {link && state === "unsubscribed" ? (
            <Button variant="secondary" trackId="unsubscribe.resubscribe" onClick={() => apply(link, false)}>
              {t("messages.resubscribe")}
            </Button>
          ) : null}
          {link && state === "resubscribed" ? (
            <Button variant="outline" trackId="unsubscribe.again" onClick={() => apply(link, true)}>
              {t("messages.unsubscribeAgain")}
            </Button>
          ) : null}
          {link && state === "failed" ? (
            <Button trackId="unsubscribe.retry" onClick={() => apply(link, lastOptOut.current)}>
              {t("common.tryAgainAction")}
            </Button>
          ) : null}
          <Link href="/settings/emails" data-track="unsubscribe.settings" className={buttonClasses({ variant: "ghost" })}>
            {t("messages.openSettings")}
          </Link>
        </div>
      </Tile>
    </div>
  );
}
