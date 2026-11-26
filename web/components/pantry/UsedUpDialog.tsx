"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deletePantryItems } from "@shared/lib/supabase/pantry";
import { showToast } from "@shared/lib/toast";
import type { PantryItem } from "@shared/types/pantry";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

/**
 * After "I cooked this" (PIN-181): the pantry items the recipe used, none ticked, to take out what ran out. A pantry
 * is out of date the day you cook; this keeps it close without guessing for the person.
 */
export function UsedUpDialog({ items, onClose }: { items: PantryItem[] | null; onClose: () => void }) {
  return (
    <Dialog open={items !== null && items.length > 0} onOpenChange={(open) => !open && onClose()}>
      {items && items.length > 0 ? <Body items={items} onClose={onClose} /> : null}
    </Dialog>
  );
}

function Body({ items, onClose }: { items: PantryItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deletePantryItems([...gone]);
      showToast(t("pantry.usedUp.removed", { count: gone.size }));
      onClose();
    } catch {
      showToast(t("pantry.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={t("pantry.usedUp.title")}
      description={t("pantry.usedUp.body")}
      footer={
        <>
          <Button variant="ghost" trackId="pantry.used_up.skip" onClick={onClose} disabled={busy}>
            {t("pantry.usedUp.skip")}
          </Button>
          <Button trackId="pantry.used_up.remove" busy={busy} disabled={gone.size === 0} onClick={() => void remove()}>
            {t("pantry.usedUp.remove", { count: gone.size })}
          </Button>
        </>
      }
    >
      <ul className="-mx-2 flex max-h-72 flex-col overflow-y-auto">
        {items.map((item) => {
          const on = gone.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                data-track="pantry.used_up.toggle"
                onClick={() =>
                  setGone((set) => {
                    const next = new Set(set);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-element"
              >
                <span
                  aria-hidden
                  className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md border-2", on ? "border-primary bg-primary text-on-primary" : "border-border bg-surface")}
                >
                  {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0">
                  <bdi className="block text-[15px] font-medium text-text">{item.name}</bdi>
                  <span className="block text-[13px] text-muted">{t(`pantry.places.${item.place}`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </DialogContent>
  );
}
