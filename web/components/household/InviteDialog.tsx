"use client";

import { Copy, Link2Off, MessageCircle, RefreshCw, Share2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { isHouseholdFull } from "@shared/lib/household";
import { getHouseholdInvite, householdInviteUrl, renewHouseholdInvite, stopHouseholdInvite } from "@shared/lib/supabase/household";
import { showToast } from "@shared/lib/toast";
import { HOUSEHOLD_MAX_MEMBERS, type Household, type HouseholdInvite } from "@shared/types/household";

import { QrCode } from "@/components/pantry/QrCode";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/States";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { formatDayTime, householdErrorText } from "@/lib/household/householdText";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: Household;
  /** "Later" instead of "Done", right after the household was set up. */
  justCreated?: boolean;
};

/**
 * Invite the people you live with (ADR 034): the household's one live link, to send on WhatsApp, share, copy, or
 * scan from this screen. The link is made when the dialog opens if there is none, works for a week, and can be
 * replaced or stopped. A full household shows that instead.
 */
export function InviteDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <Body {...props} /> : null}
    </Dialog>
  );
}

type LinkState = { status: "loading" } | { status: "ready"; invite: HouseholdInvite } | { status: "failed" } | { status: "stopped" };

function isLive(invite: HouseholdInvite | null): invite is HouseholdInvite {
  return Boolean(invite && Date.parse(invite.expiresAt) > Date.now());
}

