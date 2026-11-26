"use client";

import { Check, Home, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import type { ShoppingListItem } from "@shared/types/shoppingList";

import { MemberAvatar } from "@/components/household/HouseholdAvatar";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { parseQuantity, shoppingAmount } from "@/lib/list/shoppingListView";
import type { ItemPatch } from "@/lib/list/useShoppingList";

export type MoveTarget = "next" | "previous" | "first" | "last";

export type ShoppingItemRowProps = {
  item: ShoppingListItem;
  language: CulinaryUnitLanguage;
  /** How many lines share this name. Above 1 shows the "also listed" badge, which offers to combine them. */
  duplicateCount: number;
  onToggle: (item: ShoppingListItem) => void;
  onSave: (item: ShoppingListItem, patch: ItemPatch) => Promise<void>;
  onRemove: (item: ShoppingListItem) => void;
  onKeepAtHome: (item: ShoppingListItem) => void;
  onCombine: (item: ShoppingListItem) => void;
  /** Arrow keys on an item move between items, across groups. */
  onMove: (item: ShoppingListItem, to: MoveTarget) => void;
  checkboxRef: (element: HTMLButtonElement | null) => void;
  /** Someone else in the household who put this on the list (ADR 034): their picture, and "Added by" for readers. */
  addedBy?: { displayName: string; avatarUrl: string | null } | null;
};

const MOVE_KEYS: Record<string, MoveTarget> = { ArrowDown: "next", ArrowUp: "previous", Home: "first", End: "last" };

/**
 * One line on the list. Click or Space checks it off. With the keyboard: arrows move, E edits in place, Delete
 * removes. The row's own buttons (have at home, edit, remove) show on hover or focus with a mouse, always on touch.
 */
export function ShoppingItemRow(props: ShoppingItemRowProps) {
  const [editing, setEditing] = useState(false);
  const ownCheckbox = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      ownCheckbox.current?.focus();
    }
  }, [editing]);

  const stopEditing = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  if (editing) return <EditRow {...props} onDone={stopEditing} />;
  return (
    <ViewRow
      {...props}
      checkboxRef={(element) => {
        ownCheckbox.current = element;
        props.checkboxRef(element);
      }}
      onEdit={() => setEditing(true)}
    />
  );
}

function ViewRow({
  item,
  language,
  duplicateCount,
  onToggle,
  onRemove,
  onKeepAtHome,
  onCombine,
  onMove,
  checkboxRef,
  onEdit,
  addedBy,
}: ShoppingItemRowProps & { onEdit: () => void }) {
  const { t } = useTranslation();
  const amount = shoppingAmount(item, language);
  const duplicate = duplicateCount > 1;
  const addedByText = addedBy ? t("household.addedBy", { name: addedBy.displayName }) : null;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const move = MOVE_KEYS[event.key];
    if (move) {
      event.preventDefault();
      onMove(item, move);
    } else if (event.key === "e" || event.key === "E" || event.key === "F2") {
      event.preventDefault();
      onEdit();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(item);
    }
  }

  return (
    <li className="group flex items-center gap-1 rounded-2xl pe-1 transition-colors hover:bg-element">
      <button
        ref={checkboxRef}
        type="button"
        role="checkbox"
        data-track="shopping_list.item.toggle"
        aria-checked={item.checked}
        aria-label={[item.name, amount, duplicate ? t("list.alsoListed", { count: duplicateCount }) : null, addedByText].filter(Boolean).join(", ")}
        aria-keyshortcuts="ArrowDown ArrowUp E Delete"
        data-list-item
        onClick={() => onToggle(item)}
        onKeyDown={onKeyDown}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-start"
      >
        <span
          aria-hidden
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
            item.checked ? "border-primary bg-primary text-on-primary" : "border-muted/60 group-hover:border-primary",
          )}
        >
          {item.checked ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : null}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]",
              item.checked ? "text-muted line-through decoration-muted/70" : "text-text",
            )}
          >
            {item.name}
          </span>
          {addedBy && addedByText ? (
            // Right after the name, so it reads as "olive oil, added by Avi" and never floats in the space the
            // hover actions keep. Screen readers get it from the row's label above; the name shows on hover.
            <Tooltip label={addedByText}>
              <span data-testid="added-by" aria-hidden className={cn("shrink-0", item.checked && "opacity-60")}>
                <MemberAvatar name={addedBy.displayName} avatarUrl={addedBy.avatarUrl} className="h-6 w-6 text-[24px] ring-1 ring-border" />
              </span>
            </Tooltip>
          ) : null}
        </span>
        {amount ? (
          <span dir="auto" className={cn("max-w-[40%] shrink-0 text-end text-sm tabular-nums", item.checked ? "text-muted/70" : "text-muted")}>
            {amount}
          </span>
        ) : null}
      </button>
      {duplicate ? (
        <button
          type="button"
          data-track="shopping_list.item.duplicate_badge"
          onClick={() => onCombine(item)}
          // The ::after makes the small badge 44 px tall to a finger without making it look bigger.
          className="relative shrink-0 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold whitespace-nowrap text-warning after:absolute after:inset-x-0 after:-inset-y-2.5 hover:brightness-95"
        >
          {t("list.alsoListed", { count: duplicateCount })}
        </button>
      ) : null}
      <div className="flex shrink-0 items-center transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
        {!item.checked ? (
          <IconButton
            label={t("list.keepThisLabel", { name: item.name })}
            trackId="shopping_list.item.keep_in_pantry"
            icon={<Home className="h-[18px] w-[18px]" />}
            onClick={() => onKeepAtHome(item)}
          />
        ) : null}
        <IconButton label={t("list.editItemLabel", { name: item.name })} trackId="shopping_list.item.edit" icon={<Pencil className="h-[18px] w-[18px]" />} onClick={onEdit} />
        <IconButton
          label={t("list.removeItemLabel", { name: item.name })}
          trackId="shopping_list.item.remove"
          icon={<Trash2 className="h-[18px] w-[18px]" />}
          onClick={() => onRemove(item)}
          className="hover:text-danger"
        />
      </div>
    </li>
  );
}

