"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Ellipsis, FolderPlus, Languages, NotebookPen, PencilLine, Tags, Trash2, Undo2, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { IconButton, type IconButtonVariant } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

const itemClass =
  "relative flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-text outline-none data-[highlighted]:bg-element data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

function ItemIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <Icon aria-hidden className={cn("h-[18px] w-[18px] shrink-0 text-muted", className)} />;
}

/**
 * The saved recipe's "more" menu, in the page's top bar (and on the photo on a phone): edit, collections, tags, the
 * cook note, then what puts the recipe right (repair, revert, the original language), then delete. Arrow keys move,
 * Enter chooses, Escape closes and puts focus back on the button. Remix, the kitchen fix, swap and translate have
 * their own tiles under the photo ("Make it yours"); Share has its own button.
 */
export function RecipeMoreMenu({ actions, onDelete, variant = "tile" }: { actions: RecipeActions; onDelete?: () => void; variant?: IconButtonVariant }) {
  const { t } = useTranslation();
  const { display } = actions;
  const { recipe } = display;
  const tagCount = recipe.tags?.length ?? 0;
  const fixes = actions.canRepair || actions.canRevert || display.translated;

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <IconButton variant={variant} label={t("a11y.moreOptions")} trackId="recipe.more" tooltip={false} icon={<Ellipsis aria-hidden className="h-5 w-5" />} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={t("a11y.recipeActionsFor", { name: display.title })}
          className="z-50 min-w-60 animate-pop-in rounded-2xl border border-border bg-surface p-1.5 shadow-lift"
        >
          <Menu.Item asChild className={itemClass}>
            <Link href={`/recipe/edit?id=${encodeURIComponent(recipe.id)}`} data-track="recipe_actions.edit">
              <ItemIcon icon={PencilLine} className="rtl:-scale-x-100" />
              {t("recipeEditor.titleEdit")}
            </Link>
          </Menu.Item>
          <Menu.Item className={itemClass} data-track="recipe.add_to_collection" onSelect={() => actions.open({ kind: "collection" })}>
            <ItemIcon icon={FolderPlus} />
            {t("library.addToCollection")}
          </Menu.Item>
          <Menu.Item className={itemClass} data-track="recipe.tags.edit" onSelect={() => actions.open({ kind: "tags" })}>
            <ItemIcon icon={Tags} />
            {tagCount > 0 ? t("tags.editTitle") : t("tags.addTags")}
          </Menu.Item>
          {recipe.last_cooked_at ? (
            <Menu.Item className={itemClass} data-track="recipe.cooked.note" onSelect={() => actions.open({ kind: "note" })}>
              <ItemIcon icon={NotebookPen} />
              {t("recipe.cookedNoteTitle")}
            </Menu.Item>
          ) : null}

          {fixes ? <Menu.Separator className="my-1.5 h-px bg-border" /> : null}
          {actions.canRepair ? (
            <Menu.Item className={itemClass} data-track="recipe.repair" disabled={actions.busy.repair} onSelect={() => actions.open({ kind: "repair" })}>
              <ItemIcon icon={Wrench} />
              <span className="flex flex-col">
                {t("recipe.repairAction")}
                <span className="text-xs text-muted">{t("recipe.repairHint")}</span>
              </span>
            </Menu.Item>
          ) : null}
          {actions.canRevert ? (
            <Menu.Item className={itemClass} data-track="recipe.remix.revert" disabled={actions.busy.revert} onSelect={actions.revert}>
              <ItemIcon icon={Undo2} className="rtl:-scale-x-100" />
              {t("recipe.revertOriginal")}
            </Menu.Item>
          ) : null}
          {display.translated ? (
            <Menu.Item className={itemClass} data-track="recipe.show_original_language" onSelect={actions.showOriginalLanguage}>
              <ItemIcon icon={Languages} />
              {t("recipe.showOriginal")}
            </Menu.Item>
          ) : null}

          {onDelete ? (
            <>
              <Menu.Separator className="my-1.5 h-px bg-border" />
              <Menu.Item className={cn(itemClass, "text-danger")} data-track="recipe.delete" onSelect={onDelete}>
                <Trash2 aria-hidden className="h-[18px] w-[18px] shrink-0" />
                {t("common.delete")}
              </Menu.Item>
            </>
          ) : null}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
