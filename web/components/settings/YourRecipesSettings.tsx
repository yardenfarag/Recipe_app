"use client";

import { BookOpen, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { parseRecipeBackup, recipeBackupFileName, RecipeBackupError, type ParsedRecipeBackup, type RecipeBackupErrorCode } from "@shared/lib/recipeBackup";
import { fetchRecipeBackup, restoreRecipeBackup } from "@shared/lib/supabase/recipeBackup";
import { showToast } from "@shared/lib/toast";

import { SettingsCard } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

/** The mobile app's words for a file that can't be restored (src/app/(tabs)/settings.tsx). */
const RESTORE_ERROR_KEYS: Record<RecipeBackupErrorCode, string> = {
  not_json: "settings.restoreNotBackup",
  not_backup: "settings.restoreNotBackup",
  newer_version: "settings.restoreNewerVersion",
  too_large: "settings.restoreTooLarge",
};

/**
 * Your recipes, as mobile Settings → Your recipes: the PDF cookbook, and a backup to download or restore (PIN-75). The
 * backup is the same JSON file on both apps, so one made on the phone restores here and the other way round.
 */
export function YourRecipesSettings() {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ParsedRecipeBackup | null>(null);

  async function download() {
    if (busy) return;
    setBusy("export");
    setError(null);
    try {
      const backup = await fetchRecipeBackup();
      if (backup.recipes.length === 0) {
        showToast(`${t("settings.backupEmptyTitle")}. ${t("settings.backupEmptyBody")}`, "info");
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = recipeBackupFileName();
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(`${t("settings.backupFailedTitle")}. ${t("common.tryAgain")}`);
    } finally {
      setBusy(null);
    }
  }

  async function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still fires.
    event.target.value = "";
    if (!file) return;
    setError(null);
    let backup: ParsedRecipeBackup;
    try {
      backup = parseRecipeBackup(await file.text());
    } catch (cause) {
      setError(cause instanceof RecipeBackupError ? t(RESTORE_ERROR_KEYS[cause.code]) : t("settings.restoreNotBackup"));
      return;
    }
    if (backup.recipes.length === 0) {
      setError(t("settings.restoreEmpty"));
      return;
    }
    setPending(backup);
  }

  async function restore(backup: ParsedRecipeBackup) {
    setBusy("restore");
    try {
      const result = await restoreRecipeBackup(backup);
      const body = t("settings.restoreDoneBody", { added: result.added, skipped: result.skipped });
      showToast(result.invalid > 0 ? `${body} ${t("settings.restoreInvalidNote", { count: result.invalid })}` : body);
    } catch {
      setError(`${t("settings.restoreFailedTitle")}. ${t("settings.restoreFailedBody")}`);
    } finally {
      setBusy(null);
      setPending(null);
    }
  }

  return (
    <>
      <SettingsPageHeader id="recipes" />
      <div className="flex flex-col gap-4">
        <SettingsCard title={t("settings.cookbook")} hint={t("settings.cookbookHint")}>
          <Link href="/cookbook" data-track="settings.cookbook" className={buttonClasses({ variant: "outline" })}>
            <BookOpen aria-hidden className="h-4 w-4 text-primary-text" />
            {t("library.makeCookbook")}
          </Link>
        </SettingsCard>

        <SettingsCard title={t("settings.backupDownload")} hint={t("settings.backupDownloadHint")}>
          <Button variant="outline" trackId="settings.backup.download" busy={busy === "export"} disabled={busy !== null} onClick={() => void download()}>
            <Download aria-hidden className="h-4 w-4 text-primary-text" />
            {t("settings.backupDownload")}
          </Button>
        </SettingsCard>

        <SettingsCard title={t("settings.backupRestore")} hint={t("settings.backupRestoreHint")}>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void chosen(event)} />
          <Button variant="outline" trackId="settings.backup.restore" busy={busy === "restore"} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden className="h-4 w-4 text-primary-text" />
            {t("settings.backupRestore")}
          </Button>
        </SettingsCard>

        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("settings.restoreConfirmTitle")}
        description={pending ? t("settings.restoreConfirmBody", { count: pending.recipes.length }) : undefined}
        confirmLabel={t("settings.restoreConfirm")}
        confirmVariant="primary"
        trackId="settings.backup.restore_dialog"
        onConfirm={() => (pending ? restore(pending) : undefined)}
      />
    </>
  );
}
