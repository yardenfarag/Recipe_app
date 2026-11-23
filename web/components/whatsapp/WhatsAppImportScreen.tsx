"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  findRecipeCandidates,
  MAX_CHAT_FILE_BYTES,
  readChatExport,
  runImportBatch,
  WhatsAppImportError,
  type BatchProgress,
  type ChatExport,
  type RecipeCandidate,
} from "@shared/lib/whatsappImport";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChatFilePicker } from "@/components/whatsapp/ChatFilePicker";
import { ImportDone, ImportProgress, startingProgress } from "@/components/whatsapp/ImportProgress";
import { ImportSummary, NotEnoughCredits, ReviewList, shortOfCredits } from "@/components/whatsapp/ReviewList";
import { refreshCredits, useCreditBalance } from "@/lib/credits/balance";
import { createChatImporter } from "@/lib/whatsapp/importCandidate";
import { fetchSavedSourceUrls, readImportedIds, rememberImportedIds } from "@/lib/whatsapp/importedIds";

/** Two at a time, as on mobile: quick enough, and gentle on the import service. */
const CONCURRENCY = 2;

type Stage =
  | { step: "pick"; reading: boolean; error: string | null }
  | { step: "review" }
  | { step: "importing"; batch: RecipeCandidate[]; progress: BatchProgress; stopping: boolean }
  | { step: "done"; batch: RecipeCandidate[]; progress: BatchProgress; dailyLimit: boolean };

const ERROR_KEYS = {
  not_a_chat: "whatsappImport.errorNotAChat",
  too_big: "whatsappImport.errorTooBig",
  empty: "whatsappImport.errorEmpty",
} as const;

/** Lets the "Reading the chat…" spinner show before the (synchronous) read starts. */
const nextPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

/**
 * Import recipes from a WhatsApp chat export (ADR 032). The chat is read here in the browser; only the items the
 * cook ticks are sent, each through the same import and auto-save as Snap (lib/whatsapp/importCandidate.ts), one
 * credit each, two at a time, stopping when the credits run out.
 */