function Body({ household, justCreated = false }: Props) {
  const { t, i18n } = useTranslation();
  const { patch } = useHousehold();
  const full = isHouseholdFull(household);
  const [link, setLink] = useState<LinkState>(() => (isLive(household.invite) ? { status: "ready", invite: household.invite } : { status: "loading" }));
  const [confirm, setConfirm] = useState<"renew" | "stop" | null>(null);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  const keep = useCallback(
    (invite: HouseholdInvite | null) => {
      patch((current) => ({ ...current, invite }));
      setLink(invite ? { status: "ready", invite } : { status: "stopped" });
    },
    [patch],
  );

  const make = useCallback(
    async (fresh: boolean) => {
      setLink({ status: "loading" });
      try {
        keep(await (fresh ? renewHouseholdInvite() : getHouseholdInvite()));
      } catch {
        setLink({ status: "failed" });
      }
    },
    [keep],
  );

  useEffect(() => {
    // Making the link when the dialog opens, if there isn't a live one, is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!full && link.status === "loading") void make(false);
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = household.name ?? "";
  const url = link.status === "ready" ? householdInviteUrl(window.location.origin, link.invite.token) : null;
  const shareText = url ? t("household.invite.shareText", { name, url }) : "";

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("household.invite.copied"));
    } catch {
      showToast(t("household.invite.copyFailed"), "error");
    }
  }

  async function share() {
    if (!url) return;
    try {
      await navigator.share({ title: t("household.invite.shareTitle", { name }), text: t("household.invite.shareText", { name, url: "" }).trim(), url });
    } catch {
      // Closed the share sheet, or the browser refused: nothing to say.
    }
  }

  return (
    <>
      <DialogContent
        title={t("household.invite.title")}
        description={full ? undefined : t("household.invite.body")}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        footer={
          <>
            {link.status === "ready" && !full ? (
              <div className="flex flex-wrap gap-1 sm:me-auto">
                <Button variant="ghost" size="sm" trackId="household.invite.new_link" onClick={() => setConfirm("renew")}>
                  <RefreshCw aria-hidden className="h-4 w-4" />
                  {t("household.invite.newLink")}
                </Button>
                <Button variant="ghost" size="sm" trackId="household.invite.stop" className="text-danger" onClick={() => setConfirm("stop")}>
                  <Link2Off aria-hidden className="h-4 w-4" />
                  {t("household.invite.stop")}
                </Button>
              </div>
            ) : null}
            <DialogClose asChild>
              <Button variant={justCreated && link.status !== "ready" ? "ghost" : "primary"} trackId="household.invite.done">
                {t(justCreated ? "household.invite.later" : "household.invite.done")}
              </Button>
            </DialogClose>
          </>
        }
      >
        {full ? (
          <p role="status" className="flex items-start gap-3 rounded-2xl bg-element px-4 py-3 text-[15px] text-text">
            <Users aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            {t("household.invite.full", { count: HOUSEHOLD_MAX_MEMBERS })}
          </p>
        ) : link.status === "loading" ? (
          <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 text-[15px] text-muted">
            <Spinner />
            {t("household.invite.loading")}
          </div>
        ) : link.status === "failed" ? (
          <ErrorState body={t("household.invite.failed")} trackId="household.invite.load_error" onRetry={() => void make(false)} className="py-8" />
        ) : link.status === "stopped" ? (
          <div className="flex flex-col items-start gap-4">
            <p role="status" className="text-[15px] leading-relaxed text-muted">
              {t("household.invite.stoppedBody")}
            </p>
            <Button variant="secondary" trackId="household.invite.make_again" onClick={() => void make(false)}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              {t("household.invite.newLink")}
            </Button>
          </div>
        ) : url ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                data-track="household.invite.whatsapp"
                className={buttonClasses({ variant: "primary", fullWidth: true })}
              >
                <MessageCircle aria-hidden className="h-5 w-5" />
                {t("household.invite.whatsapp")}
              </a>
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                {canShare ? (
                  <Button variant="outline" trackId="household.invite.share" onClick={() => void share()}>
                    <Share2 aria-hidden className="h-[18px] w-[18px]" />
                    {t("household.invite.share")}
                  </Button>
                ) : null}
                <Button variant="outline" trackId="household.invite.copy" onClick={() => void copy()} className={canShare ? undefined : "min-[380px]:col-span-2"}>
                  <Copy aria-hidden className="h-[18px] w-[18px]" />
                  {t("household.invite.copy")}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="household-invite-link" className="text-sm font-semibold text-text">
                {t("household.invite.linkLabel")}
              </label>
              <input
                id="household-invite-link"
                readOnly
                value={url}
                dir="ltr"
                aria-describedby="household-invite-expires"
                onFocus={(event) => event.currentTarget.select()}
                className="h-11 w-full min-w-0 truncate rounded-btn border border-border bg-element px-3 text-sm text-text"
              />
              <p id="household-invite-expires" className="text-sm text-muted">
                {t("household.invite.expires", { date: formatDayTime(link.invite.expiresAt, i18n.language) })}
              </p>
            </div>

            <div className="flex items-center gap-4 rounded-2xl bg-element p-3">
              <QrCode value={url} label={t("household.invite.qrHint")} className="h-28 w-28 shrink-0 rounded-lg sm:h-32 sm:w-32" />
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-text">{t("household.invite.qrTitle")}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t("household.invite.qrHint")}</p>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>

      <ConfirmDialog
        open={confirm === "renew"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("household.invite.newLinkTitle")}
        description={t("household.invite.newLinkBody")}
        confirmLabel={t("household.invite.newLinkConfirm")}
        confirmVariant="primary"
        trackId="household.invite.new_link_dialog"
        onConfirm={async () => {
          try {
            keep(await renewHouseholdInvite());
          } catch (caught) {
            showToast(householdErrorText(caught, t, "household.invite.failed"), "error");
          }
        }}
      />
      <ConfirmDialog
        open={confirm === "stop"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("household.invite.stopTitle")}
        description={t("household.invite.stopBody")}
        confirmLabel={t("household.invite.stopConfirm")}
        trackId="household.invite.stop_dialog"
        onConfirm={async () => {
          try {
            await stopHouseholdInvite();
            keep(null);
            showToast(t("household.invite.stopped"));
          } catch (caught) {
            showToast(householdErrorText(caught, t), "error");
          }
        }}
      />
    </>
  );
}
