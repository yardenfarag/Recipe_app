"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";

/**
 * Asks for one name: a new collection, a renamed collection, a renamed recipe. `validate` returns the message to
 * show under the field (or null); `onSubmit` does the saving and may throw, which is shown the same way.
 * The field is filled and selected when it opens, so typing replaces the old name.
 */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue = "",
  submitLabel,
  validate,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  validate: (name: string) => string | null;
  onSubmit: (name: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <NameForm
          title={title}
          label={label}
          initialValue={initialValue}
          submitLabel={submitLabel}
          validate={validate}
          onSubmit={onSubmit}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function NameForm({
  title,
  label,
  initialValue,
  submitLabel,
  validate,
  onSubmit,
  onDone,
}: {
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  validate: (name: string) => string | null;
  onSubmit: (name: string) => Promise<void>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = validate(value);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(value.trim());
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent title={title}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <TextField
          label={label}
          value={value}
          error={error ?? undefined}
          autoFocus
          autoComplete="off"
          maxLength={80}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="submit" busy={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
