"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  allergyInstruction,
  avoidListIsEmpty,
  findAvoidMatches,
  hasAllergies,
  makeWithoutInstruction,
  type AvoidList,
  type AvoidMatches,
} from "@shared/lib/avoidList";
import { recipeAppliancesOf } from "@shared/lib/appliances";
import { scaleIngredients } from "@shared/lib/ingredientAmounts";
import { isRecipeLanguageCode, type RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import { recipeHasSource } from "@shared/lib/recipeOrigin";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import { applianceWorkaroundInstruction, checkKitchen } from "@shared/lib/ownedAppliances";
import type { RecipeCookedFrom } from "@shared/lib/productEvents";
import { normalizeRecipeTags } from "@shared/lib/recipeTags";
import type { RecipeVariantKey } from "@shared/lib/recipeVariants";
import { pantryItemsUsedBy } from "@shared/lib/pantry";
import { fetchPantryItems } from "@shared/lib/supabase/pantry";
import { setRecipeCooked, setRecipeTags } from "@shared/lib/supabase/recipes";
import type { PantryItem } from "@shared/types/pantry";
import type { SubstitutionAlternative } from "@shared/lib/supabase/suggestSubstitution";
import type { TransformedRecipePayload } from "@shared/lib/supabase/transformRecipe";
import { showToast } from "@shared/lib/toast";
import { joinErrorSentences } from "@shared/lib/translateAppError";
import type { Instruction, Recipe } from "@shared/types/recipe";

import { OutOfCreditsDialog } from "@/components/credits/OutOfCreditsDialog";
import { useLanguage } from "@/components/LanguageProvider";
import { AddToCollectionDialog } from "@/components/library/AddToCollectionDialog";
import { AddToShoppingListDialog } from "@/components/list/AddToShoppingListDialog";
import { UsedUpDialog } from "@/components/pantry/UsedUpDialog";
import { CookedNoteDialog } from "@/components/recipe/actions/CookedNoteDialog";
import { EditTagsDialog } from "@/components/recipe/actions/EditTagsDialog";
import { RecipeActionsContext, type Adaptation, type RecipeActions, type RecipeDialog } from "@/components/recipe/actions/RecipeActionsContext";
import { RemixSheet } from "@/components/recipe/actions/RemixSheet";
import { RepairDialog } from "@/components/recipe/actions/RepairDialog";
import { SwapDialog } from "@/components/recipe/actions/SwapDialog";
import { TranslateDialog } from "@/components/recipe/actions/TranslateDialog";
import { captureRecipeCooked } from "@/lib/analytics";
import { useRecipeRecalc } from "@/lib/editor/useRecipeRecalc";
import { useCollections } from "@/lib/library/useCollections";
import {
  keptOriginalOf,
  kitchenFixChange,
  promotedLanguage,
  remixChange,
  revertChange,
  shownOriginal,
  swapChange,
  type ContentChange,
  type OriginalContent,
} from "@/lib/recipe/actions/contentEdits";
import { saveRecipeContent } from "@/lib/recipe/actions/saveContent";
import { createSaveQueue } from "@/lib/recipe/actions/saveQueue";
import { shareRecipeLink } from "@/lib/recipe/actions/share";
import type { SwapTarget } from "@/lib/recipe/actions/swap";
import { translateFailure, translateRecipeTo, type TranslateOutcome } from "@/lib/recipe/actions/translate";
import { needsTranslation } from "@/lib/recipe/recipeDisplay";
import { useKitchenProfile } from "@/lib/recipe/useKitchenProfile";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import type { ReadyRecipe } from "@/lib/recipe/useRecipe";
import { useOwnedAppliances } from "@/lib/settings/ownedAppliances";

/** The text before a remix made on this visit, and the language it was in, for "Revert to original". */
/** This visit's adaptation. `original` carries the language it is in, so Revert saves it with the text (PIN-188). */
type Session = { original: OriginalContent; remix: { variant: RecipeVariantKey; summary: string } | null };

/**
 * Everything a saved recipe's page can do to it beyond reading (PIN-135): swap, remix, "Make it without these",
 * translate, repair, share, "I cooked this", tags, collections and the shopping list. Wraps the page's RecipeView;
 * the header, the ingredients, the notices and the action bar read it through `useRecipeActions`.
 *
 * Every change is saved before the page shows it, so an action that fails leaves the recipe as it was and says why.
 * "I cooked this" is the one exception: it shows at once and is put back if saving fails.
 */
export function RecipeActionsProvider({ state, children }: { state: ReadyRecipe; children: ReactNode }) {
  const { t } = useTranslation();
  const { language: appLanguage } = useLanguage();
  const { display, replaceRecipe, setView } = state;
  const { recipe } = display;
  const { system } = useMeasurementSystem();
  const { profile } = useKitchenProfile();
  const { kitchen } = useOwnedAppliances();
  const { collections, createCollection, setMembershipsForRecipe } = useCollections();

  const [dialog, setDialog] = useState<RecipeDialog | null>(null);
  const [creditsNeeded, setCreditsNeeded] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState({ share: false, revert: false, translate: false });
  const [queue] = useState(createSaveQueue);
  const [usedUp, setUsedUp] = useState<PantryItem[] | null>(null);
  const usedUpAfterNote = useRef<PantryItem[] | null>(null);
  // Whether the first-cook note is still open: the pantry may answer after it closes, and then asks straight away.
  const noteOpen = useRef(false);

  const updatingFields = useRecipeRecalc(recipe, (next) => replaceRecipe(next));

  const avoid = useMemo(() => (profile ? findAvoidMatches(display.ingredients.map((i) => i.name), profile) : null), [display.ingredients, profile]);
  // "My appliances" (PIN-155): a required appliance the reader doesn't have is worth fixing too.
  const missingAppliances = useMemo(() => checkKitchen(recipeAppliancesOf(recipe), kitchen).missing, [recipe, kitchen]);
  const canFix = Boolean((avoid && (avoid.allergies.length > 0 || avoid.dislikes.length > 0)) || missingAppliances.length > 0);
  const kitchenSetUp = useMemo(
    () => ({ avoid: Boolean(profile && !avoidListIsEmpty(profile)), appliances: kitchen !== null }),
    [profile, kitchen],
  );

  const close = () => setDialog(null);

  /** Saves a change to the text and puts the saved row on the page. Throws, leaving the page as it was. */
  const saveChange = (change: ContentChange) =>
    queue.run(async () => {
      const { saved, textChanged } = await saveRecipeContent(recipe, change);
      replaceRecipe(saved, { textChanged });
      return saved;
    });

  async function applySwap(target: SwapTarget, alternative: SubstitutionAlternative, instructions: Instruction[]) {
    await saveChange(swapChange(display, target.index, alternative, target.servingsShown, instructions));
    showToast(t("web.recipeActions.swapped", { from: target.ingredient.name, to: alternative.name }));
  }

  async function applyRemix(result: TransformedRecipePayload, variant: RecipeVariantKey | "fix") {
    const language = promotedLanguage(display);
    const before: Session = session ?? {
      original: (!language && keptOriginalOf(recipe)) || shownOriginal(display),
      remix: null,
    };
    if (variant === "fix") {
      await saveChange(kitchenFixChange(display, result, session?.original));
      setSession({ ...before, remix: null });
    } else {
      await saveChange(remixChange(display, result));
      setSession({ ...before, remix: { variant, summary: result.summary } });
    }
    showToast(t("web.recipeActions.updated"));
  }

  function revert() {
    const original = session?.original ?? recipe.kitchen_original;
    if (!original || busy.revert) return;
    setBusy((b) => ({ ...b, revert: true }));
    saveChange(revertChange(original, resolveRecipeSourceLanguage(recipe)))
      .then(() => {
        setSession(null);
        showToast(t("web.recipeActions.reverted"));
      })
      .catch(() => showToast(t("web.recipeActions.saveFailed"), "error"))
      .finally(() => setBusy((b) => ({ ...b, revert: false })));
  }

  function share() {
    if (busy.share) return;
    setBusy((b) => ({ ...b, share: true }));
    shareRecipeLink(recipe, display.title)
      .then((outcome) => {
        if (outcome === "copied") showToast(t("recipe.linkCopied"));
        else if (outcome === "failed") showToast(joinErrorSentences(t("recipe.shareFailedTitle"), t("common.tryAgain")), "error");
      })
      .finally(() => setBusy((b) => ({ ...b, share: false })));
  }

  /** Shows at once; put back with a message if saving fails. The first time, asks for a note (as on mobile). */
  function markCooked(from: RecipeCookedFrom = "recipe") {
    const before = { last_cooked_at: recipe.last_cooked_at, cook_note: recipe.cook_note };
    const at = new Date().toISOString();
    // Cooking is what makes people save (and come back for) more recipes, so it is the number to watch.
    captureRecipeCooked({ from, again: Boolean(before.last_cooked_at) });
    replaceRecipe((current) => ({ ...current, last_cooked_at: at }));
    const firstTime = !before.last_cooked_at;
    if (firstTime) {
      noteOpen.current = true;
      setDialog({ kind: "note" });
    } else showToast(t("web.recipeActions.markedCooked"));
    // Then: did it use anything up? (PIN-181) After the note, when there is one. A pantry that can't be read just
    // means no question.
    fetchPantryItems()
      .then((items) => {
        const used = pantryItemsUsedBy(display, items);
        if (used.length === 0) return;
        if (noteOpen.current) usedUpAfterNote.current = used;
        else setUsedUp(used);
      })
      .catch(() => undefined);
    queue.run(() => setRecipeCooked(recipe.id, { last_cooked_at: at, cook_note: before.cook_note ?? null })).catch(() => {
      replaceRecipe((current) => ({ ...current, ...before }));
      showToast(t("recipe.cookedSaveFailed"), "error");
    });
  }

  async function saveNote(note: string) {
    const at = recipe.last_cooked_at ?? new Date().toISOString();
    const saved = await queue.run(() => setRecipeCooked(recipe.id, { last_cooked_at: at, cook_note: note }));
    replaceRecipe((current) => ({ ...current, last_cooked_at: saved.last_cooked_at ?? at, cook_note: saved.cook_note ?? undefined }));
  }

  async function saveTags(tags: string[]) {
    const normalized = normalizeRecipeTags(tags);
    await queue.run(() => setRecipeTags(recipe.id, normalized));
    replaceRecipe((current) => {
      const locked = current.locked_fields ?? [];
      return { ...current, tags: normalized, locked_fields: locked.includes("tags") ? locked : [...locked, "tags"] };
    });
  }

  async function translate(language: RecipeLanguageCode): Promise<TranslateOutcome> {
    const outcome = await translateRecipeTo(recipe, language);
    if (outcome.status === "source") setView({ kind: "source" });
    else if (outcome.status === "ok") setView({ kind: "language", language, translation: outcome.content });
    return outcome;
  }

  const showOriginalLanguage = () => setView({ kind: "source" });

  const translateOffer: RecipeLanguageCode | null =
    !display.translated && isRecipeLanguageCode(appLanguage) && needsTranslation(recipe, appLanguage) && state.view.kind !== "source"
      ? appLanguage
      : null;

  function translateToAppLanguage() {
    if (!translateOffer || busy.translate) return;
    setBusy((b) => ({ ...b, translate: true }));
    translate(translateOffer)
      .then((outcome) => {
        if (outcome.status === "failed") showToast(translateFailure(outcome, t, appLanguage), "error");
      })
      .catch(() => showToast(t("web.recipeActions.translateFailed"), "error"))
      .finally(() => setBusy((b) => ({ ...b, translate: false })));
  }

  // Opening a recipe written in another language shows it in the app's, as on mobile: a saved translation, else
  // one made now (free, within a daily limit) and saved for next time. Tried once per recipe and language; if it
  // fails, the notice keeps its Translate button to try again.
  const autoTranslated = useRef<string | null>(null);
  const translateToAppLanguageLatest = useRef(translateToAppLanguage);
  useEffect(() => {
    translateToAppLanguageLatest.current = translateToAppLanguage;
  });
  useEffect(() => {
    if (!translateOffer) return;
    const key = `${recipe.id}:${translateOffer}`;
    if (autoTranslated.current === key) return;
    autoTranslated.current = key;
    translateToAppLanguageLatest.current();
  }, [recipe.id, translateOffer]);

  const keptSummary = recipe.kitchen_adapted_summary?.trim() || null;
  const adaptation: Adaptation | null = session?.remix
    ? { kind: "remix", ...session.remix }
    : keptSummary || recipe.kitchen_original
      ? { kind: "kitchen", summary: keptSummary }
      : null;

  const value: RecipeActions = {
    display,
    updatingFields,
    collections,
    adaptation,
    canRevert: Boolean(session?.original ?? recipe.kitchen_original),
    canRepair: recipe.extraction_status === "partial" && recipeHasSource(recipe),
    canFix,
    kitchenSetUp,
    translateOffer,
    busy: { ...busy, repair: dialog?.kind === "repair" },
    open: setDialog,
    share,
    markCooked,
    revert,
    showOriginalLanguage,
    translateToAppLanguage,
  };

  const kind = dialog?.kind ?? null;
  return (
    <RecipeActionsContext.Provider value={value}>
      {children}

      <SwapDialog
        target={dialog?.kind === "swap" ? dialog.target : null}
        display={display}
        system={system}
        onClose={close}
        onApply={applySwap}
      />
      <RemixSheet
        open={kind === "remix" || kind === "fix"}
        preset={
          kind === "fix"
            ? makeWithoutInstruction(profile ?? EMPTY_AVOID, avoid ?? EMPTY_MATCHES, applianceWorkaroundInstruction(missingAppliances, kitchen))
            : null
        }
        allergies={profile ? allergyInstruction(profile) : null}
        notice={profile && hasAllergies(profile) ? t("avoid.checkLabels") : undefined}
        display={display}
        onClose={close}
        onApply={(result, variant, fix) => applyRemix(result, fix ? "fix" : variant)}
        onOutOfCredits={(needed) => setCreditsNeeded(needed ?? 0)}
      />
      <TranslateDialog open={kind === "translate"} display={display} onClose={close} onTranslate={translate} onShowOriginal={showOriginalLanguage} />
      <EditTagsDialog open={kind === "tags"} tags={recipe.tags ?? []} onClose={close} onSave={saveTags} />
      <CookedNoteDialog
        open={kind === "note"}
        initialNote={recipe.cook_note ?? ""}
        onClose={() => {
          noteOpen.current = false;
          close();
          if (usedUpAfterNote.current) {
            setUsedUp(usedUpAfterNote.current);
            usedUpAfterNote.current = null;
          }
        }}
        onSave={saveNote}
      />
      <UsedUpDialog items={usedUp} onClose={() => setUsedUp(null)} />
      <RepairDialog
        open={kind === "repair"}
        recipe={recipe}
        onClose={close}
        onRepaired={(change) => saveChange(change).then(() => setSession(null))}
        onOutOfCredits={(needed) => {
          close();
          setCreditsNeeded(needed);
        }}
      />
      <AddToCollectionDialog
        recipe={kind === "collection" ? withDisplayTitle(recipe, display.title) : null}
        collections={collections}
        onClose={close}
        onCreate={createCollection}
        onSave={setMembershipsForRecipe}
      />
      <AddToShoppingListDialog
        open={kind === "list"}
        onOpenChange={(open) => !open && close()}
        recipeId={recipe.id}
        recipeTitle={display.title}
        ingredients={dialog?.kind === "list" ? missingFor(display, dialog.servings, dialog.have) : []}
        system={system}
        unitLanguage={display.unitLanguage}
      />
      <OutOfCreditsDialog
        open={creditsNeeded !== null}
        onOpenChange={(open) => !open && setCreditsNeeded(null)}
        needed={creditsNeeded || undefined}
      />
    </RecipeActionsContext.Provider>
  );
}

const EMPTY_AVOID: AvoidList = { allergies: [], otherAllergies: [], dislikes: [] };
const EMPTY_MATCHES: AvoidMatches = { allergies: [], dislikes: [], byIngredient: [] };

function withDisplayTitle(recipe: Recipe, title: string): Recipe {
  return { ...recipe, display_title: title };
}


/** The ingredients at the servings on screen, without the ones the cook ticked as already at home (unless that is all of them). */
function missingFor(display: { ingredients: Recipe["ingredients"]; recipe: Recipe }, servings: number, have: number[] = []) {
  const scaled = scaleIngredients(display.ingredients, display.recipe.servings, servings);
  const missing = scaled.filter((_, index) => !have.includes(index));
  return missing.length > 0 ? missing : scaled;
}
