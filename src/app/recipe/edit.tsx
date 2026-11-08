/**
 * Edit recipe (`/recipe/edit?id=<id>`) and Write a recipe (`/recipe/edit`), PIN-79 / ADR 018.
 * Form state lives in src/lib/recipeEditor.ts; this screen renders it and talks to save-recipe-edit.
 */
import { type NavigationAction, usePreventRemove } from '@react-navigation/native';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { COST_I18N_KEYS } from '@/lib/formatCostEstimate';
import { goBackOrHome } from '@/lib/goBackOrHome';
import * as editor from '@/lib/recipeEditor';
import type { EditorErrors, ErrorTarget, RecipeEditorState } from '@/lib/recipeEditor';
import { fetchRecipeById } from '@/lib/supabase/recipes';
import { saveRecipeEdit } from '@/lib/supabase/saveRecipeEdit';
import type { CostEstimate, EffortLevel, LockedField } from '@/types/recipe';

const SIGN_UP = '/auth?mode=signup&reason=edit' as const;
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { colors } = useThemePreference();
  const isEdit = Boolean(id);
  const title = isEdit ? t('recipeEditor.titleEdit') : t('recipeEditor.titleWrite');

  const [initial, setInitial] = useState<RecipeEditorState | null | undefined>(() =>
    isEdit ? undefined : editor.createEditorState(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const isGuest = !authLoading && !user;

  const load = useCallback(async () => {
    if (!id || !user) return;
    setLoadError(null);
    setInitial(undefined);
    try {
      const found = id.startsWith('guest-') ? null : await fetchRecipeById(id);
      setInitial(found ? editor.createEditorState(found) : null);
    } catch (err) {
      setInitial(null);
      setLoadError(err instanceof Error ? err.message : t('recipe.loadFailed'));
    }
  }, [id, user, t]);

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

  if (authLoading || (isEdit && initial === undefined && !isGuest)) {
    return (
      <Screen edges={['left', 'right', 'bottom']} className="items-center justify-center">
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loadingRecipe')} />
      </Screen>
    );
  }

  if (isGuest) {
    return (
      <Screen edges={['left', 'right', 'bottom']} className="items-center justify-center gap-4 px-6">
        <Stack.Screen options={{ title }} />
        <Text className="text-center text-base" style={{ color: colors.text }}>
          {t('auth.signupSubtitle')}
        </Text>
        <Pressable
          onPress={() => router.push(SIGN_UP)}
          accessibilityRole="button"
          className="min-h-[48px] items-center justify-center rounded-[22px] px-6 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="font-bold" style={{ color: colors.onPrimary }}>
            {t('auth.signUp')}
          </Text>
        </Pressable>
      </Screen>
    );
  }

  if (!initial) {
    return (
      <Screen edges={['left', 'right', 'bottom']} className="items-center justify-center gap-4 px-6">
        <Stack.Screen options={{ title }} />
        <Text className="text-center text-base" style={{ color: colors.text }}>
          {loadError ?? t('recipe.loadFailed')}
        </Text>
        <Pressable
          onPress={() => void load()}
          accessibilityRole="button"
          className="min-h-[48px] items-center justify-center rounded-[22px] px-6 active:opacity-80"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Text className="font-semibold" style={{ color: colors.text }}>
            {t('common.retry')}
          </Text>
        </Pressable>
      </Screen>
    );
  }

  return <RecipeEditor key={initial.recipeId ?? 'write'} initial={initial} title={title} />;
}

function RecipeEditor({ initial, title }: { initial: RecipeEditorState; title: string }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign } = useRtl();
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
        const next: Exit = state.mode === 'write' ? { kind: 'open', recipeId: result.recipe.id } : { kind: 'back' };
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
    <Screen edges={['left', 'right']} dense>
      <Stack.Screen
        options={{
          title,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable onPress={cancel} hitSlop={12} accessibilityRole="button" disabled={saving}>
              <Text className="text-base" style={{ color: colors.textSecondary }}>
                {t('recipeEditor.cancel')}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => void save()}
              disabled={!canSave}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={saving ? t('recipeEditor.saving') : t('recipeEditor.save')}
              accessibilityState={{ disabled: !canSave, busy: saving }}
            >
              {saving ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text className="text-base font-bold" style={{ color: colors.primary, opacity: canSave ? 1 : 0.4 }}>
                  {t('recipeEditor.save')}
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="px-4 pb-16 pt-3"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          scrollEnabled={!dragging}
        >
          {banner ? (
            <View
              className="mb-4 rounded-2xl p-3"
              style={{ backgroundColor: banner.kind === 'error' ? colors.dangerSoft : colors.successSoft }}
              accessibilityLiveRegion="polite"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.text, textAlign }}>
                {banner.text}
              </Text>
              {errors.recipe.map((message) => (
                <Text key={message.key} className="mt-1 text-sm" style={{ color: colors.text, textAlign }}>
                  {format(message)}
                </Text>
              ))}
            </View>
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
                style={{ width: 96 }}
              />
            </EditorField>
            {sourceText ? (
              <EditorField label={t('recipeEditor.fields.source')}>
                <Text className="text-base" style={{ color: colors.textSecondary, textAlign }} numberOfLines={1} selectable>
                  {sourceText}
                </Text>
              </EditorField>
            ) : null}
          </EditorSection>

          <EditorSection title={t('recipeEditor.sections.ingredients')}>
            <Text className="text-xs" style={{ color: colors.textSecondary, textAlign }}>
              {t('recipeEditor.reorderHint')}
            </Text>
            <ReorderableList
              items={state.ingredients}
              onDragStateChange={setDragging}
              onMove={(from, to) => change((s) => editor.moveIngredient(s, from, to))}
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
              label={t('recipeEditor.add.ingredient')}
              onPress={() => change((s) => editor.addIngredient(s), { field: 'ingredients' })}
            />
          </EditorSection>

          <EditorSection title={t('recipeEditor.sections.steps')}>
            <ReorderableList
              items={state.steps}
              onDragStateChange={setDragging}
              onMove={(from, to) => change((s) => editor.moveStep(s, from, to))}
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
              label={t('recipeEditor.add.step')}
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
                label={t('recipeEditor.fields.effort')}
                options={effortOptions}
                value={state.effort}
                onChange={(value) => change((s) => editor.setEffort(s, value))}
              />
            </EditorField>
            <EditorField label={t('recipeEditor.fields.cost')} {...lockedProps('cost_estimate')}>
              <ChoiceChips
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
