"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { CircleAlert, Eraser, Info, MoreHorizontal, ShoppingBasket, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { resolveCulinaryLanguage } from "@shared/lib/culinaryUnits";
import { getDuplicateNameCounts, normalizeShoppingName } from "@shared/lib/shoppingListMerge";
import { showToast } from "@shared/lib/toast";
import { joinErrorSentences, translateAppError } from "@shared/lib/translateAppError";
import type { ShoppingListItem } from "@shared/types/shoppingList";

import { useLanguage } from "@/components/LanguageProvider";
import { AddFromRecipesDialog } from "@/components/list/AddFromRecipesDialog";
import { AddItemForm } from "@/components/list/AddItemForm";
import { ShoppingItemRow, type MoveTarget } from "@/components/list/ShoppingItemRow";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { Tile, TileBadge, TileLabel } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { displayOrder, groupShoppingList, neighbourId } from "@/lib/list/shoppingListView";
import { usePantryStaples } from "@/lib/list/usePantryStaples";
import { useShoppingList, type ItemPatch } from "@/lib/list/useShoppingList";

type Notice = { message: string; action?: { label: string; trackId: string; run: () => Promise<void> } };
type Confirm = { kind: "checked" } | { kind: "all" } | { kind: "combine"; name: string; count: number } | null;

const menuItemClass =
  "relative flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[15px] text-text outline-none pointer-coarse:h-11 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-element";

/**
 * The shopping list: what to buy, grouped the way a shop is laid out (aisles in columns on a wide screen), with
 * everything checked at the end. Type to add, click or Space to check off, arrows to move. The same list as the
 * mobile app.
 */
