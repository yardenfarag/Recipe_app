"use client";

import { ChevronDown, ChevronUp, Download, GripVertical, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CookbookPageSize } from "@shared/lib/cookbook/buildCookbookHtml";
import type { Recipe } from "@shared/types/recipe";

import { CoverPreview } from "@/components/cookbook/CoverPreview";
import { recipeTitle } from "@/components/cookbook/RecipePicker";
import { RecipeThumb } from "@/components/cookbook/RecipeThumb";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";

type FocusTarget = { id: string; control: "up" | "down" | "remove" } | { id: null };

/** Where the title field is, so the screen can put the cursor in it when the title is missing. */
export const COOKBOOK_TITLE_FIELD = "cookbook-title-field";

export type BookPanelProps = {
  title: string;
  onTitleChange: (title: string) => void;
  titleError?: string | null;
  pageSize: CookbookPageSize;
  onPageSizeChange: (size: CookbookPageSize) => void;
  includePhotos: boolean;
  onIncludePhotosChange: (include: boolean) => void;
  /** The book's recipes, in book order. */
  recipes: Recipe[];
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCreate: () => void;
  /** Says what is missing ("Pick at least one recipe.") after Create was pressed. */
  createError?: string | null;
  busy?: boolean;
};

/**
 * The book itself: its cover (title, a picture of it), the paper and photo options, and its recipes in order, to
 * drag or move with the arrow buttons. Ends with the one button that makes it. Stays in view beside the list on a
 * wide screen.
 */
