import { type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import type { IngredientRow, IngredientRowErrors, StepRow } from '@shared/lib/recipeEditor';

import { EditorInput, FieldError, IconButton } from './EditorParts';

const AMOUNT_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';
/** The grip's width plus the gap after it: messages and the second line start under the fields. */
const HANDLE_INDENT = 32 + 6;

type IngredientRowEditorProps = {
  row: IngredientRow;
  handle: ReactNode;
  errors?: IngredientRowErrors;
  format: (message: IngredientRowErrors[keyof IngredientRowErrors]) => string | null;
  onChange: (patch: Partial<Pick<IngredientRow, 'name' | 'quantity' | 'unit'>>) => void;
  onDelete: () => void;
};

/**
 * Grip · amount · unit · delete, with the name on a second line under amount and unit, so it has the width on a
 * phone (as on the web's phone layout). The fields keep their reading order: amount, unit, name. Rows mirror in RTL.
 */
export function IngredientRowEditor({ row, handle, errors, format, onChange, onDelete }: IngredientRowEditorProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const message = format(errors?.row) ?? format(errors?.name) ?? format(errors?.quantity);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        {handle}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <EditorInput
              size="sm"
              value={row.quantity}
              onChangeText={(quantity) => onChange({ quantity })}
              placeholder={t('recipeEditor.placeholders.quantity')}
              accessibilityLabel={t('recipeEditor.fields.quantity')}
              keyboardType={AMOUNT_KEYBOARD}
              invalid={Boolean(errors?.quantity)}
              style={{ width: 84 }}
            />
            <EditorInput
              size="sm"
              value={row.unit}
              onChangeText={(unit) => onChange({ unit })}
              placeholder={t('recipeEditor.placeholders.unit')}
              accessibilityLabel={t('recipeEditor.fields.unit')}
              autoCapitalize="none"
              style={{ flex: 1, minWidth: 0 }}
            />
          </View>
          <EditorInput
            size="sm"
            value={row.name}
            onChangeText={(name) => onChange({ name })}
            placeholder={t('recipeEditor.placeholders.ingredientName')}
            accessibilityLabel={t('recipeEditor.fields.ingredientName')}
            invalid={Boolean(errors?.name || errors?.row)}
          />
        </View>
        <IconButton icon="trash-outline" label={t('recipeEditor.deleteRow')} onPress={onDelete} color={colors.danger} />
      </View>
      <View style={{ marginStart: HANDLE_INDENT }}>
        <FieldError message={message} />
      </View>
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

/** Grip · the step's number · its text · delete. */
export function StepRowEditor({ row, position, handle, error, onChange, onDelete }: StepRowEditorProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const label = t('recipeEditor.fields.step', { n: position });
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        {/* The grip, with the step's number under it (as on the web); the field is read out as "Step 2". */}
        <View style={{ alignItems: 'center', gap: 6 }}>
          {handle}
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              minWidth: 28,
              height: 28,
              paddingHorizontal: 6,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primarySoft,
            }}
          >
            <Text
              color={colors.primaryText}
              style={{ ...type.font('display', 'bold'), fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] }}
            >
              {position}
            </Text>
          </View>
        </View>
        <EditorInput
          value={row.text}
          onChangeText={onChange}
          placeholder={t('recipeEditor.placeholders.step')}
          accessibilityLabel={label}
          multiline
          invalid={Boolean(error)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <IconButton icon="trash-outline" label={t('recipeEditor.deleteRow')} onPress={onDelete} color={colors.danger} />
      </View>
      <View style={{ marginStart: HANDLE_INDENT }}>
        <FieldError message={error} />
      </View>
    </View>
  );
}