export function WhatsAppImportScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { quota } = useCreditBalance();
  const [stage, setStage] = useState<Stage>({ step: "pick", reading: false, error: null });
  const [chat, setChat] = useState<ChatExport | null>(null);
  const [candidates, setCandidates] = useState<RecipeCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** The Library's source links, asked for as the page opens so they are ready by the time a chat is read. */
  const savedUrls = useRef<Promise<string[]> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const importing = stage.step === "importing";

  useEffect(() => {
    mounted.current = true;
    savedUrls.current ??= fetchSavedSourceUrls();
    return () => {
      mounted.current = false;
      // Leaving the page stops the import: nothing new starts once the page is gone.
      abort.current?.abort();
    };
  }, []);

  // Closing the tab mid-import: the browser asks first.
  useEffect(() => {
    if (!importing) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [importing]);

  const readFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_CHAT_FILE_BYTES) {
        setStage({ step: "pick", reading: false, error: t(ERROR_KEYS.too_big) });
        return;
      }
      setStage({ step: "pick", reading: true, error: null });
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await nextPaint();
        const read = readChatExport({ name: file.name, bytes });
        const savedSourceUrls = await (savedUrls.current ?? fetchSavedSourceUrls());
        const found = findRecipeCandidates(read, { savedSourceUrls, importedIds: readImportedIds() });
        if (found.length === 0) throw new WhatsAppImportError("empty");
        if (!mounted.current) return;
        setChat(read);
        setCandidates(found);
        setSelected(new Set(found.filter((candidate) => candidate.likelyRecipe && !candidate.alreadySaved).map((candidate) => candidate.id)));
        setStage({ step: "review" });
      } catch (error) {
        if (!mounted.current) return;
        const key = error instanceof WhatsAppImportError ? ERROR_KEYS[error.code] : "whatsappImport.errorRead";
        setStage({ step: "pick", reading: false, error: t(key) });
      }
    },
    [t],
  );

  const startImport = useCallback(
    (batch: RecipeCandidate[]) => {
      if (!chat || batch.length === 0 || abort.current) return;
      const controller = new AbortController();
      abort.current = controller;
      let latest = startingProgress(batch);
      let dailyLimit = false;
      setStage({ step: "importing", batch, progress: latest, stopping: false });
      // The progress starts at the top of the page; the button may have been far down the list.
      if (window.scrollY > 0) window.scrollTo({ top: 0 });

      const finish = (final: BatchProgress) => {
        abort.current = null;
        const imported = batch
          .filter((candidate) => final.items[candidate.id] === "saved" || final.items[candidate.id] === "already_saved")
          .map((candidate) => candidate.id);
        rememberImportedIds(imported);
        refreshCredits();
        // The Library changed: read its links again for the next chat.
        savedUrls.current = fetchSavedSourceUrls();
        if (!mounted.current) return;
        const done = new Set(imported);
        setCandidates((previous) => previous.map((candidate) => (done.has(candidate.id) ? { ...candidate, alreadySaved: true } : candidate)));
        setSelected((previous) => new Set([...previous].filter((id) => !done.has(id))));
        setStage({ step: "done", batch, progress: final, dailyLimit });
      };

      const importOne = createChatImporter({
        chat,
        userId: user?.id ?? null,
        onDailyLimit: () => {
          dailyLimit = true;
        },
      });
      runImportBatch(batch, importOne, {
        concurrency: CONCURRENCY,
        signal: controller.signal,
        onProgress: (progress) => {
          latest = progress;
          if (mounted.current) setStage((current) => (current.step === "importing" ? { ...current, progress } : current));
        },
      })
        .then(finish)
        // It never throws by contract; if it did, what was reported so far stands, and the rest stays on the list.
        .catch(() => finish({ ...latest, cancelled: true }));
    },
    [chat, user?.id],
  );

  const chooseAnother = useCallback(() => {
    setChat(null);
    setCandidates([]);
    setSelected(new Set());
    setStage({ step: "pick", reading: false, error: null });
  }, []);

  const balance = quota?.totalCredits ?? null;
  const ticked = candidates.filter((candidate) => selected.has(candidate.id) && !candidate.alreadySaved);

  return (
    <>
      <PageHeader
        title={t("whatsappImport.entryTitle")}
        subtitle={t("whatsappImport.entryBody")}
        actions={
          stage.step === "review" ? (
            <Button variant="ghost" size="sm" trackId="whatsapp_import.choose_another" onClick={chooseAnother}>
              {t("whatsappImport.chooseAnother")}
            </Button>
          ) : null
        }
      />

      {stage.step === "pick" || !chat ? (
        <ChatFilePicker onFile={(file) => void readFile(file)} reading={stage.step === "pick" && stage.reading} error={stage.step === "pick" ? stage.error : null} />
      ) : stage.step === "review" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <div className="min-w-0">
            {shortOfCredits(ticked.length, balance) ? <NotEnoughCredits className="mb-4 lg:hidden" /> : null}
            <ReviewList candidates={candidates} chat={chat} selected={selected} onSelectedChange={setSelected} />
            <ImportSummary variant="bar" className="lg:hidden" count={ticked.length} balance={balance} onImport={() => startImport(ticked)} />
          </div>
          <aside className="hidden lg:sticky lg:top-7 lg:block">
            <ImportSummary variant="panel" count={ticked.length} balance={balance} onImport={() => startImport(ticked)} />
          </aside>
        </div>
      ) : stage.step === "importing" ? (
        <ImportProgress
          candidates={stage.batch}
          chat={chat}
          progress={stage.progress}
          stopping={stage.stopping}
          onStop={() => {
            abort.current?.abort();
            setStage((current) => (current.step === "importing" ? { ...current, stopping: true } : current));
          }}
        />
      ) : (
        <ImportDone
          candidates={stage.batch}
          chat={chat}
          progress={stage.progress}
          dailyLimit={stage.dailyLimit}
          onRetryFailed={() => startImport(stage.batch.filter((candidate) => stage.progress.items[candidate.id] === "failed"))}
          onBackToList={candidates.some((candidate) => !candidate.alreadySaved) ? () => setStage({ step: "review" }) : undefined}
          onChooseAnother={chooseAnother}
        />
      )}
    </>
  );
}
