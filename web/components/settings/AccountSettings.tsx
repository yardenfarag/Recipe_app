"use client";

import { Camera, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { normalizeEmail } from "@shared/lib/authValidation";
import { deleteAccount } from "@shared/lib/supabase/auth";
import { uploadAvatar } from "@shared/lib/supabase/profile";
import { showToast } from "@shared/lib/toast";

import { useAuth } from "@/components/AuthProvider";
import { SettingsCard } from "@/components/settings/controls";
import { ProfileAvatar } from "@/components/settings/ProfileAvatar";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { useSettingsProfile } from "@/components/settings/SettingsProfile";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { Tile, TileLabel } from "@/components/ui/Tile";
import { signOut } from "@/lib/auth";
import { squareAvatarFromFile } from "@/lib/settings/avatarImage";

/** Who is signed in: the email, the profile photo, signing out, and deleting the account. */
export function AccountSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { avatarUrl, totalCredits, refresh } = useSettingsProfile();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function changePhoto(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const base64 = await squareAvatarFromFile(file);
      if (!base64) {
        showToast(t("settings.imageReadFailedBody"), "info");
        return;
      }
      await uploadAvatar(user.id, base64, "jpg");
      await refresh();
    } catch {
      showToast(t("settings.uploadFailedTitle"), "info");
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/auth?mode=signin");
    } catch {
      showToast(t("settings.signOutFailedTitle"), "info");
      setSigningOut(false);
    }
  }

  return (
    <>
      <SettingsPageHeader id="account" />
      <div className="flex flex-col gap-4">
        <Tile as="section" aria-label={t("web.account")} className="flex flex-col gap-5 p-5 @md:flex-row @md:items-center sm:p-6">
          <div className="relative w-fit">
            <ProfileAvatar url={avatarUrl} className="h-24 w-24" />
            <button
              type="button"
              data-track="settings.avatar.change"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              aria-busy={uploading || undefined}
              aria-label={t("settings.changeAvatarTitle")}
              title={t("settings.changeAvatarTitle")}
              className="absolute -end-2 -bottom-1 grid h-10 w-10 place-items-center rounded-xl border-2 border-surface bg-primary text-on-primary transition-[filter] hover:brightness-105 disabled:opacity-70 pointer-coarse:h-11 pointer-coarse:w-11"
            >
              {uploading ? (
                <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Camera aria-hidden className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void changePhoto(file);
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <TileLabel>{t("web.signedInAs")}</TileLabel>
            <p className="mt-1 truncate font-display text-xl font-bold text-text" dir="ltr">
              {user?.email}
            </p>
            {totalCredits != null ? <p className="mt-1 text-sm text-muted">{t("settings.creditsTotal", { count: totalCredits })}</p> : null}
          </div>
          <Button variant="outline" className="self-start @md:self-auto" trackId="settings.sign_out" busy={signingOut} onClick={() => void handleSignOut()}>
            <LogOut aria-hidden className="h-4 w-4 rtl:rotate-180" />
            {t("settings.signOut")}
          </Button>
        </Tile>

        <SettingsCard title={t("settings.dangerZone")} hint={t("settings.dangerZoneHint")} tone="danger">
          <Button variant="danger" trackId="settings.delete_account" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden className="h-4 w-4" />
            {t("settings.deleteAccount")}
          </Button>
        </SettingsCard>
      </div>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        email={user?.email ?? null}
        onDeleted={() => {
          showToast(t("settings.deleteSuccessBody"));
          router.replace("/auth");
        }}
      />
    </>
  );
}

/**
 * Deleting an account can't be undone, so it asks once, clearly, and the cook types their email to confirm. That
 * replaces the mobile app's two questions in a row, which are easy to tap through.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string | null;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = !email || normalizeEmail(typed) === normalizeEmail(email);

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function confirm() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The web has no Apple sign-in to ask again; the server still deletes the account without that code (TN3194).
      await deleteAccount();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("common.tryAgain"));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={t("settings.deleteConfirmTitle")}
        description={t("settings.deleteConfirmBody")}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost" trackId="settings.delete_account_dialog.cancel" disabled={busy}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button variant="danger" trackId="settings.delete_account_dialog.confirm" busy={busy} disabled={!confirmed} onClick={() => void confirm()}>
              {t("settings.deleteAccount")}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          {email ? (
            <TextField
              label={t("web.settings.deleteTypeEmail", { email })}
              type="email"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={busy}
            />
          ) : null}
          {error ? (
            <ErrorAlert>
              <strong className="font-semibold">{t("settings.deleteFailedTitle")}.</strong> {error}
            </ErrorAlert>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