export default function ListPage() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const unitLanguage = resolveCulinaryLanguage(language);
  const { items, loading, error, refresh, add, combineDuplicates, toggleChecked, updateItem, removeItem, restoreItem, clearChecked, clearAll } =
    useShoppingList();
  const { keepStaple, dropStaple } = usePantryStaples();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [fromRecipesOpen, setFromRecipesOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const checkboxes = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  const { groups, checked } = useMemo(() => groupShoppingList(items), [items]);
  const order = useMemo(() => displayOrder(items), [items]);
  const duplicateCounts = useMemo(() => getDuplicateNameCounts(items), [items]);
  const checkedCount = checked.length;

  // "/" jumps to the add field from anywhere on the page, unless you are already typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      event.preventDefault();
      nameRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A checked item moves to the end, so focus goes on to the next one: Space, Space, Space ticks off a run of them.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    checkboxes.current.get(id)?.focus();
  }, [items]);

  /** When an item leaves its place, the one after it takes the focus, if the item had it. */
  const passFocusOn = useCallback(
    (item: ShoppingListItem, fallbackToSelf: boolean) => {
      if (document.activeElement !== checkboxes.current.get(item.id)) return;
      pendingFocus.current = neighbourId(order, item.id) ?? (fallbackToSelf ? item.id : null);
      if (!pendingFocus.current) nameRef.current?.focus();
    },
    [order],
  );

  const failed = useCallback(
    (titleKey: string) => (caught: unknown) => showToast(joinErrorSentences(t(titleKey), translateAppError(caught, t)), "error"),
    [t],
  );

  const toggle = useCallback(
    (item: ShoppingListItem) => {
      passFocusOn(item, true);
      toggleChecked(item.id).catch(failed("list.updateFailed"));
    },
    [failed, passFocusOn, toggleChecked],
  );

  const save = useCallback(
    async (item: ShoppingListItem, patch: ItemPatch) => {
      try {
        await updateItem(item.id, patch);
      } catch (caught) {
        failed("list.updateFailed")(caught);
        throw caught;
      }
    },
    [failed, updateItem],
  );

  const remove = useCallback(
    (item: ShoppingListItem) => {
      passFocusOn(item, false);
      removeItem(item.id)
        .then(() =>
          setNotice({
            message: t("web.list.removed", { name: item.name }),
            action: { label: t("web.list.undo"), trackId: "shopping_list.notice.undo_remove", run: () => restoreItem(item) },
          }),
        )
        .catch(failed("list.removeFailed"));
    },
    [failed, passFocusOn, removeItem, restoreItem, t],
  );

  const keepAtHome = useCallback(
    (item: ShoppingListItem) => {
      passFocusOn(item, false);
      keepStaple(item.name).catch(() => showToast(t("settings.kitchenSaveFailed"), "error"));
      removeItem(item.id)
        .then(() =>
          setNotice({
            message: t("list.pantrySaved", { name: item.name }),
            action: {
              label: t("web.list.undo"),
              trackId: "shopping_list.notice.undo_keep_in_pantry",
              run: async () => {
                await Promise.all([dropStaple(item.name), restoreItem(item)]);
              },
            },
          }),
        )
        .catch(failed("list.removeFailed"));
    },
    [dropStaple, failed, keepStaple, passFocusOn, removeItem, restoreItem, t],
  );

  const addManual = useCallback(
    async (name: string, quantity: number | null, unit: string | null) => {
      try {
        const result = await add([{ name, quantity, unit }], "append");
        const already = result.alreadyOnList[0];
        setNotice(
          already
            ? {
                message: t("list.alreadyListed", { name: already }),
                action: { label: t("list.combineOneLine"), trackId: "shopping_list.notice.combine", run: () => combineDuplicates(already) },
              }
            : null,
        );
      } catch (caught) {
        failed("list.addFailed")(caught);
        throw caught;
      }
    },
    [add, combineDuplicates, failed, t],
  );

  // Moves by the rows on screen, from the one that has focus: a just-added item keeps a temporary id until its
  // save returns, so looking it up by id could miss it.
  const move = useCallback((_item: ShoppingListItem, to: MoveTarget) => {
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>("#main button[role=checkbox][data-list-item]"));
    const index = rows.findIndex((row) => row === document.activeElement);
    const target = to === "first" ? rows[0] : to === "last" ? rows[rows.length - 1] : rows[index + (to === "next" ? 1 : -1)];
    target?.focus();
  }, []);

  const rowProps = (item: ShoppingListItem) => ({
    item,
    language: unitLanguage,
    duplicateCount: duplicateCounts.get(normalizeShoppingName(item.name)) ?? 0,
    onToggle: toggle,
    onSave: save,
    onRemove: remove,
    onKeepAtHome: keepAtHome,
    onCombine: (target: ShoppingListItem) =>
      setConfirm({ kind: "combine", name: target.name, count: duplicateCounts.get(normalizeShoppingName(target.name)) ?? 0 }),
    onMove: move,
    checkboxRef: (element: HTMLButtonElement | null) => {
      // A row that moves group is a new element; the newest one wins. Removed ids are left (a few bytes).
      if (element) checkboxes.current.set(item.id, element);
    },
  });

  const loadFailed = Boolean(error) && items.length === 0 && !loading;
  const wide = groups.length > 1;

  return (
    <>
      <PageHeader
        title={t("list.title")}
        subtitle={items.length > 0 ? t("list.progress", { left: items.length - checkedCount, checked: checkedCount }) : t("list.subtitle")}
        actions={
          <>
            <Button variant="secondary" trackId="shopping_list.from_recipes" onClick={() => setFromRecipesOpen(true)}>
              <UtensilsCrossed aria-hidden className="h-[18px] w-[18px]" />
              {t("list.fromRecipes")}
            </Button>
            <Menu.Root>
              <Menu.Trigger asChild>
                <IconButton
                  variant="tile"
                  label={t("a11y.moreOptions")}
                  trackId="shopping_list.more"
                  icon={<MoreHorizontal className="h-5 w-5" />}
                  disabled={items.length === 0}
                />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content
                  align="end"
                  sideOffset={6}
                  collisionPadding={12}
                  className="z-50 min-w-52 animate-pop-in rounded-2xl border border-border bg-surface p-1.5 shadow-lift"
                >
                  <Menu.Item className={menuItemClass} data-track="shopping_list.clear_checked" disabled={checkedCount === 0} onSelect={() => setConfirm({ kind: "checked" })}>
                    <Eraser aria-hidden className="h-[18px] w-[18px] text-muted" />
                    {t("list.clearChecked")}
                  </Menu.Item>
                  <Menu.Separator className="my-1.5 h-px bg-border" />
                  <Menu.Item className={cn(menuItemClass, "text-danger")} data-track="shopping_list.clear_all" onSelect={() => setConfirm({ kind: "all" })}>
                    <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                    {t("list.clearList")}
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </>
        }
      />

      {loadFailed ? (
        <ErrorState title={t("list.loadFailedTitle")} body={t("list.loadFailedBody")} trackId="shopping_list.load_error" onRetry={() => void refresh()} />
      ) : (
        <div className={cn("flex w-full max-w-2xl flex-col gap-4", wide && "xl:max-w-5xl")}>
          <div className="flex max-w-2xl flex-col gap-3">
            <AddItemForm ref={nameRef} items={items} onAdd={addManual} />

            {error && items.length > 0 ? (
              <div role="alert" className="flex items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <CircleAlert aria-hidden className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t("list.refreshFailed")}</span>
                <button type="button" data-track="shopping_list.refresh_error.retry" onClick={() => void refresh()} className="font-semibold underline underline-offset-2">
                  {t("common.retry")}
                </button>
              </div>
            ) : null}

            {notice ? <NoticeBar notice={notice} onDismiss={() => setNotice(null)} onError={failed("list.updateFailed")} /> : null}
          </div>

          {loading ? (
            <LoadingState label={t("a11y.loading")} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<ShoppingBasket aria-hidden />}
              title={t("list.emptyTitle")}
              body={t("web.list.emptyBody")}
              action={
                <Button variant="secondary" trackId="shopping_list.from_recipes" onClick={() => setFromRecipesOpen(true)}>
                  <UtensilsCrossed aria-hidden className="h-[18px] w-[18px]" />
                  {t("list.fromRecipes")}
                </Button>
              }
            />
          ) : (
            <>
              {groups.length > 0 ? (
                <div className={cn(wide && "xl:columns-2 xl:gap-4")}>
                  {groups.map((group) => (
                    <Group key={group.aisle} title={t(`list.aisles.${group.aisle}`)} count={group.items.length}>
                      {group.items.map((item) => (
                        <ShoppingItemRow key={item.id} {...rowProps(item)} />
                      ))}
                    </Group>
                  ))}
                </div>
              ) : null}

              {checked.length > 0 ? (
                <Group
                  title={t("list.checkedSection")}
                  count={checked.length}
                  muted
                  action={
                    <Button variant="ghost" size="sm" trackId="shopping_list.clear_checked" onClick={() => setConfirm({ kind: "checked" })}>
                      <Eraser aria-hidden className="h-4 w-4" />
                      {t("list.clearChecked")}
                    </Button>
                  }
                >
                  {checked.map((item) => (
                    <ShoppingItemRow key={item.id} {...rowProps(item)} />
                  ))}
                </Group>
              ) : null}

              <p className="hidden px-1 text-xs text-muted pointer-fine:block">{t("web.list.keyboardHint")}</p>
            </>
          )}
        </div>
      )}

      <AddFromRecipesDialog open={fromRecipesOpen} onOpenChange={setFromRecipesOpen} onAdd={(incoming) => add(incoming, "merge")} />

      <ConfirmDialog
        open={confirm?.kind === "checked"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("list.clearCheckedTitle")}
        description={t("list.clearCheckedBody", { count: checkedCount })}
        confirmLabel={t("list.clearChecked")}
        trackId="shopping_list.clear_checked_dialog"
        onConfirm={() => clearChecked().catch(failed("list.clearFailed"))}
      />
      <ConfirmDialog
        open={confirm?.kind === "all"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("list.deleteAllTitle")}
        description={t("list.deleteAllBody", { count: items.length })}
        confirmLabel={t("list.deleteAll")}
        trackId="shopping_list.clear_all_dialog"
        onConfirm={() => clearAll().catch(failed("list.deleteFailed"))}
      />
      <ConfirmDialog
        open={confirm?.kind === "combine"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("list.duplicateTitle")}
        description={confirm?.kind === "combine" ? t("list.duplicateBody", { name: confirm.name, count: confirm.count }) : undefined}
        confirmLabel={t("list.combine")}
        trackId="shopping_list.combine_dialog"
        confirmVariant="primary"
        onConfirm={() => {
          if (confirm?.kind !== "combine") return;
          return combineDuplicates(confirm.name).catch(failed("list.combineFailed"));
        }}
      />
    </>
  );
}