/** Editing in place: Enter saves, Escape puts it back as it was. */
function EditRow({ item, onSave, onDone }: ShoppingItemRowProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(item.name);
  const [quantityText, setQuantityText] = useState(item.quantity != null ? String(item.quantity) : "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("list.enterItemName"));
      return;
    }
    const quantity = parseQuantity(quantityText);
    if (!quantity.ok) {
      setError(t("list.positiveQuantity"));
      return;
    }
    setBusy(true);
    try {
      await onSave(item, { name: name.trim(), quantity: quantity.quantity, unit: unit.trim() ? unit.trim() : null });
      onDone();
    } catch {
      setBusy(false); // The page says what went wrong; the edit stays open to try again.
    }
  }

  const field =
    "h-11 min-w-0 rounded-btn border border-border bg-surface px-3 text-base text-text placeholder:text-muted/80 transition-[border-color,box-shadow] hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <li className="rounded-2xl bg-element p-2">
      <form
        onSubmit={(event) => void save(event)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }}
        noValidate
        aria-label={t("list.editItem")}
        className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
      >
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-label={t("list.itemName")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `edit-error-${item.id}` : undefined}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          maxLength={120}
          autoComplete="off"
          className={cn(field, "basis-full sm:flex-1 sm:basis-auto")}
        />
        <input
          value={quantityText}
          onChange={(event) => {
            setQuantityText(event.target.value);
            setError(null);
          }}
          aria-label={t("a11y.quantity")}
          placeholder={t("list.quantityShort")}
          inputMode="decimal"
          maxLength={10}
          autoComplete="off"
          className={cn(field, "w-20 px-2 text-center tabular-nums")}
        />
        <input
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          aria-label={t("list.unit")}
          placeholder={t("list.unit")}
          maxLength={30}
          autoComplete="off"
          className={cn(field, "w-0 flex-1 sm:w-28 sm:flex-none")}
        />
        <div className="flex shrink-0 items-center">
          <IconButton
            type="submit"
            label={t("common.save")}
            trackId="shopping_list.edit.save"
            icon={<Check className="h-5 w-5" />}
            disabled={busy}
            className="text-primary-text hover:text-primary-text"
          />
          <IconButton label={t("common.cancel")} trackId="shopping_list.edit.cancel" icon={<X className="h-5 w-5" />} onClick={onDone} disabled={busy} />
        </div>
      </form>
      {error ? (
        <p id={`edit-error-${item.id}`} role="alert" className="mt-1.5 px-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}
