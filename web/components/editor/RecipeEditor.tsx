"use client";

import { CircleAlert, ExternalLink, ImageUp, Minus, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { COST_I18N_KEYS } from "@shared/lib/formatCostEstimate";
import * as editor from "@shared/lib/recipeEditor";
import type { EditorErrors, ErrorTarget, RecipeEditorState } from "@shared/lib/recipeEditor";
import { RECIPE_LIMITS } from "@shared/lib/recipeLimits";
import { saveRecipeEdit } from "@shared/lib/supabase/saveRecipeEdit";
import { showToast } from "@shared/lib/toast";
import type { CostEstimate, EffortLevel, LockedField } from "@shared/types/recipe";

import { useLanguage } from "@/components/LanguageProvider";
import { AppliancesField } from "@/components/editor/AppliancesField";
import { CharCount, EditorCard, FieldLabel, FieldMessage, inputClasses, LockedNote, useEditorMessage } from "@/components/editor/parts";
import { PhotoField } from "@/components/editor/PhotoField";
import { ReorderableList } from "@/components/editor/ReorderableList";
import { IngredientRowEditor, StepRowEditor } from "@/components/editor/RowEditors";
import { TagsField } from "@/components/editor/TagsField";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { FIELD_IDS, focusById, ingredientFieldId, stepFieldId } from "@/lib/editor/fieldIds";
import { clearImportDraft } from "@/lib/editor/importDraft";
import { dragHasFiles, imageFileFrom, photoFromFile, photoPreviewSrc } from "@/lib/editor/photoFile";
import { parseIngredientPaste, parseStepPaste } from "@/lib/editor/pasteRows";
import { insertIngredientAfter, insertStepAfter, pasteIngredients, pasteSteps } from "@/lib/editor/rows";
import { useLeaveGuard } from "@/lib/editor/useLeaveGuard";
import { firstErrorFieldId, visibleErrors } from "@/lib/editor/visibleErrors";

type Banner = { tone: "error" | "info"; text: string };

function sourceHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

const subscribeNothing = () => () => {};
/** "⌘S" on a Mac, "Ctrl+S" elsewhere. */
function useSaveShortcut(): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘S" : "Ctrl+S"),
    () => "Ctrl+S",
  );
}

/** Leaves the editor: back where the cook came from, or to the recipe (or the Library) when there is no "back". */
function useLeave(recipeId: string | null) {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace(recipeId ? `/recipe/${recipeId}` : "/");
  }, [recipeId, router]);
}

/**
 * Edit recipe and Write a recipe (PIN-137, ADR 018) on the web. The form's rules live in shared/lib/recipeEditor.ts,
 * as on mobile; this lays them out for a big screen (the recipe on the left, its photo and details on the right) and
 * for the keyboard: Tab through every field, Enter for the next row, Alt+↑/↓ to reorder, Ctrl/⌘+S to save.
 */
