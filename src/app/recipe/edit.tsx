/**
 * Edit recipe (`/recipe/edit?id=<id>`) and Write a recipe (`/recipe/edit`), PIN-79 / ADR 018.
 * Finish a partial import (`/recipe/edit?from=import`, ADR 019): the unsaved import draft from
 * src/lib/recipeDraft.ts, saved only when the user presses Save.
 * Form state lives in shared/lib/recipeEditor.ts; this screen renders it and talks to save-recipe-edit.
 */
import { type NavigationAction, usePreventRemove } from '@react-navigation/native';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { Radii } from '@/components/ui/tokens';
import { AppliancesField } from '@/components/recipeEditor/AppliancesField';
import {
  AddRowButton,
  ChoiceChips,
  EditorField,
  EditorInput,
  EditorSection,
  FieldError,
  useEditorMessage,
} from '@/components/recipeEditor/EditorParts';
import { PhotoField } from '@/components/recipeEditor/PhotoField';
import { ReorderableList } from '@/components/recipeEditor/ReorderableList';
import { IngredientRowEditor, StepRowEditor } from '@/components/recipeEditor/RowEditors';
import { TagsField } from '@/components/recipeEditor/TagsField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { COST_I18N_KEYS } from '@shared/lib/formatCostEstimate';
import { goBackOrHome } from '@/lib/goBackOrHome';
import { logTap } from '@/lib/interactionLog';
import { clearRecipeDraft, getRecipeDraft } from '@/lib/recipeDraft';
import * as editor from '@shared/lib/recipeEditor';
import type { EditorErrors, ErrorTarget, RecipeEditorState } from '@shared/lib/recipeEditor';
import { fetchRecipeById } from '@shared/lib/supabase/recipes';
import { saveRecipeEdit } from '@shared/lib/supabase/saveRecipeEdit';
import type { CostEstimate, EffortLevel, LockedField } from '@shared/types/recipe';

const SIGN_UP = '/auth?mode=signup&reason=edit' as const;

/** Keeps Cancel and Save off the window edges on web, and gives them a comfortable tap target. */
const HEADER_ACTION_STYLE = { marginHorizontal: Platform.OS === 'web' ? 12 : 0 } as const;
const LIMITED_NOTICE_MS = 2000;

type Exit =
  | { kind: 'back' }
  | { kind: 'open'; recipeId: string }
  | { kind: 'action'; action: NavigationAction };

function sourceHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/** A message at the top of the form: a save that failed or was blocked, a limited recalculation, a partial import. */
function Notice({
  tone,
  title,
  lines = [],
}: {
  tone: 'danger' | 'success' | 'warning';
  title: string;
  lines?: { key: string; text: string | null }[];
}) {
  const { colors } = useThemePreference();
  const look = {
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' as const },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-circle' as const },
  }[tone];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderRadius: Radii.inner,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: look.bg,
      }}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ paddingTop: 1 }}>
        <Ionicons name={look.icon} size={20} color={look.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="bodySmall" weight="semibold">
          {title}
        </Text>
        {lines.map((line) => (
          <Text key={line.key} variant="bodySmall">
            {line.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Errors to show: hard-limit checks live, "required" ones only after a save attempt. */
function visibleErrors(state: RecipeEditorState, attempted: boolean, server: EditorErrors): EditorErrors {
  const live = editor.validate(state);
  const keep = (key: string) =>
    attempted ||
    !['recipeEditor.errors.required', 'recipeEditor.errors.needIngredient', 'recipeEditor.errors.needStep'].includes(key);
  const fields = Object.fromEntries(
    Object.entries(live.fields).filter(([, message]) => message && keep(message.key)),
  ) as EditorErrors['fields'];
  const ingredientRows: EditorErrors['ingredientRows'] = { ...server.ingredientRows };
  for (const [id, row] of Object.entries(live.ingredientRows)) {
    const next = {
      ...ingredientRows[id],
      ...(row.name && keep(row.name.key) ? { name: row.name } : {}),
      ...(row.quantity ? { quantity: row.quantity } : {}),
    };
    if (next.name || next.quantity || next.row) ingredientRows[id] = next;
  }
  return {
    fields: { ...server.fields, ...fields },
    ingredientRows,
    stepRows: { ...server.stepRows, ...live.stepRows },
    recipe: server.recipe,
  };
}

export default function RecipeEditScreen() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();
  const isEdit = Boolean(id);
  const isImport = !isEdit && from === 'import';
  const title = isEdit
    ? t('recipeEditor.titleEdit')
    : isImport
      ? t('recipeEditor.titleImport')
      : t('recipeEditor.titleWrite');

  const [initial, setInitial] = useState<RecipeEditorState | null | undefined>(() =>
    isEdit || isImport ? undefined : editor.createEditorState(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const isGuest = !authLoading && !user;

  const load = useCallback(async () => {
    if (!user || (!id && !isImport)) return;
    setLoadError(null);
    setInitial(undefined);
    try {
      if (isImport) {
        const draft = await getRecipeDraft();
        setInitial(draft ? editor.createImportEditorState(draft) : null);
        return;
      }
      const found = !id || id.startsWith('guest-') ? null : await fetchRecipeById(id);
      setInitial(found ? editor.createEditorState(found) : null);
    } catch (err) {
      setInitial(null);
      setLoadError(err instanceof Error ? err.message : t('recipe.loadFailed'));
    }
  }, [id, isImport, user, t]);

  useEffect(() => {
    void load();
    // Load once per recipe and account: refetching on focus would wipe the user's edits.
  }, [load]);

  // Entry points send guests to sign-up; this is the fallback if one gets here anyway.
  const pushedSignUp = useRef(false);
  useEffect(() => {
    if (isGuest && !pushedSignUp.current) {
      pushedSignUp.current = true;
      router.push(SIGN_UP);
    }
  }, [isGuest]);

  if (authLoading || ((isEdit || isImport) && initial === undefined && !isGuest)) {
    return (
      <Screen edges={['left', 'right', 'bottom']} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loadingRecipe')} />
      </Screen>
    );
  }

  if (isGuest) {
    return (
      <Screen edges={['left', 'right', 'bottom']} style={{ justifyContent: 'center', paddingHorizontal: 20 }}>
        <Stack.Screen options={{ title }} />
        <Tile padding={24} style={{ alignItems: 'center', gap: 16 }}>
          <Text align="center">{t('auth.signupSubtitle')}</Text>
          <Button size="lg" fullWidth trackId="recipe_editor.sign_up" onPress={() => router.push(SIGN_UP)}>
            {t('auth.signUp')}
          </Button>
        </Tile>
      </Screen>
    );
  }

  if (!initial) {
    return (
      <Screen edges={['left', 'right', 'bottom']} style={{ justifyContent: 'center', paddingHorizontal: 20 }}>
        <Stack.Screen options={{ title }} />
        <Tile padding={24} style={{ alignItems: 'center', gap: 16 }}>
          <Text align="center">{loadError ?? t('recipe.loadFailed')}</Text>
          <Button variant="secondary" icon="refresh" trackId="recipe_editor.load_retry" onPress={() => void load()} style={{ alignSelf: 'center' }}>
            {t('common.retry')}
          </Button>
        </Tile>
      </Screen>
    );
  }

  return <RecipeEditor key={initial.recipeId ?? initial.mode} initial={initial} title={title} />;
}

function RecipeEditor({ initial, title }: { initial: RecipeEditorState; title: string }) {
  const { t } = useTranslation();
  const { language } = useLanguagePreference();
  const navigation = useNavigation();
  const format = useEditorMessage();

  const [state, setState] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<EditorErrors>(editor.noErrors);
  const [banner, setBanner] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exit, setExit] = useState<Exit | null>(null);
  const [pendingLeave, setPendingLeave] = useState<Exit | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Import mode: bring the section the source left out into view once, when it's laid out.
  const scrolledToMissing = useRef(initial.missing.length === 0);
  const firstMissing = initial.missing[0];
  function onSectionLayout(part: editor.MissingPart) {
    return (event: LayoutChangeEvent) => {
      if (scrolledToMissing.current || part !== firstMissing) return;
      scrolledToMissing.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
    };
  }

  const dirty = editor.needsDiscardConfirm(state);
  const canSave = editor.canSave(state) && !saving && !exit;
  const errors = useMemo(() => visibleErrors(state, attempted, serverErrors), [state, attempted, serverErrors]);
  const locked = useMemo(() => new Set(editor.lockedFields(state)), [state]);

  /** Applies an edit and clears the server message attached to that place. */
  const change = useCallback((update: (s: RecipeEditorState) => RecipeEditorState, target?: ErrorTarget) => {
    setState(update);
    if (target) setServerErrors((prev) => editor.withoutError(prev, target));
  }, []);

  // Swipe back, Android back and the header back all ask first when there are changes.
  usePreventRemove(dirty && !exit, ({ data }) => {
    setPendingLeave({ kind: 'action', action: data.action });
  });

  // Leave once the screen has re-rendered without the guard.
  useEffect(() => {
    if (!exit) return;
    if (exit.kind === 'action') navigation.dispatch(exit.action);
    else if (exit.kind === 'open') router.replace(`/recipe/${exit.recipeId}`);
    else if (router.canGoBack()) router.back();
    else goBackOrHome('/');
  }, [exit, navigation]);

  function cancel() {
    if (saving) return;
    if (dirty) setPendingLeave({ kind: 'back' });
    else setExit({ kind: 'back' });
  }

  async function save() {
    if (!canSave) return;
    setAttempted(true);
    setBanner(null);
    const built = editor.buildSaveRequest(state, language);
    if (!built.ok) {
      setServerErrors(editor.noErrors());
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSaving(true);
    const result = await saveRecipeEdit(built.request);
    setSaving(false);

    switch (result.status) {
      case 'saved': {
        const next: Exit = state.mode === 'edit' ? { kind: 'back' } : { kind: 'open', recipeId: result.recipe.id };
        if (state.mode === 'import') {
          try {
            await clearRecipeDraft();
          } catch (error) {
            console.warn('[recipe-draft] clear failed', error);
          }
        }
        if (result.recalculation === 'limited') {
          const text = t('recipeEditor.limited');
          setBanner({ kind: 'info', text });
          announce(text);
          setSaving(true); // keep Save and Cancel inactive while the notice shows
          setTimeout(() => setExit(next), LIMITED_NOTICE_MS);
        } else {
          setExit(next);
        }
        return;
      }
      case 'blocked':
        setServerErrors(editor.errorsFromBlockReasons(result.reasons, built.rows, state));
        setBanner({ kind: 'error', text: t('recipeEditor.blocked.title') });
        announce(t('recipeEditor.blocked.title'));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      case 'invalid':
        setServerErrors(editor.errorsFromLimitErrors(result.errors, built.rows));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      case 'failed':
        if (result.code === 'auth_required') {
          router.push(SIGN_UP);
          return;
        }
        setBanner({ kind: 'error', text: t('recipeEditor.saveFailed') });
        announce(t('recipeEditor.saveFailed'));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
    }
  }

  function lockedProps(field: LockedField) {
    return {
      locked: locked.has(field),
      resetTrackId: `recipe_editor.${field}.reset`,
      onReset: () => change((s) => editor.resetField(s, field)),
    };
  }

  const effortOptions: { value: EffortLevel; label: string }[] = [
    { value: 'Easy', label: t('recipe.effort.easy') },
    { value: 'Medium', label: t('recipe.effort.medium') },
    { value: 'Hard', label: t('recipe.effort.hard') },
  ];
  const costOptions: { value: CostEstimate; label: string }[] = (['$', '$$', '$$$'] as const).map((value) => ({
    value,
    label: `${value} · ${t(COST_I18N_KEYS[value])}`,
  }));

  const sourceText = state.written
    ? t('recipeEditor.sourceWritten')
    : state.sourceUrl
      ? sourceHost(state.sourceUrl)
      : null;

  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen
        options={{
          title,
          headerBackVisible: false,
          // Centred, so the title never butts against Cancel (start-aligned by default on web/Android).
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Button
              variant="ghost"
              size="sm"
              trackId="recipe_editor.cancel"
              onPress={cancel}
              disabled={saving}
              style={HEADER_ACTION_STYLE}
            >
              {t('recipeEditor.cancel')}
            </Button>
          ),
          // Save is the screen's main action: the primary button.
          headerRight: () => (
            <Button
              size="sm"
              trackId="recipe_editor.save"
              onPress={() => void save()}
              disabled={!canSave && !saving}
              busy={saving}
              accessibilityLabel={saving ? t('recipeEditor.saving') : t('recipeEditor.save')}
              style={HEADER_ACTION_STYLE}
            >
              {t('recipeEditor.save')}
            </Button>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 64, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          scrollEnabled={!dragging}
        >
          {banner ? (
            <Notice
              tone={banner.kind === 'error' ? 'danger' : 'success'}
              title={banner.text}
              lines={errors.recipe.map((message) => ({ key: message.key, text: format(message) }))}
            />
          ) : null}

          {state.mode === 'import' && initial.missing.length > 0 ? (
            <Notice
              tone="warning"
              title={t(
                initial.missing.includes('ingredients')
                  ? 'recipeEditor.importMissingIngredients'
                  : 'recipeEditor.importMissingSteps',
              )}
            />
          ) : null}

          <EditorSection title={t('recipeEditor.sections.basics')}>
            <EditorField label={t('recipeEditor.fields.title')} error={format(errors.fields.title)}>
              <EditorInput
                value={state.title}
                onChangeText={(value) => change((s) => editor.setTitle(s, value), { field: 'title' })}
                placeholder={t('recipeEditor.placeholders.title')}
                accessibilityLabel={t('recipeEditor.fields.title')}
                invalid={Boolean(errors.fields.title)}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.photo')} error={format(errors.fields.photo)}>
              <PhotoField
                photo={state.photo}
                imageUrl={state.imageUrl}
                generated={state.imageGenerated}
                drawing={state.imageDrawing}
                onChange={(photo) => change((s) => editor.setPhoto(s, photo), { field: 'photo' })}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.servings')} error={format(errors.fields.servings)}>
              <EditorInput
                value={state.servings}
                onChangeText={(value) => change((s) => editor.setServings(s, value), { field: 'servings' })}
                keyboardType="number-pad"
                accessibilityLabel={t('recipeEditor.fields.servings')}
                invalid={Boolean(errors.fields.servings)}
                style={{ width: 104 }}
              />
            </EditorField>
            {sourceText ? (
              <EditorField label={t('recipeEditor.fields.source')}>
                <Text tone="muted" numberOfLines={1} selectable>
                  {sourceText}
                </Text>
              </EditorField>
            ) : null}
          </EditorSection>

          <EditorSection
            title={t('recipeEditor.sections.ingredients')}
            hint={t('recipeEditor.reorderHint')}
            onLayout={onSectionLayout('ingredients')}
          >
            <ReorderableList
              items={state.ingredients}
              onDragStateChange={setDragging}
              onMove={(from, to) => {
                logTap('recipe_editor.ingredient.reorder');
                change((s) => editor.moveIngredient(s, from, to));
              }}
              renderItem={(row, _index, handle) => (
                <IngredientRowEditor
                  row={row}
                  handle={handle}
                  errors={errors.ingredientRows[row.id]}
                  format={format}
                  onChange={(patch) =>
                    change((s) => editor.updateIngredient(s, row.id, patch), { ingredientRow: row.id })
                  }
                  onDelete={() => change((s) => editor.removeIngredient(s, row.id), { ingredientRow: row.id })}
                />
              )}
            />
            <FieldError message={format(errors.fields.ingredients)} />
            <AddRowButton
              trackId="recipe_editor.ingredient.add"
              label={t('web.editor.addIngredient')}
              onPress={() => change((s) => editor.addIngredient(s), { field: 'ingredients' })}
            />
          </EditorSection>

          <EditorSection title={t('recipeEditor.sections.steps')} onLayout={onSectionLayout('instructions')}>
            <ReorderableList
              items={state.steps}
              onDragStateChange={setDragging}
              onMove={(from, to) => {
                logTap('recipe_editor.step.reorder');
                change((s) => editor.moveStep(s, from, to));
              }}
              renderItem={(row, index, handle) => (
                <StepRowEditor
                  row={row}
                  position={index + 1}
                  handle={handle}
                  error={format(errors.stepRows[row.id])}
                  onChange={(text) => change((s) => editor.updateStep(s, row.id, text), { stepRow: row.id })}
                  onDelete={() => change((s) => editor.removeStep(s, row.id), { stepRow: row.id })}
                />
              )}
            />
            <FieldError message={format(errors.fields.steps)} />
            <AddRowButton
              trackId="recipe_editor.step.add"
              label={t('web.editor.addStep')}
              onPress={() => change((s) => editor.addStep(s), { field: 'steps' })}
            />
          </EditorSection>

          <EditorSection title={t('recipeEditor.sections.details')}>
            <EditorField
              label={t('recipeEditor.fields.time')}
              error={format(errors.fields.time)}
              {...lockedProps('estimated_time_minutes')}
            >
              <EditorInput
                value={state.time}
                onChangeText={(value) => change((s) => editor.setTime(s, value), { field: 'time' })}
                keyboardType="number-pad"
                accessibilityLabel={t('recipeEditor.fields.time')}
                invalid={Boolean(errors.fields.time)}
                style={{ width: 120 }}
              />
            </EditorField>
            <EditorField
              label={t('recipeEditor.fields.calories')}
              error={format(errors.fields.calories)}
              {...lockedProps('calories')}
            >
              <EditorInput
                value={state.calories}
                onChangeText={(value) => change((s) => editor.setCalories(s, value), { field: 'calories' })}
                keyboardType="number-pad"
                accessibilityLabel={t('recipeEditor.fields.calories')}
                invalid={Boolean(errors.fields.calories)}
                style={{ width: 120 }}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.effort')} {...lockedProps('effort_level')}>
              <ChoiceChips
                trackId="recipe_editor.effort"
                label={t('recipeEditor.fields.effort')}
                options={effortOptions}
                value={state.effort}
                onChange={(value) => change((s) => editor.setEffort(s, value))}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.cost')} {...lockedProps('cost_estimate')}>
              <ChoiceChips
                trackId="recipe_editor.cost"
                label={t('recipeEditor.fields.cost')}
                options={costOptions}
                value={state.cost}
                onChange={(value) => change((s) => editor.setCost(s, value))}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.tags')} error={format(errors.fields.tags)} {...lockedProps('tags')}>
              <TagsField
                tags={state.tags}
                onAdd={(tag) => change((s) => editor.addTag(s, tag), { field: 'tags' })}
                onRemove={(tag) => change((s) => editor.removeTag(s, tag), { field: 'tags' })}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.appliances')} {...lockedProps('appliances')}>
              <AppliancesField
                appliances={state.appliances}
                steps={state.steps}
                onAdd={(key) => change((s) => editor.addAppliance(s, key))}
                onRemove={(key) => change((s) => editor.removeAppliance(s, key))}
                onSetRequired={(key, required) => change((s) => editor.setApplianceRequired(s, key, required))}
                onToggleStep={(key, stepId) => change((s) => editor.toggleApplianceStep(s, key, stepId))}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.cookNote')} error={format(errors.fields.cookNote)}>
              <EditorInput
                value={state.cookNote}
                onChangeText={(value) => change((s) => editor.setCookNote(s, value), { field: 'cookNote' })}
                placeholder={t('recipeEditor.placeholders.cookNote')}
                accessibilityLabel={t('recipeEditor.fields.cookNote')}
                invalid={Boolean(errors.fields.cookNote)}
                multiline
              />
            </EditorField>
          </EditorSection>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        trackId="recipe_editor.discard_dialog"
        visible={pendingLeave !== null}
        title={t('recipeEditor.discard.title')}
        message={t('recipeEditor.discard.message')}
        confirmLabel={t('recipeEditor.discard.confirm')}
        cancelLabel={t('recipeEditor.discard.keepEditing')}
        destructive
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          const leave = pendingLeave;
          setPendingLeave(null);
          if (leave) setExit(leave);
        }}
      />
    </Screen>
  );
}