export function BookPanel(props: BookPanelProps) {
  const { t } = useTranslation();
  const { recipes } = props;
  const [announcement, setAnnouncement] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  // After a move or a removal the list re-renders; focus goes back where the keyboard was.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.id == null) {
      heading.current?.focus();
      return;
    }
    const index = recipes.findIndex((recipe) => recipe.id === target.id);
    const last = recipes.length - 1;
    // At the top, "up" is disabled: stay on the same row with "down" (and the other way round).
    const control = target.control === "up" && index === 0 ? "down" : target.control === "down" && index === last ? "up" : target.control;
    const find = (name: string) => list.current?.querySelector<HTMLButtonElement>(`[data-focus-key="${target.id}:${name}"]`);
    (find(control) ?? find("remove"))?.focus();
  }, [recipes]);

  function move(from: number, to: number, control?: "up" | "down") {
    const recipe = recipes[from];
    if (!recipe || to < 0 || to >= recipes.length || from === to) return;
    if (control) pendingFocus.current = { id: recipe.id, control };
    props.onMove(from, to);
    setAnnouncement(t("web.cookbook.moved", { name: recipeTitle(recipe), position: to + 1, total: recipes.length }));
  }

  function remove(index: number) {
    const recipe = recipes[index];
    if (!recipe) return;
    const next = recipes[index + 1] ?? recipes[index - 1];
    pendingFocus.current = next ? { id: next.id, control: "remove" } : { id: null };
    props.onRemove(recipe.id);
    setAnnouncement(t("web.cookbook.removed", { name: recipeTitle(recipe) }));
  }

  const count = recipes.length;

  return (
    <Tile className="flex min-h-0 flex-col p-5 lg:max-h-[calc(100dvh-3.5rem)]">
      <h2 id="cookbook-book-heading" className="text-xl font-bold text-text">
        {t("web.cookbook.yourBook")}
      </h2>

      <div className="mt-4 flex items-start gap-4">
        <CoverPreview title={props.title} count={count} pageSize={props.pageSize} className="w-[84px]" />
        <div id={COOKBOOK_TITLE_FIELD} className="min-w-0 flex-1">
          <TextField
            label={t("cookbook.titlePlaceholder")}
            hint={t("cookbook.titleStepHint")}
            error={props.titleError ?? undefined}
            value={props.title}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
        </div>
      </div>

      {/* One under the other beside the list: side by side there, "Carta (EE. UU.)" would not fit its half. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <fieldset className="min-w-0">
          <legend className="text-sm font-semibold text-text">{t("web.cookbook.paperSize")}</legend>
          <SegmentedControl
            label={t("web.cookbook.paperSize")}
            value={props.pageSize}
            onChange={props.onPageSizeChange}
            className="mt-2"
            options={[
              { value: "a4", label: t("web.cookbook.paperA4"), trackId: "cookbook.paper_size.a4" },
              { value: "letter", label: t("web.cookbook.paperLetter"), trackId: "cookbook.paper_size.letter" },
            ]}
          />
        </fieldset>
        <div>
          <span id="cookbook-photos-label" className="text-sm font-semibold text-text">
            {t("web.cookbook.photos")}
          </span>
          <div className="mt-2 flex h-11 items-center gap-3">
            <button
              type="button"
              role="switch"
              data-track="cookbook.include_photos.toggle"
              aria-checked={props.includePhotos}
              aria-labelledby="cookbook-photos-label"
              aria-describedby="cookbook-photos-hint"
              onClick={() => props.onIncludePhotosChange(!props.includePhotos)}
              className={cn(
                // The ::after widens the place a finger can land to 44 px without making the switch itself bigger.
                "relative h-7 w-12 shrink-0 rounded-full transition-colors after:absolute after:-inset-2",
                props.includePhotos ? "bg-primary" : "bg-text/25",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full transition-[inset-inline-start] duration-150",
                  props.includePhotos ? "start-6 bg-on-primary" : "start-1 bg-surface",
                )}
              />
            </button>
            <span id="cookbook-photos-hint" className="text-[13px] leading-snug text-muted">
              {t("web.cookbook.photosHint")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex min-h-10 items-center justify-between gap-3 border-t border-border pt-4">
        <h3 ref={heading} tabIndex={-1} className="text-lg font-bold text-text outline-none">
          {t("web.cookbook.contents")}{" "}
          <span className="font-semibold text-muted tabular-nums">({count})</span>
        </h3>
        {count > 0 ? (
          <Button variant="ghost" size="sm" trackId="cookbook.book.clear" aria-label={t("a11y.clearSelectedRecipes")} onClick={props.onClear}>
            {t("list.clearSelection")}
          </Button>
        ) : null}
      </div>
      {count > 0 ? <p className="mt-1 text-[13px] text-muted">{t("cookbook.reviewStepHint")}</p> : null}

      {count === 0 ? (
        <p className="mt-3 rounded-2xl bg-element px-4 py-6 text-center text-sm leading-relaxed text-muted">
          {t("web.cookbook.emptyBook")}
        </p>
      ) : (
        <ol ref={list} className="-mx-2 mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-1" aria-labelledby="cookbook-book-heading">
          {recipes.map((recipe, index) => {
            const name = recipeTitle(recipe);
            return (
              <li
                key={recipe.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", recipe.id);
                  setDragFrom(index);
                }}
                onDragOver={(event) => {
                  if (dragFrom == null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dragOver !== index) setDragOver(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragFrom != null) move(dragFrom, index);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={cn(
                  "group flex min-h-14 items-center gap-2 rounded-2xl border border-transparent py-1.5 ps-1 pe-1 transition-colors hover:bg-element",
                  dragFrom === index && "opacity-50",
                  dragOver === index && dragFrom !== index && "border-primary bg-element",
                )}
              >
                <span title={t("web.cookbook.dragToReorder")} className="hidden cursor-grab text-muted active:cursor-grabbing [@media(hover:hover)]:block">
                  <GripVertical aria-hidden className="h-4 w-4" />
                </span>
                <span aria-hidden className="w-5 shrink-0 text-center text-xs font-bold text-muted tabular-nums">
                  {index + 1}
                </span>
                <RecipeThumb src={recipe.image_url} className="h-10 w-10" />
                <span className="min-w-0 flex-1 text-sm leading-snug font-semibold text-text">
                  <span className="sr-only">{index + 1}. </span>
                  <span className="line-clamp-2">{name}</span>
                </span>
                <span className="flex shrink-0 items-center transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                  <IconButton
                    data-focus-key={`${recipe.id}:up`}
                    trackId="cookbook.book.move_up"
                    label={t("a11y.moveRecipeUp", { name })}
                    tooltip={false}
                    icon={<ChevronUp aria-hidden className="h-4 w-4" />}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1, "up")}
                    className={rowButton}
                  />
                  <IconButton
                    data-focus-key={`${recipe.id}:down`}
                    trackId="cookbook.book.move_down"
                    label={t("a11y.moveRecipeDown", { name })}
                    tooltip={false}
                    icon={<ChevronDown aria-hidden className="h-4 w-4" />}
                    disabled={index === count - 1}
                    onClick={() => move(index, index + 1, "down")}
                    className={rowButton}
                  />
                  <IconButton
                    data-focus-key={`${recipe.id}:remove`}
                    trackId="cookbook.book.remove"
                    label={t("a11y.removeItem", { item: name })}
                    tooltip={false}
                    icon={<X aria-hidden className="h-4 w-4" />}
                    onClick={() => remove(index)}
                    className={cn(rowButton, "hover:text-danger")}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="mt-4 border-t border-border pt-4">
        {props.createError ? (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {props.createError}
          </p>
        ) : null}
        <Button size="lg" fullWidth trackId="cookbook.create" busy={props.busy} onClick={props.onCreate}>
          <Download aria-hidden className="h-5 w-5" />
          {t("cookbook.generate")}
        </Button>
        <p className="mt-2.5 text-center text-[13px] text-muted">{t("web.cookbook.createHint")}</p>
      </div>
    </Tile>
  );
}

/**
 * The move and remove buttons of a row: three sit side by side in a narrow panel, so under a mouse they are 36 px;
 * under a finger they are the kit's 44.
 */
const rowButton = "h-9 w-9 hover:bg-selected pointer-coarse:h-11 pointer-coarse:w-11";
