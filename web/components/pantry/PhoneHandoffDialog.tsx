"use client";

import { CircleCheck, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  closeHandoff,
  createHandoff,
  handoffStatus,
  handoffUrl,
  takeHandoffPhoto,
  type Handoff,
  type HandoffPurpose,
  type HandoffState,
} from "@shared/lib/supabase/pantry";
import type { PantryPlace } from "@shared/types/pantry";

import { QrCode } from "@/components/pantry/QrCode";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";

/** How often the computer asks whether the phone has connected or sent something. */
const POLL_MS = 2000;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: HandoffPurpose;
  language: string;
  /** Pantry: the scan the phone's photos join. */
  scanId?: string;
  place?: PantryPlace;
  /** Snap and Guess: the photo the phone took. The dialog closes itself after. */
  onPhoto?: (photo: { base64: string; mimeType: string }) => void;
  /** Pantry: called on every poll while the phone is connected, to pick up its photos. */
  onTick?: () => void;
  /** Pantry: how many photos have arrived from the phone so far. */
  arrived?: number;
};

/**
 * "Use your phone's camera" (PIN-181): a QR code the phone opens in its browser, with no app and no sign-in, to
 * take photos for this session. The link lasts 15 minutes, works only for this one thing, and is closed when the
 * dialog closes.
 */
export function PhoneHandoffDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <Body {...props} /> : null}
    </Dialog>
  );
}

function Body({ purpose, language, scanId, place, onPhoto, onTick, arrived = 0, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [state, setState] = useState<HandoffState | "creating" | "failed">("creating");
  const current = useRef<Handoff | null>(null);
  const latest = useRef({ onPhoto, onTick });
  useEffect(() => {
    latest.current = { onPhoto, onTick };
  });

  const create = useCallback(async () => {
    setState("creating");
    const made = await createHandoff({ purpose, scanId, place, language });
    if ("status" in made) {
      setState("failed");
      return;
    }
    current.current = made;
    setHandoff(made);
    setState("waiting");
  }, [language, place, purpose, scanId]);

  useEffect(() => {
    // Making the link when the dialog opens is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void create();
    return () => {
      // Closing the dialog closes the link, so a code left on screen can't be used later.
      if (current.current) void closeHandoff(current.current.id);
    };
  }, [create]);

  useEffect(() => {
    if (!handoff || state === "expired" || state === "closed" || state === "failed") return;
    let stopped = false;
    const timer = setInterval(async () => {
      if (Date.parse(handoff.expiresAt) <= Date.now()) {
        setState("expired");
        return;
      }
      const next = await handoffStatus(handoff.id);
      if (stopped || !next) return;
      setState(next);
      if (next === "connected" || next === "photo_ready") latest.current.onTick?.();
      if (next === "photo_ready" && latest.current.onPhoto) {
        const photo = await takeHandoffPhoto(handoff.id);
        if (stopped || !photo) return;
        current.current = null;
        latest.current.onPhoto({ base64: photo.imageBase64, mimeType: photo.mime });
        onOpenChange(false);
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [handoff, onOpenChange, state]);

  const pantry = purpose === "pantry";
  const url = handoff ? handoffUrl(`${window.location.origin}`, handoff.token) : null;
  const expired = state === "expired" || state === "closed";

  return (
    <DialogContent
      title={t("pantry.phone.title")}
      description={t("pantry.phone.scanCode")}
      footer={
        <DialogClose asChild>
          <Button variant={pantry && arrived > 0 ? "primary" : "ghost"} trackId="phone_handoff.done">
            {t(pantry && arrived > 0 ? "pantry.phone.done" : "common.close")}
          </Button>
        </DialogClose>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative grid aspect-square w-full max-w-60 place-items-center rounded-2xl border border-border bg-element p-3">
          {state === "creating" ? <Spinner /> : null}
          {url && !expired && state !== "failed" ? <QrCode value={url} label={t("pantry.phone.scanCode")} className="h-full w-full" /> : null}
          {expired || state === "failed" ? (
            <div className="flex flex-col items-center gap-3 p-4">
              <p className="text-[15px] text-muted">{state === "failed" ? t("pantry.phone.failed") : t("pantry.phone.expired")}</p>
              <Button variant="secondary" size="sm" trackId="phone_handoff.new_code" onClick={() => void create()}>
                <RefreshCw aria-hidden className="h-4 w-4" />
                {t("pantry.phone.newCode")}
              </Button>
            </div>
          ) : null}
        </div>

        <p role="status" aria-live="polite" className="flex min-h-6 items-center gap-2 text-[15px] font-semibold">
          {state === "waiting" ? (
            <>
              <Smartphone aria-hidden className="h-4 w-4 text-muted" />
              <span className="text-muted">{t("pantry.phone.waiting")}</span>
            </>
          ) : null}
          {state === "connected" || state === "photo_ready" ? (
            <>
              <CircleCheck aria-hidden className="h-4 w-4 text-success" />
              <span className="text-success">{t(pantry ? "pantry.phone.connected" : "pantry.phone.connectedOne")}</span>
            </>
          ) : null}
        </p>
        {pantry && arrived > 0 ? <p className="-mt-2 text-sm text-muted">{t("pantry.phone.arrived", { count: arrived })}</p> : null}
        <p className="text-sm text-muted">{t("pantry.phone.noApp")}</p>
      </div>
    </DialogContent>
  );
}