/** One aisle (or "Checked"): its name and how many are in it, then the items. */
function Group({
  title,
  count,
  muted = false,
  action,
  children,
}: {
  title: string;
  count: number;
  muted?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    // The checked group is an outline with no fill, so what is left to buy stands out.
    <Tile as="section" className={cn("mb-4 break-inside-avoid p-2 sm:p-3", muted && "bg-transparent")}>
      <div className="flex min-h-11 items-center justify-between gap-3 ps-3 pe-1">
        <TileLabel as="h2" className="flex min-w-0 items-center gap-2.5">
          {title}
          <TileBadge aria-hidden className="tabular-nums">
            {count}
          </TileBadge>
          <span className="sr-only">, {t("a11y.itemCount", { count })}</span>
        </TileLabel>
        {action}
      </div>
      <ul className="mt-1 flex flex-col">{children}</ul>
    </Tile>
  );
}

/** What just happened, with the one thing that undoes or follows it (Undo, Combine). Stays until dismissed. */
function NoticeBar({ notice, onDismiss, onError }: { notice: Notice; onDismiss: () => void; onError: (caught: unknown) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl bg-warning-soft py-2 ps-4 pe-2 text-sm text-text">
      <Info aria-hidden className="h-4 w-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">{notice.message}</span>
      {notice.action ? (
        <Button
          variant="ghost"
          size="sm"
          trackId={notice.action.trackId}
          busy={busy}
          className="text-warning"
          onClick={async () => {
            setBusy(true);
            try {
              await notice.action?.run();
              onDismiss();
            } catch (caught) {
              onError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          {notice.action.label}
        </Button>
      ) : null}
      <IconButton
        label={t("common.dismiss")}
        trackId="shopping_list.notice.dismiss"
        icon={<X className="h-4 w-4" />}
        tooltip={false}
        onClick={onDismiss}
        className="h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11"
      />
    </div>
  );
}
