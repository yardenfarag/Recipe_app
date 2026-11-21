"use client";

import { Plus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { normalizeRecipeTags, translateRecipeTag } from "@shared/lib/recipeTags";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";

type Props = {
  open: boolean;
  tags: string[];
  onClose: () => void;
  /** Saves the tags. Throws when saving failed; the dialog stays open and says so. */
  onSave: (tags: string[]) => Promise<void>;
};

/**
 * Edit tags, as on mobile: remove one with its ×, type a new one and press Enter. Nothing changes until Save. Tags
 * set by hand are kept when Pinch recalculates after an edit (ADR 018).
 */
export function EditTagsDialog({ open, tags, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      {open ? <Body tags={tags} onClose={onClose} onSave={onSave} saving={saving} setSaving={setSaving} /> : null}
    </Dialog>
  );
}

function Body({
  tags,
  onClose,
  onSave,
  saving,
  setSaving,
}: Omit<Props, "open"> & { saving: boolean; setSaving: (saving: boolean) => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState(() => normalizeRecipeTags(tags));
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setDraft((previous) => normalizeRecipeTags([...previous, input]));
    setInput("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Text still in the box counts, so "type, then Save" doesn't lose it.
      await onSave(normalizeRecipeTags(input.trim() ? [...draft, input] : draft));
      onClose();
    } catch {
      setError(t("tags.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent
      title={t("tags.editTitle")}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" trackId="tags.edit.cancel" disabled={saving}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button trackId="tags.edit.save" busy={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {draft.length === 0 ? (
        <p className="text-[15px] text-muted">{t("tags.empty")}</p>
      ) : (
        <ul aria-label={t("library.tags")} className="flex flex-wrap gap-2">
          {draft.map((tag) => {
            const label = translateRecipeTag(tag, t);
            return (
              <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-element py-1 ps-3 pe-1 text-sm font-medium text-text">
                {label}
                <button
                  type="button"
                  data-track="tags.edit.remove"
                  aria-label={t("tags.remove", { tag: label })}
                  onClick={() => setDraft((previous) => previous.filter((item) => item !== tag))}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-selected hover:text-text"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t("tags.addPlaceholder")}
        </label>
        <input
          id={inputId}
          value={input}
          maxLength={40}
          autoComplete="off"
          placeholder={t("tags.addPlaceholder")}
          onChange={(event) => setInput(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <Button type="submit" variant="secondary" trackId="tags.edit.add" disabled={!input.trim()} aria-label={t("tags.add")}>
          <Plus aria-hidden className="h-4 w-4" />
          {t("avoid.add")}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </DialogContent>
  );
}
