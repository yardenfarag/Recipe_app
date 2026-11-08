import { type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { IngredientRow, IngredientRowErrors, StepRow } from '@/lib/recipeEditor';

import { EditorInput, FieldError, IconButton } from './EditorParts';

const AMOUNT_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

type IngredientRowEditorProps = {
  row: IngredientRow;
  handle: ReactNode;
  errors?: IngredientRowErrors;
  format: (message: IngredientRowErrors[keyof IngredientRowErrors]) => string | null;
  onChange: (patch: Partial<Pick<IngredientRow, 'name' | 'quantity' | 'unit'>>) => void;
  onDelete: () => void;
};

/** Grip · amount · unit · name · delete. Flex rows mirror in RTL. */
export function IngredientRowEditor({ row, handle, errors, format, onChange, onDelete }: IngredientRowEditorProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const message = format(errors?.row) ?? format(errors?.name) ?? format(errors?.quantity);
  return (
    <View>
      <View className="flex-row items-start gap-1.5">
        {handle}
        <EditorInput
          value={row.quantity}
          onChangeText={(quantity) => onChange({ quantity })}
          placeholder={t('recipeEditor.fields.quantity')}
          accessibilityLabel={t('recipeEditor.fields.quantity')}
          keyboardType={AMOUNT_KEYBOARD}
          invalid={Boolean(errors?.quantity)}
          style={{ width: 64 }}
        />
        <EditorInput
          value={row.unit}
          onChangeText={(unit) => onChange({ unit })}
          placeholder={t('recipeEditor.placeholders.unit')}
          accessibilityLabel={t('recipeEditor.fields.unit')}
          autoCapitalize="none"
          style={{ width: 72 }}
        />
        <EditorInput
          value={row.name}
          onChangeText={(name) => onChange({ name })}
          placeholder={t('recipeEditor.placeholders.ingredientName')}
          accessibilityLabel={t('recipeEditor.fields.ingredientName')}
          invalid={Boolean(errors?.name || errors?.row)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <IconButton icon="trash-outline" label={t('recipeEditor.deleteRow')} onPress={onDelete} color={colors.danger} />
      </View>
      <FieldError message={message} />
    </View>
  );
}

type StepRowEditorProps = {
  row: StepRow;
  position: number;
  handle: ReactNode;
  error?: string | null;
  onChange: (text: string) => void;
  onDelete: () => void;
};

export function StepRowEditor({ row, position, handle, error, onChange, onDelete }: StepRowEditorProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign } = useRtl();
  const label = t('recipeEditor.fields.step', { n: position });
  return (
    <View>
      <View className="flex-row items-start gap-1.5">
        {handle}
        <View className="min-w-0 flex-1">
          <Text className="mb-1 text-xs font-semibold" style={{ color: colors.textSecondary, textAlign }}>
            {label}
          </Text>
          <EditorInput
            value={row.text}
            onChangeText={onChange}
            placeholder={t('recipeEditor.placeholders.step')}
            accessibilityLabel={label}
            multiline
            invalid={Boolean(error)}
          />
        </View>
        <IconButton icon="trash-outline" label={t('recipeEditor.deleteRow')} onPress={onDelete} color={colors.danger} />
      </View>
      <FieldError message={error} />
    </View>
  );
}
