"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";

/** The same limit as mobile and the database write (setRecipeCooked). */
export const COOK_NOTE_MAX = 160;

type Props = {
  open: boolean;
  initialNote: string;
  onClose: () => void;
  /** Saves the note (empty clears it). Throws when saving failed; the dialog stays open and says so. */
  onSave: (note: string) => Promise<void>;
};

/** "A note for next time": one optional line, shown on the recipe next time. Opens after the first "I cooked this". */
export function CookedNoteDialog({ open, initialNote, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      {open ? <Body initialNote={initialNote} onClose={onClose} onSave={onSave} saving={saving} setSaving={setSaving} /> : null}
    </Dialog>
  );
}

function Body({
  initialNote,
  onClose,
  onSave,
  saving,
  setSaving,
}: Omit<Props, "open"> & { saving: boolean; setSaving: (saving: boolean) => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(note.trim());
      onClose();
    } catch {
      setError(t("recipe.cookedSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent title={t("recipe.cookedNoteTitle")} description={t("recipe.cookedNoteHint")}>
      <form onSubmit={save}>
        <TextField
          label={t("recipe.cookedNoteTitle")}
          className="text-[15px]"
          value={note}
          maxLength={COOK_NOTE_MAX}
          autoComplete="off"
          // The dialog is opened for this, so typing can start at once.
          autoFocus
          placeholder={t("recipe.cookedNotePlaceholder")}
          onChange={(event) => setNote(event.target.value.slice(0, COOK_NOTE_MAX))}
          error={error ?? undefined}
        />
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="ghost" disabled={saving}>
              {t("common.notNow")}
            </Button>
          </DialogClose>
          <Button type="submit" busy={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
