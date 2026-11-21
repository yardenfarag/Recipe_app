"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { FolderPlus, Pencil, PenLine, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Recipe } from "@shared/types/recipe";

const itemClass =
  "relative flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[15px] text-text outline-none data-[highlighted]:bg-element";

export type RecipeActions = {
  onAddToCollection: (recipe: Recipe) => void;
  onRename: (recipe: Recipe) => void;
  onDelete: (recipe: Recipe) => void;
};

/**
 * What can be done with one recipe: add it to a collection, edit it, rename it, delete it. Opens from the "…"
 * button; arrow keys move, Enter chooses, Escape closes and puts focus back on the button.
 */
export function RecipeActionsMenu({
  recipe,
  title,
  actions,
  trigger,
}: {
  recipe: Recipe;
  title: string;
  actions: RecipeActions;
  trigger: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={t("a11y.recipeActionsFor", { name: title })}
          className="z-50 min-w-56 animate-pop-in rounded-2xl border border-frosted-border bg-surface p-1.5 shadow-lift"
        >
          <Menu.Item className={itemClass} onSelect={() => actions.onAddToCollection(recipe)}>
            <FolderPlus aria-hidden className="h-[18px] w-[18px] text-muted" />
            {t("library.addToCollection")}
          </Menu.Item>
          <Menu.Item asChild className={itemClass}>
            <Link href={`/recipe/${recipe.id}/edit`}>
              <PenLine aria-hidden className="h-[18px] w-[18px] text-muted" />
              {t("recipeEditor.titleEdit")}
            </Link>
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => actions.onRename(recipe)}>
            <Pencil aria-hidden className="h-[18px] w-[18px] text-muted" />
            {t("library.rename")}
          </Menu.Item>
          <Menu.Separator className="my-1.5 h-px bg-border" />
          <Menu.Item className={`${itemClass} text-danger`} onSelect={() => actions.onDelete(recipe)}>
            <Trash2 aria-hidden className="h-[18px] w-[18px]" />
            {t("common.delete")}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
