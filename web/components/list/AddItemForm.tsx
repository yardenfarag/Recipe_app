"use client";

import { Plus } from "lucide-react";
import { forwardRef, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { normalizeShoppingName } from "@shared/lib/shoppingListMerge";
import type { ShoppingListItem } from "@shared/types/shoppingList";

import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { parseQuantity } from "@/lib/list/shoppingListView";

// The kit's text field (components/ui/TextField.tsx), without the label above it: these are named by aria-label.
const fieldClass =
  "h-12 min-w-0 rounded-btn border border-border bg-surface px-4 text-base text-text placeholder:text-muted/80 transition-[border-color,box-shadow] hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15";

/**
 * Always ready to type into: name, then optionally amount and unit, Enter adds. The fields empty at once and focus
 * stays in the name, so a whole list can be typed in one go. Warns while typing a name that is already listed.
 */
export const AddItemForm = forwardRef<
  HTMLInputElement,
  { items: ShoppingListItem[]; onAdd: (name: string, quantity: number | null, unit: string | null) => Promise<void> }
>(function AddItemForm({ items, onAdd }, nameRef) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<{ field: "name" | "quantity"; message: string } | null>(null);

  const typingDuplicates = useMemo(() => {
    const key = normalizeShoppingName(name);
    return key ? items.filter((item) => normalizeShoppingName(item.name) === key).length : 0;
  }, [items, name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError({ field: "name", message: t("list.enterItem") });
      return;
    }
    const quantity = parseQuantity(quantityText);
    if (!quantity.ok) {
      setError({ field: "quantity", message: t("list.positiveQuantity") });
      return;
    }
    setError(null);
    const typed = { name, quantityText, unit };
    setName("");
    setQuantityText("");
    setUnit("");
    try {
      await onAdd(trimmed, quantity.quantity, unit.trim() ? unit.trim() : null);
    } catch {
      // Give back what was typed, unless something new is being typed already.
      setName((current) => current || typed.name);
      setQuantityText((current) => current || typed.quantityText);
      setUnit((current) => current || typed.unit);
    }
  }

  const describedBy = error ? "add-item-error" : typingDuplicates > 0 ? "add-item-duplicate" : undefined;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label={t("list.addItemToggle")}>
      <Tile className="flex flex-wrap gap-2 p-3 sm:flex-nowrap">
        <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error?.field === "name") setError(null);
            }}
            aria-label={t("list.itemName")}
            aria-keyshortcuts="/"
            aria-invalid={error?.field === "name" || undefined}
            aria-describedby={describedBy}
            placeholder={t("list.addItemToggle")}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={120}
            className={cn(fieldClass, "w-full pe-10", error?.field === "name" && "border-danger")}
          />
          {!name ? (
            <kbd
              aria-hidden
              className="pointer-events-none absolute end-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 font-sans text-xs text-muted pointer-fine:block"
            >
              /
            </kbd>
          ) : null}
        </div>
        <input
          value={quantityText}
          onChange={(event) => {
            setQuantityText(event.target.value);
            if (error?.field === "quantity") setError(null);
          }}
          aria-label={t("a11y.quantity")}
          aria-invalid={error?.field === "quantity" || undefined}
          aria-describedby={error?.field === "quantity" ? "add-item-error" : undefined}
          placeholder={t("list.quantityShort")}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={10}
          className={cn(fieldClass, "w-20 px-2 text-center tabular-nums", error?.field === "quantity" && "border-danger")}
        />
        <input
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          aria-label={t("list.unitOptional")}
          placeholder={t("list.unit")}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={30}
          className={cn(fieldClass, "w-0 flex-1 sm:w-32 sm:flex-none")}
        />
        <Button type="submit" trackId="shopping_list.add.submit" className="px-4">
          <Plus aria-hidden className="h-5 w-5" />
          <span className="sr-only sm:not-sr-only">{t("list.addItem")}</span>
        </Button>
      </Tile>
      {error ? (
        <p id="add-item-error" role="alert" className="mt-2 px-4 text-sm font-medium text-danger">
          {error.message}
        </p>
      ) : typingDuplicates > 0 ? (
        <p id="add-item-duplicate" aria-live="polite" className="mt-2 px-4 text-sm font-medium text-warning">
          {t("list.typingDuplicate", { count: typingDuplicates })}
        </p>
      ) : null}
    </form>
  );
});
