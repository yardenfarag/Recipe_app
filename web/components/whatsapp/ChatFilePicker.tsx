"use client";

import { FileUp, ImagePlus, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ErrorAlert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";

/** What WhatsApp's Export chat makes: the chat as .txt, or a .zip with the photos too. */
export const CHAT_FILE_ACCEPT = ".txt,.zip,text/plain,application/zip,application/x-zip-compressed";

/** A step's number and title. */
function StepHeading({ number, id, children }: { number: number; id: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-bold text-on-primary">
        {number}
      </span>
      <h2 id={id} className="min-w-0 text-[22px] leading-tight font-bold text-balance text-text">
        {children}
      </h2>
    </div>
  );
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-element text-primary-text [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon}
      </span>
      <span className="min-w-0 pt-1.5 text-[15px] leading-relaxed text-text">{children}</span>
    </li>
  );
}

/**
 * The start: how to export a chat from WhatsApp, and where to bring the file (picked, or dropped on the box).
 * The privacy line sits by the box: the chat is read here, in the browser.
 */
export function ChatFilePicker({ onFile, reading, error }: { onFile: (file: File) => void; reading: boolean; error: string | null }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (reading) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
      <Tile as="section" aria-labelledby="whatsapp-howto-heading" className="p-5 md:p-6">
        <StepHeading number={1} id="whatsapp-howto-heading">
          {t("whatsappImport.howToTitle")}
        </StepHeading>
        <ol className="mt-5 flex flex-col gap-4">
          <Step icon={<Smartphone />}>{t("whatsappImport.howToIphone")}</Step>
          <Step icon={<Smartphone />}>{t("whatsappImport.howToAndroid")}</Step>
          <Step icon={<ImagePlus />}>{t("whatsappImport.howToMedia")}</Step>
          <Step icon={<Mail />}>{t("whatsappImport.howToWeb")}</Step>
        </ol>
      </Tile>

      <Tile as="section" aria-labelledby="whatsapp-file-heading" className="flex flex-col p-5 md:p-6">
        <StepHeading number={2} id="whatsapp-file-heading">
          {t("whatsappImport.chooseFile")}
        </StepHeading>
        <div
          className="mt-5 flex flex-1 flex-col"
          onDragEnter={(event) => {
            event.preventDefault();
            if (!reading) setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <button
            type="button"
            data-track="whatsapp_import.choose_file"
            disabled={reading}
            aria-labelledby="whatsapp-file-heading"
            aria-describedby="whatsapp-privacy"
            onClick={() => input.current?.click()}
            className={cn(
              "group flex min-h-48 w-full flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors",
              dragging ? "border-primary bg-selected" : "border-border bg-element hover:border-primary active:bg-selected",
              "disabled:cursor-progress",
            )}
          >
            {reading ? (
              <Spinner label={t("whatsappImport.reading")} />
            ) : (
              <>
                <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface text-primary-text transition-transform group-hover:scale-105">
                  <FileUp className="h-7 w-7" />
                </span>
                <span aria-hidden className="block font-display text-lg font-bold text-text" dir="ltr">
                  .txt · .zip
                </span>
              </>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept={CHAT_FILE_ACCEPT}
            hidden
            tabIndex={-1}
            aria-hidden
            data-testid="whatsapp-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so choosing the same file again still counts as a change.
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
        </div>
        {error ? (
          <div className="mt-4">
            <ErrorAlert>{error}</ErrorAlert>
          </div>
        ) : null}
        <p id="whatsapp-privacy" className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          {t("whatsappImport.privacyNote")}
        </p>
      </Tile>
    </div>
  );
}
