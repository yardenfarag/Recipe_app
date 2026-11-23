"use client";

import { Check, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { translateAppError } from "@shared/lib/translateAppError";
import { isCollectionNameTaken } from "@shared/lib/uniqueNames";
import type { RecipeCollection } from "@shared/types/collection";
import type { Recipe } from "@shared/types/recipe";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

/**
 * Pick which collections a recipe is in. Ticking is only a draft until Save, as on mobile. A new collection can be
 * made right here and is ticked for this recipe.
 */
export function AddToCollectionDialog({
  recipe,
  collections,
  onClose,
  onCreate,
  onSave,
}: {
  recipe: Recipe | null;
  collections: RecipeCollection[];
  onClose: () => void;
  onCreate: (name: string) => Promise<RecipeCollection>;
  onSave: (recipeId: string, collectionIds: string[]) => Promise<void>;
}) {
  return (
    <Dialog open={recipe != null} onOpenChange={(open) => !open && onClose()}>
      {recipe ? <Body key={recipe.id} recipe={recipe} collections={collections} onClose={onClose} onCreate={onCreate} onSave={onSave} /> : null}
    </Dialog>
  );
}

function Body({
  recipe,
  collections,
  onClose,
  onCreate,
  onSave,
}: {
  recipe: Recipe;
  collections: RecipeCollection[];
  onClose: () => void;
  onCreate: (name: string) => Promise<RecipeCollection>;
  onSave: (recipeId: string, collectionIds: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(() => new Set(collections.filter((c) => c.recipeIds.includes(recipe.id)).map((c) => c.id)));
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setNameError(t("library.collectionNameRequired"));
      return;
    }
    if (isCollectionNameTaken(collections, name)) {
      setNameError(t("library.collectionNameTaken"));
      return;
    }
    setCreating(true);
    try {
      const created = await onCreate(name);
      setChecked((previous) => new Set([...previous, created.id]));
      setNewName("");
    } catch (caught) {
      setNameError(translateAppError(caught, t));
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(recipe.id, [...checked]);
      onClose();
    } catch (caught) {
      setSaveError(translateAppError(caught, t));
    } finally {
      setSaving(false);
    }
  }

  const count = (collection: RecipeCollection) => t("library.recipeCount", { count: collection.recipeIds.length });

  return (
    <DialogContent
      title={t("library.addToCollection")}
      description={recipe.display_title ?? recipe.title}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" trackId="add_to_collection.cancel" disabled={saving}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          {/* Not while a new collection is still being made: it would be saved without it. */}
          <Button trackId="add_to_collection.save" busy={saving} disabled={creating} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {collections.length === 0 ? (
        <p className="text-[15px] text-muted">{t("library.noCollectionsYet")}</p>
      ) : (
        <ul className="-mx-1 flex max-h-64 flex-col gap-1 overflow-y-auto px-1">
          {collections.map((collection) => {
            const on = checked.has(collection.id);
            return (
              <li key={collection.id}>
                <button
                  type="button"
                  role="checkbox"
                  data-track="add_to_collection.collection.toggle"
                  aria-checked={on}
                  onClick={() => toggle(collection.id)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-start transition-colors hover:bg-element"
                >
                  <span
                    aria-hidden
                    className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors", on ? "border-primary bg-primary text-on-primary" : "border-border")}
                  >
                    {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text">{collection.name}</span>
                    <span className="block text-[13px] text-muted">{count(collection)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={create} noValidate className="mt-4 border-t border-border pt-4">
        <label htmlFor="new-collection-name" className="text-sm font-semibold text-text">
          {t("library.newCollection")}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="new-collection-name"
            value={newName}
            maxLength={80}
            autoComplete="off"
            placeholder={t("library.collectionNamePlaceholder")}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "new-collection-error" : undefined}
            onChange={(event) => {
              setNewName(event.target.value);
              setNameError(null);
            }}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-2xl border bg-surface px-4 text-[15px] text-text placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15",
              nameError ? "border-danger" : "border-border",
            )}
          />
          <Button type="submit" variant="secondary" trackId="add_to_collection.create" busy={creating} aria-label={t("a11y.createCollection")}>
            <Plus aria-hidden className="h-4 w-4" />
            {t("library.new")}
          </Button>
        </div>
        {nameError ? (
          <p id="new-collection-error" className="mt-1.5 text-sm font-medium text-danger">
            {nameError}
          </p>
        ) : null}
      </form>
      {saveError ? <p className="mt-3 text-sm font-medium text-danger">{saveError}</p> : null}
    </DialogContent>
  );
}
