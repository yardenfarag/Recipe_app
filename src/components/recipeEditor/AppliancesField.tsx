import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';

import { ApplianceIcon } from '@/components/ApplianceIcon';
import { SheetModal } from '@/components/SheetModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { applianceNameKey } from '@/lib/applianceDisplay';
import { APPLIANCE_KEYS, type ApplianceKey, MAX_RECIPE_APPLIANCES } from '@/lib/appliances';
import type { ApplianceRow, StepRow } from '@/lib/recipeEditor';

import { AddRowButton, ChoiceChips, IconButton } from './EditorParts';

type AppliancesFieldProps = {
  appliances: ApplianceRow[] | null;
  steps: StepRow[];
  onAdd: (key: ApplianceKey) => void;
  onRemove: (key: ApplianceKey) => void;
  onSetRequired: (key: ApplianceKey, required: boolean) => void;
  onToggleStep: (key: ApplianceKey, stepId: string) => void;
};

/** Appliances from the catalog, each required or optional, linked to the steps that use it. */
export function AppliancesField({
  appliances,
  steps,
  onAdd,
  onRemove,
  onSetRequired,
  onToggleStep,
}: AppliancesFieldProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [picking, setPicking] = useState(false);
  const rows = appliances ?? [];
  const listed = new Set(rows.map((row) => row.key));
  const available = APPLIANCE_KEYS.filter((key) => !listed.has(key));
  const canAdd = steps.length > 0 && rows.length < MAX_RECIPE_APPLIANCES && available.length > 0;

  return (
    <View className="gap-3">
      {rows.map((row) => {
        const name = t(applianceNameKey(row.key));
        return (
          <View
            key={row.key}
            className="gap-2 rounded-2xl border p-3"
            style={{ borderColor: colors.frostedBorder, backgroundColor: colors.surface }}
          >
            <View className="flex-row items-center gap-2">
              <ApplianceIcon appliance={row.key} size={20} color={colors.primary} />
              <Text className="min-w-0 flex-1 text-base font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                {name}
              </Text>
              <IconButton
                trackId="recipe_editor.appliance.remove"
                icon="trash-outline"
                label={`${t('recipeEditor.deleteRow')} ${name}`}
                onPress={() => onRemove(row.key)}
                color={colors.danger}
              />
            </View>
            <ChoiceChips
              trackId="recipe_editor.appliance"
              label={name}
              value={row.required ? 'required' : 'optional'}
              onChange={(value) => {
                if (value) onSetRequired(row.key, value === 'required');
              }}
              options={[
                { value: 'required', label: t('recipeEditor.appliance.required') },
                { value: 'optional', label: t('recipeEditor.appliance.optional') },
              ]}
            />
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
                {t('recipeEditor.sections.steps')}
              </Text>
              {steps.map((step, index) => {
                const linked = row.stepIds.includes(step.id);
                return (
                  <Pressable
                    key={step.id}
                    trackId="recipe_editor.appliance.step_toggle"
                    onPress={() => onToggleStep(row.key, step.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: linked }}
                    accessibilityLabel={t('recipeEditor.fields.step', { n: index + 1 })}
                    hitSlop={4}
                    className="h-8 min-w-[32px] items-center justify-center rounded-full border px-2 active:opacity-80"
                    style={{
                      borderColor: linked ? colors.primary : colors.frostedBorder,
                      backgroundColor: linked ? colors.primarySoft : 'transparent',
                    }}
                  >
                    <Text className="text-xs font-bold" style={{ color: linked ? colors.primary : colors.textSecondary }}>
                      {index + 1}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <AddRowButton trackId="recipe_editor.appliance.add" label={t('recipeEditor.add.appliance')} onPress={() => setPicking(true)} disabled={!canAdd} />

      <SheetModal
        trackId="recipe_editor.appliance.sheet" visible={picking} onClose={() => setPicking(false)} title={t('recipeEditor.appliance.pickTitle')}>
        <ScrollView className="flex-1 px-5" contentContainerClassName="pb-8 gap-1">
          {available.map((key) => (
            <Pressable
              key={key}
              trackId="recipe_editor.appliance.pick"
              onPress={() => {
                onAdd(key);
                setPicking(false);
              }}
              accessibilityRole="button"
              className="min-h-[48px] flex-row items-center gap-3 rounded-2xl px-3 active:opacity-70"
            >
              <ApplianceIcon appliance={key} size={22} color={colors.primary} />
              <Text className="text-base" style={{ color: colors.text }}>
                {t(applianceNameKey(key))}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>
    </View>
  );
}
