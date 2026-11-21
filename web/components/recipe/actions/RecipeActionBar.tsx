"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  ChefHat,
  Ellipsis,
  FolderPlus,
  Languages,
  NotebookPen,
  PencilLine,
  Share2,
  Tags,
  Undo2,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";

import type { RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const itemClass =
  "relative flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-text outline-none data-[highlighted]:bg-element data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

function ItemIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <Icon aria-hidden className={cn("h-[18px] w-[18px] shrink-0 text-muted", className)} />;
}

/**
 * The saved recipe's actions, under its notices: Remix, Translate and "I cooked this" as buttons, everything else
 * in "More". Each button opens its dialog, and focus comes back to the button when the dialog closes. Swap sits on
 * each ingredient, Add to list on the ingredients, Edit and Share beside the title.
 */
export function RecipeActionBar({ actions }: { actions: RecipeActions }) {
  const { t } = useTranslation();
  const { display } = actions;
  const { recipe } = display;
  const cooked = Boolean(recipe.last_cooked_at);

  return (
    <div role="group" aria-label={t("a11y.recipeActionsFor", { name: display.title })} className="mb-6 flex flex-wrap items-center gap-2">
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => actions.open({ kind: "remix" })}>
        <WandSparkles aria-hidden className="h-[18px] w-[18px]" />
        {t("recipe.remix")}
      </Button>
      <Button variant="outline" aria-haspopup="dialog" onClick={() => actions.open({ kind: "translate" })}>
        <Languages aria-hidden className="h-[18px] w-[18px] text-primary" />
        {t("recipe.translate")}
      </Button>
      <Button variant="outline" onClick={actions.markCooked}>
        <ChefHat aria-hidden className="h-[18px] w-[18px] text-primary" />
        {cooked ? t("recipe.cookedAgain") : t("recipe.cookedAction")}
      </Button>
      <MoreMenu actions={actions} />
    </div>
  );
}

const MoreButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(function MoreButton(props, ref) {
  const { t } = useTranslation();
  return (
    <Button ref={ref} variant="outline" aria-label={t("a11y.moreOptions")} className="px-3.5" {...props}>
      <Ellipsis aria-hidden className="h-5 w-5" />
      <span aria-hidden className="max-sm:sr-only">
        {t("web.recipeActions.more")}
      </span>
    </Button>
  );
});

/** Arrow keys move, Enter chooses, Escape closes and puts focus back on the button. */
function MoreMenu({ actions }: { actions: RecipeActions }) {
  const { t } = useTranslation();
  const { display } = actions;
  const { recipe } = display;
  const tagCount = recipe.tags?.length ?? 0;
  const fixes = actions.canFix || actions.canRepair || actions.canRevert || display.translated;

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <MoreButton />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={t("a11y.recipeActionsFor", { name: display.title })}
          className="z-50 min-w-60 animate-pop-in rounded-2xl border border-frosted-border bg-surface p-1.5 shadow-lift"
        >
          <Menu.Item asChild className={itemClass}>
            <Link href={`/recipe/edit?id=${encodeURIComponent(recipe.id)}`}>
              <ItemIcon icon={PencilLine} className="rtl:-scale-x-100" />
              {t("recipeEditor.titleEdit")}
            </Link>
          </Menu.Item>
          <Menu.Item className={itemClass} disabled={actions.busy.share} onSelect={actions.share}>
            <ItemIcon icon={Share2} />
            {t("recipe.share")}
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => actions.open({ kind: "collection" })}>
            <ItemIcon icon={FolderPlus} />
            {t("library.addToCollection")}
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => actions.open({ kind: "tags" })}>
            <ItemIcon icon={Tags} />
            {tagCount > 0 ? t("tags.editTitle") : t("tags.addTags")}
          </Menu.Item>
          {recipe.last_cooked_at ? (
            <Menu.Item className={itemClass} onSelect={() => actions.open({ kind: "note" })}>
              <ItemIcon icon={NotebookPen} />
              {t("recipe.cookedNoteTitle")}
            </Menu.Item>
          ) : null}

          {fixes ? <Menu.Separator className="my-1.5 h-px bg-border" /> : null}
          {actions.canFix ? (
            <Menu.Item className={itemClass} onSelect={() => actions.open({ kind: "fix" })}>
              <ItemIcon icon={WandSparkles} />
              {t("avoid.makeWithout")}
            </Menu.Item>
          ) : null}
          {actions.canRepair ? (
            <Menu.Item className={itemClass} disabled={actions.busy.repair} onSelect={() => actions.open({ kind: "repair" })}>
              <ItemIcon icon={Wrench} />
              <span className="flex flex-col">
                {t("recipe.repairAction")}
                <span className="text-xs text-muted">{t("recipe.repairHint")}</span>
              </span>
            </Menu.Item>
          ) : null}
          {actions.canRevert ? (
            <Menu.Item className={itemClass} disabled={actions.busy.revert} onSelect={actions.revert}>
              <ItemIcon icon={Undo2} className="rtl:-scale-x-100" />
              {t("recipe.revertOriginal")}
            </Menu.Item>
          ) : null}
          {display.translated ? (
            <Menu.Item className={itemClass} onSelect={actions.showOriginalLanguage}>
              <ItemIcon icon={Languages} />
              {t("recipe.showOriginal")}
            </Menu.Item>
          ) : null}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