export function RecipeEditor({ initial }: { initial: RecipeEditorState }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { language } = useLanguage();
  const format = useEditorMessage();
  const shortcut = useSaveShortcut();
  const leave = useLeave(initial.recipeId);

  const [state, setState] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<EditorErrors>(editor.noErrors);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  /** Asking before throwing changes away; holds what to do on "Discard". */
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  /**
   * A field to focus once the render that adds it is done (a new row, the first error). A partial import starts on
   * the empty row of what the source left out, as mobile scrolls to it.
   */
  const pendingFocus = useRef<string | null>(firstMissingFieldId(initial));

  const dirty = editor.needsDiscardConfirm(state);
  const errors = useMemo(() => visibleErrors(state, attempted, serverErrors), [state, attempted, serverErrors]);
  const locked = useMemo(() => new Set(editor.lockedFields(state)), [state]);
  const busy = saving || leaving;

  const { release } = useLeaveGuard(dirty && !leaving, (proceed) => setPendingLeave(() => proceed));

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id && focusById(id)) pendingFocus.current = null;
  });

  /** Applies an edit and clears the server's message attached to that place. */
  const change = useCallback((update: (s: RecipeEditorState) => RecipeEditorState, target?: ErrorTarget) => {
    setState(update);
    if (target) setServerErrors((previous) => editor.withoutError(previous, target));
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Photo: chosen, dropped anywhere on the page, or pasted.

  const takePhoto = useCallback(
    async (file: File) => {
      setPhotoError(null);
      setPhotoBusy(true);
      const result = await photoFromFile(file);
      setPhotoBusy(false);
      if (!result.ok) {
        setPhotoError(result.reason === "not_image" ? t("web.snap.notAnImage") : t("snap.photoTooLarge"));
        return;
      }
      change((s) => editor.setPhoto(s, result.photo), { field: "photo" });
    },
    [change, t],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busy || document.querySelector("[role=dialog]")) return;
      const file = imageFileFrom(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      void takePhoto(file);
    };
    let depth = 0;
    const onEnter = (event: DragEvent) => {
      if (busy || !dragHasFiles(event.dataTransfer)) return;
      depth += 1;
      setDraggingFile(true);
    };
    const onOver = (event: DragEvent) => {
      if (busy || !dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDraggingFile(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDraggingFile(false);
      if (busy || !dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file) void takePhoto(file);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [busy, takePhoto]);

  // ---------------------------------------------------------------------------------------------
  // Rows

  function nextIngredient(rowId: string) {
    const index = state.ingredients.findIndex((row) => row.id === rowId);
    const following = state.ingredients[index + 1];
    // The row after this one when it is still empty; otherwise a new one right here.
    if (following && !following.name.trim() && !following.quantity.trim() && !following.unit.trim()) {
      focusById(ingredientFieldId(following.id, "quantity"));
      return;
    }
    const inserted = insertIngredientAfter(state, rowId);
    pendingFocus.current = ingredientFieldId(inserted.id, "quantity");
    change(() => inserted.state, { field: "ingredients" });
  }

  function addIngredientAtEnd() {
    const inserted = insertIngredientAfter(state, null);
    pendingFocus.current = ingredientFieldId(inserted.id, "quantity");
    change(() => inserted.state, { field: "ingredients" });
  }

  function removeIngredient(rowId: string, focusNeighbour: boolean) {
    const index = state.ingredients.findIndex((row) => row.id === rowId);
    const neighbour = state.ingredients[index - 1] ?? state.ingredients[index + 1];
    if (focusNeighbour) pendingFocus.current = neighbour ? ingredientFieldId(neighbour.id, "name") : FIELD_IDS.ingredients;
    else if (!neighbour) pendingFocus.current = FIELD_IDS.ingredients;
    change((s) => editor.removeIngredient(s, rowId), { ingredientRow: rowId });
  }

  function nextStep(rowId: string) {
    const index = state.steps.findIndex((row) => row.id === rowId);
    const following = state.steps[index + 1];
    if (following && !following.text.trim()) {
      focusById(stepFieldId(following.id));
      return;
    }
    const inserted = insertStepAfter(state, rowId);
    pendingFocus.current = stepFieldId(inserted.id);
    change(() => inserted.state, { field: "steps" });
  }

  function addStepAtEnd() {
    const inserted = insertStepAfter(state, null);
    pendingFocus.current = stepFieldId(inserted.id);
    change(() => inserted.state, { field: "steps" });
  }

  function removeStep(rowId: string, focusNeighbour: boolean) {
    const index = state.steps.findIndex((row) => row.id === rowId);
    const neighbour = state.steps[index - 1] ?? state.steps[index + 1];
    if (focusNeighbour) pendingFocus.current = neighbour ? stepFieldId(neighbour.id) : FIELD_IDS.steps;
    else if (!neighbour) pendingFocus.current = FIELD_IDS.steps;
    change((s) => editor.removeStep(s, rowId), { stepRow: rowId });
  }

  // ---------------------------------------------------------------------------------------------
  // Save and leave

  function goTo(exit: () => void) {
    release();
    setLeaving(true);
    exit();
  }

  function cancel() {
    if (busy) return;
    if (dirty) setPendingLeave(() => leave);
    else goTo(leave);
  }

  /** Focus goes to the first thing to fix, after the render that shows the errors. */
  function showFirstError(next: EditorErrors) {
    pendingFocus.current = firstErrorFieldId(next, state);
  }

  async function save() {
    if (busy) return;
    setAttempted(true);
    setBanner(null);
    if (state.mode === "edit" && state.recipeId && !editor.hasChanges(state)) {
      const id = state.recipeId;
      goTo(() => router.replace(`/recipe/${id}`));
      return;
    }
    const built = editor.buildSaveRequest(state, language);
    if (!built.ok) {
      setServerErrors(editor.noErrors());
      setBanner({ tone: "error", text: t("web.editor.fixErrors") });
      showFirstError(visibleErrors(state, true, editor.noErrors()));
      return;
    }
    setSaving(true);
    const result = await saveRecipeEdit(built.request);
    setSaving(false);

    switch (result.status) {
      case "saved": {
        const text =
          result.recalculation === "limited"
            ? t("recipeEditor.limited")
            : result.recalculating.length > 0
              ? t("web.editor.savedUpdating")
              : t("web.editor.saved");
        showToast(text, result.recalculation === "limited" ? "info" : "success");
        if (state.mode === "import") clearImportDraft();
        const id = result.recipe.id;
        goTo(() => router.replace(`/recipe/${id}`));
        return;
      }
      case "blocked": {
        const next = editor.errorsFromBlockReasons(result.reasons, built.rows, state);
        setServerErrors(next);
        setBanner({ tone: "error", text: t("recipeEditor.blocked.title") });
        showFirstError(next);
        return;
      }
      case "invalid": {
        const next = editor.errorsFromLimitErrors(result.errors, built.rows);
        setServerErrors(next);
        setBanner({ tone: "error", text: t("web.editor.fixErrors") });
        showFirstError(next);
        return;
      }
      case "failed":
        setBanner({ tone: "error", text: t("recipeEditor.saveFailed") });
        pendingFocus.current = FIELD_IDS.banner;
        return;
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  // Ctrl+S / ⌘S saves from anywhere on the page, instead of the browser's "Save page as".
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!document.querySelector("[role=dialog]")) void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Render

  function lockedEnd(field: LockedField, label: string) {
    return locked.has(field) ? <LockedNote field={label} onReset={() => change((s) => editor.resetField(s, field))} /> : null;
  }

  const effortOptions: { value: EffortLevel; label: string }[] = [
    { value: "Easy", label: t("recipe.effort.easy") },
    { value: "Medium", label: t("recipe.effort.medium") },
    { value: "Hard", label: t("recipe.effort.hard") },
  ];
  const costOptions: { value: CostEstimate; label: string }[] = (["$", "$$", "$$$"] as const).map((value) => ({
    value,
    label: `${value} · ${t(COST_I18N_KEYS[value])}`,
  }));

  const isEdit = state.mode === "edit";
  const isImport = state.mode === "import";
  const title = isEdit ? t("recipeEditor.titleEdit") : isImport ? t("recipeEditor.titleImport") : t("recipeEditor.titleWrite");
  const servingsValue = Number.parseInt(state.servings, 10);
  const setServingsBy = (delta: number) => {
    const base = Number.isFinite(servingsValue) ? servingsValue : 0;
    const next = Math.min(RECIPE_LIMITS.servingsMax, Math.max(RECIPE_LIMITS.servingsMin, base + delta));
    change((s) => editor.setServings(s, String(next)), { field: "servings" });
  };
  const tagsLabelId = useId();
  const effortLabelId = useId();
  const costLabelId = useId();

  const errorAttrs = (id: string, message: string | null) => ({
    "aria-invalid": Boolean(message) || undefined,
    "aria-describedby": message ? `${id}-error` : undefined,
  });
  const titleError = format(errors.fields.title);
  const servingsError = format(errors.fields.servings);
  const timeError = format(errors.fields.time);
  const caloriesError = format(errors.fields.calories);
  const cookNoteError = format(errors.fields.cookNote);

  return (
    <>
      <PageHeader title={title} subtitle={isEdit || isImport ? undefined : t("recipeEditor.entry.writeHint")} />

      {isImport && initial.missing.length > 0 ? (
        <p role="status" className="mb-6 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-[15px] font-semibold text-text">
          <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          {t(initial.missing.includes("ingredients") ? "recipeEditor.importMissingIngredients" : "recipeEditor.importMissingSteps")}
        </p>
      ) : null}

      {banner ? (
        <div
          id={FIELD_IDS.banner}
          tabIndex={-1}
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mb-6 flex items-start gap-3 rounded-2xl px-4 py-3 text-[15px] outline-none",
            banner.tone === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
          )}
        >
          <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{banner.text}</p>
            {errors.recipe.map((message) => (
              <p key={message.key} className="mt-1 text-text">
                {format(message)}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        noValidate
        aria-label={title}
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          {/* Title and servings */}
          <Tile as="section" className="p-4 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <FieldLabel htmlFor={FIELD_IDS.title} end={<CharCount length={Array.from(state.title.trim()).length} max={RECIPE_LIMITS.titleChars} />}>
                  {t("recipeEditor.fields.title")}
                </FieldLabel>
                <input
                  id={FIELD_IDS.title}
                  value={state.title}
                  onChange={(event) => change((s) => editor.setTitle(s, event.target.value), { field: "title" })}
                  onKeyDown={(event) => {
                    // Enter goes on to the ingredients, rather than submitting a half-written recipe.
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      const first = state.ingredients[0];
                      if (first) focusById(ingredientFieldId(first.id, "quantity"));
                      else addIngredientAtEnd();
                    }
                  }}
                  placeholder={t("recipeEditor.placeholders.title")}
                  dir="auto"
                  autoFocus={!isEdit}
                  autoComplete="off"
                  enterKeyHint="next"
                  {...errorAttrs(FIELD_IDS.title, titleError)}
                  className={inputClasses(Boolean(titleError), "h-14 rounded-2xl px-4 font-display text-xl font-bold")}
                />
                <FieldMessage id={`${FIELD_IDS.title}-error`} message={titleError} />
              </div>
              <div className="shrink-0">
                <FieldLabel htmlFor={FIELD_IDS.servings}>{t("recipeEditor.fields.servings")}</FieldLabel>
                <div className="flex h-14 items-center gap-1.5">
                  <IconButton
                    variant="tile"
                    label={t("recipe.decreaseServings")}
                    trackId="recipe_editor.servings.decrease"
                    icon={<Minus className="h-[18px] w-[18px]" />}
                    onClick={() => setServingsBy(-1)}
                    disabled={Number.isFinite(servingsValue) && servingsValue <= RECIPE_LIMITS.servingsMin}
                  />
                  <input
                    id={FIELD_IDS.servings}
                    value={state.servings}
                    onChange={(event) => change((s) => editor.setServings(s, event.target.value), { field: "servings" })}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault();
                        setServingsBy(event.key === "ArrowUp" ? 1 : -1);
                      }
                    }}
                    inputMode="numeric"
                    autoComplete="off"
                    {...errorAttrs(FIELD_IDS.servings, servingsError)}
                    className={inputClasses(Boolean(servingsError), "h-11 w-16 px-2 text-center font-display text-lg font-bold tabular-nums")}
                  />
                  <IconButton
                    variant="tile"
                    label={t("recipe.increaseServings")}
                    trackId="recipe_editor.servings.increase"
                    icon={<Plus className="h-[18px] w-[18px]" />}
                    onClick={() => setServingsBy(1)}
                    disabled={Number.isFinite(servingsValue) && servingsValue >= RECIPE_LIMITS.servingsMax}
                  />
                </div>
                <FieldMessage id={`${FIELD_IDS.servings}-error`} message={servingsError} />
              </div>
            </div>
            {state.written || state.sourceUrl ? (
              <p className="mt-4 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                <span className="font-semibold">{t("recipeEditor.fields.source")}:</span>
                {state.written ? (
                  <span>{t("recipeEditor.sourceWritten")}</span>
                ) : state.sourceUrl ? (
                  <a
                    href={state.sourceUrl}
                    data-track="recipe_editor.source_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-flex items-center gap-1 font-semibold text-primary-text underline-offset-2 hover:underline"
                  >
                    {sourceHost(state.sourceUrl)}
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    <span className="sr-only">({t("web.recipe.opensInNewTab")})</span>
                  </a>
                ) : null}
              </p>
            ) : null}
          </Tile>

          <EditorCard size="lg" title={t("recipeEditor.sections.ingredients")} hint={t("web.editor.ingredientsHint")}>
            {state.ingredients.length > 0 ? (
              <div aria-hidden className="mb-1.5 hidden items-center gap-2 ps-10 pe-[3.25rem] text-xs font-semibold text-muted sm:flex">
                <span className="w-20 text-center">{t("recipeEditor.fields.quantity")}</span>
                <span className="w-24">{t("recipeEditor.fields.unit")}</span>
                <span className="flex-1">{t("recipeEditor.fields.ingredientName")}</span>
              </div>
            ) : null}
            <ReorderableList
              items={state.ingredients}
              label={t("recipeEditor.sections.ingredients")}
              itemLabel={(row, index) => row.name.trim() || t("web.editor.ingredientN", { n: index + 1 })}
              onMove={(from, to) => change((s) => editor.moveIngredient(s, from, to))}
              renderItem={(row, index, handle) => (
                <IngredientRowEditor
                  row={row}
                  index={index}
                  handle={handle}
                  errors={errors.ingredientRows[row.id]}
                  onChange={(patch) => change((s) => editor.updateIngredient(s, row.id, patch), { ingredientRow: row.id })}
                  onRemove={() => removeIngredient(row.id, false)}
                  onEnter={() => nextIngredient(row.id)}
                  onRemoveBlank={() => {
                    if (state.ingredients.length < 2) return false;
                    removeIngredient(row.id, true);
                    return true;
                  }}
                  onPasteLines={(text) => {
                    const lines = parseIngredientPaste(text);
                    if (!lines) return false;
                    const pasted = pasteIngredients(state, row.id, lines);
                    pendingFocus.current = ingredientFieldId(pasted.id, "name");
                    change(() => pasted.state, { field: "ingredients" });
                    return true;
                  }}
                />
              )}
            />
            <FieldMessage id={`${FIELD_IDS.ingredients}-error`} message={format(errors.fields.ingredients)} />
            <Button id={FIELD_IDS.ingredients} variant="secondary" size="sm" className="mt-3" trackId="recipe_editor.ingredient.add" onClick={addIngredientAtEnd}>
              <Plus aria-hidden className="h-4 w-4" />
              {t("web.editor.addIngredient")}
            </Button>
          </EditorCard>

          <EditorCard size="lg" title={t("recipeEditor.sections.steps")} hint={t("web.editor.stepsHint")}>
            <ReorderableList
              ordered
              items={state.steps}
              label={t("recipeEditor.sections.steps")}
              itemLabel={(_row, index) => t("recipeEditor.fields.step", { n: index + 1 })}
              onMove={(from, to) => change((s) => editor.moveStep(s, from, to))}
              renderItem={(row, index, handle) => (
                <StepRowEditor
                  row={row}
                  position={index + 1}
                  handle={handle}
                  error={format(errors.stepRows[row.id])}
                  onChange={(text) => change((s) => editor.updateStep(s, row.id, text), { stepRow: row.id })}
                  onRemove={() => removeStep(row.id, false)}
                  onEnter={() => nextStep(row.id)}
                  onRemoveBlank={() => {
                    if (state.steps.length < 2) return false;
                    removeStep(row.id, true);
                    return true;
                  }}
                  onPasteLines={(text) => {
                    const steps = parseStepPaste(text);
                    if (!steps) return false;
                    const pasted = pasteSteps(state, row.id, steps);
                    pendingFocus.current = stepFieldId(pasted.id);
                    change(() => pasted.state, { field: "steps" });
                    return true;
                  }}
                />
              )}
            />
            <FieldMessage id={`${FIELD_IDS.steps}-error`} message={format(errors.fields.steps)} />
            <Button id={FIELD_IDS.steps} variant="secondary" size="sm" className="mt-3" trackId="recipe_editor.step.add" onClick={addStepAtEnd}>
              <Plus aria-hidden className="h-4 w-4" />
              {t("web.editor.addStep")}
            </Button>
          </EditorCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <EditorCard title={t("recipeEditor.fields.photo")}>
            <PhotoField
              src={photoPreviewSrc(state.photo, state.imageUrl)}
              generated={state.photo.kind === "keep" && state.imageGenerated}
              draw={state.photo.kind === "generate" ? "asked" : state.photo.kind === "keep" && state.imageDrawing ? "drawing" : "none"}
              busy={photoBusy}
              error={photoError ?? format(errors.fields.photo)}
              onFile={(file) => void takePhoto(file)}
              onRemove={() => {
                setPhotoError(null);
                // As on mobile: a recipe that had a photo ends up with none; a new one just chosen is simply dropped.
                change((s) => editor.setPhoto(s, s.imageUrl ? { kind: "remove" } : { kind: "keep" }), { field: "photo" });
                pendingFocus.current = FIELD_IDS.photo;
              }}
              onDraw={() => {
                setPhotoError(null);
                change((s) => editor.setPhoto(s, { kind: "generate" }), { field: "photo" });
                pendingFocus.current = FIELD_IDS.photo;
              }}
              // Back to how it was: the saved picture, or none.
              onCancelDraw={() => {
                change((s) => editor.setPhoto(s, { kind: "keep" }), { field: "photo" });
                pendingFocus.current = FIELD_IDS.photo;
              }}
            />
          </EditorCard>

          <EditorCard title={t("recipeEditor.sections.details")} hint={t("web.editor.detailsHint")}>
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <FieldLabel htmlFor={FIELD_IDS.time}>{t("recipeEditor.fields.time")}</FieldLabel>
                  <input
                    id={FIELD_IDS.time}
                    value={state.time}
                    onChange={(event) => change((s) => editor.setTime(s, event.target.value), { field: "time" })}
                    inputMode="numeric"
                    autoComplete="off"
                    {...errorAttrs(FIELD_IDS.time, timeError)}
                    className={inputClasses(Boolean(timeError), "h-11 tabular-nums")}
                  />
                  <div className="mt-1">{lockedEnd("estimated_time_minutes", t("recipeEditor.fields.time"))}</div>
                  <FieldMessage id={`${FIELD_IDS.time}-error`} message={timeError} />
                </div>
                <div className="min-w-0">
                  <FieldLabel htmlFor={FIELD_IDS.calories}>{t("recipeEditor.fields.calories")}</FieldLabel>
                  <input
                    id={FIELD_IDS.calories}
                    value={state.calories}
                    onChange={(event) => change((s) => editor.setCalories(s, event.target.value), { field: "calories" })}
                    inputMode="numeric"
                    autoComplete="off"
                    {...errorAttrs(FIELD_IDS.calories, caloriesError)}
                    className={inputClasses(Boolean(caloriesError), "h-11 tabular-nums")}
                  />
                  <div className="mt-1">{lockedEnd("calories", t("recipeEditor.fields.calories"))}</div>
                  <FieldMessage id={`${FIELD_IDS.calories}-error`} message={caloriesError} />
                </div>
              </div>

              <div>
                <FieldLabel id={effortLabelId} end={lockedEnd("effort_level", t("recipeEditor.fields.effort"))}>
                  {t("recipeEditor.fields.effort")}
                </FieldLabel>
                <div role="group" aria-labelledby={effortLabelId} className="flex flex-wrap gap-2">
                  {effortOptions.map((option) => (
                    <Chip
                      key={option.value}
                      selected={state.effort === option.value}
                      trackId={`recipe_editor.effort.${option.value}`}
                      onClick={() => change((s) => editor.setEffort(s, s.effort === option.value ? null : option.value))}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel id={costLabelId} end={lockedEnd("cost_estimate", t("recipeEditor.fields.cost"))}>
                  {t("recipeEditor.fields.cost")}
                </FieldLabel>
                <div role="group" aria-labelledby={costLabelId} className="flex flex-wrap gap-2">
                  {costOptions.map((option) => (
                    <Chip
                      key={option.value}
                      selected={state.cost === option.value}
                      trackId={`recipe_editor.cost.${option.value.length}`}
                      onClick={() => change((s) => editor.setCost(s, s.cost === option.value ? null : option.value))}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </EditorCard>

          <EditorCard title={t("recipeEditor.fields.tags")} action={lockedEnd("tags", t("recipeEditor.fields.tags"))}>
            <span id={tagsLabelId} className="sr-only">
              {t("recipeEditor.fields.tags")}
            </span>
            <TagsField
              tags={state.tags}
              labelId={tagsLabelId}
              error={format(errors.fields.tags)}
              onAdd={(tag) => change((s) => editor.addTag(s, tag), { field: "tags" })}
              onRemove={(tag) => change((s) => editor.removeTag(s, tag), { field: "tags" })}
            />
          </EditorCard>

          <EditorCard title={t("recipeEditor.fields.appliances")} action={lockedEnd("appliances", t("recipeEditor.fields.appliances"))}>
            <AppliancesField
              appliances={state.appliances}
              steps={state.steps}
              onAdd={(key) => change((s) => editor.addAppliance(s, key))}
              onRemove={(key) => change((s) => editor.removeAppliance(s, key))}
              onSetRequired={(key, required) => change((s) => editor.setApplianceRequired(s, key, required))}
              onToggleStep={(key, stepId) => change((s) => editor.toggleApplianceStep(s, key, stepId))}
            />
          </EditorCard>

          <EditorCard title={t("recipeEditor.fields.cookNote")}>
            <textarea
              id={FIELD_IDS.cookNote}
              value={state.cookNote}
              onChange={(event) => change((s) => editor.setCookNote(s, event.target.value), { field: "cookNote" })}
              placeholder={t("recipeEditor.placeholders.cookNote")}
              dir="auto"
              aria-label={t("recipeEditor.fields.cookNote")}
              rows={2}
              {...errorAttrs(FIELD_IDS.cookNote, cookNoteError)}
              className={inputClasses(Boolean(cookNoteError), "field-sizing-content block min-h-20 resize-y py-2.5 leading-relaxed")}
            />
            <div className="flex justify-between gap-3">
              <FieldMessage id={`${FIELD_IDS.cookNote}-error`} message={cookNoteError} />
              <span className="ms-auto mt-1">
                <CharCount length={Array.from(state.cookNote.trim()).length} max={RECIPE_LIMITS.cookNoteChars} />
              </span>
            </div>
          </EditorCard>
        </div>

        {/* Always in reach: sticks to the bottom of the window (above the tab bar on phones) while the form scrolls. */}
        {/* Flat, with a line on top. On phones it sits on the tab bar, with room under the buttons for the raised Snap button. */}
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 mt-2 lg:col-span-2 md:bottom-0">
          <div className="flex items-center gap-2 border-t border-border bg-bg/95 pt-3 pb-10 backdrop-blur-md sm:gap-3 md:pb-3">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted" aria-live="polite">
              <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dirty ? "bg-accent" : "bg-border")} />
              <span className="truncate font-medium">{dirty ? t("web.editor.unsaved") : t("web.editor.noChanges")}</span>
              <span aria-hidden className="hidden truncate text-xs md:inline">
                · {t("web.editor.saveShortcut", { shortcut })}
              </span>
            </p>
            <Button variant="ghost" trackId="recipe_editor.cancel" onClick={cancel} disabled={busy}>
              {t("recipeEditor.cancel")}
            </Button>
            <Button type="submit" trackId="recipe_editor.save" busy={saving} disabled={leaving} aria-keyshortcuts="Control+S Meta+S">
              {saving ? null : <Save aria-hidden className="h-4 w-4" />}
              {saving ? t("recipeEditor.saving") : t("recipeEditor.save")}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={pendingLeave !== null} onOpenChange={(open) => !open && setPendingLeave(null)}>
        <DialogContent
          title={t("recipeEditor.discard.title")}
          description={t("recipeEditor.discard.message")}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost" trackId="recipe_editor.discard_dialog.cancel">{t("recipeEditor.discard.keepEditing")}</Button>
              </DialogClose>
              <Button
                variant="danger"
                trackId="recipe_editor.discard_dialog.confirm"
                onClick={() => {
                  const proceed = pendingLeave;
                  setPendingLeave(null);
                  if (proceed) goTo(proceed);
                }}
              >
                {t("recipeEditor.discard.confirm")}
              </Button>
            </>
          }
        />
      </Dialog>

      {draggingFile ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid animate-fade-in place-items-center bg-overlay p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-tile border-2 border-dashed border-primary bg-surface px-10 py-8 text-center shadow-lift">
            <ImageUp className="h-10 w-10 text-primary-text" />
            <p className="font-display text-lg font-bold text-text">{t("web.editor.dropPhoto")}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Where a partial import starts: the empty ingredient or step row added for what the source left out. */
function firstMissingFieldId(state: RecipeEditorState): string | null {
  if (state.mode !== "import") return null;
  if (state.missing.includes("ingredients")) {
    const row = state.ingredients.at(-1);
    return row ? ingredientFieldId(row.id, "quantity") : FIELD_IDS.ingredients;
  }
  if (state.missing.includes("instructions")) {
    const row = state.steps.at(-1);
    return row ? stepFieldId(row.id) : FIELD_IDS.steps;
  }
  return null;
}
