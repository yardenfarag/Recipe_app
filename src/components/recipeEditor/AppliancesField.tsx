import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApplianceIcon } from '@/components/ApplianceIcon';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { applianceNameKey } from '@shared/lib/applianceDisplay';
import { APPLIANCE_KEYS, type ApplianceKey, MAX_RECIPE_APPLIANCES } from '@shared/lib/appliances';
import type { ApplianceRow, StepRow } from '@shared/lib/recipeEditor';

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
  const type = useTypography();
  const [picking, setPicking] = useState(false);
  const rows = appliances ?? [];
  const listed = new Set(rows.map((row) => row.key));
  const available = APPLIANCE_KEYS.filter((key) => !listed.has(key));
  const canAdd = steps.length > 0 && rows.length < MAX_RECIPE_APPLIANCES && available.length > 0;

  return (
    <View style={{ gap: 10 }}>
      {rows.map((row) => {
        const name = t(applianceNameKey(row.key));
        return (
          <Tile key={row.key} tone="element" size="sm" style={{ gap: 12, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ApplianceIcon appliance={row.key} size={20} color={colors.primaryText} />
              <Text weight="semibold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <TileLabel style={{ marginEnd: 4 }}>{t('recipeEditor.sections.steps')}</TileLabel>
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
                    style={({ pressed }) => ({
                      height: 36,
                      minWidth: 36,
                      paddingHorizontal: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 11,
                      borderWidth: HAIRLINE,
                      borderColor: linked ? colors.primary : colors.border,
                      backgroundColor: linked ? colors.primary : pressed ? colors.backgroundSelected : colors.surface,
                    })}
                  >
                    <Text
                      color={linked ? colors.onPrimary : colors.textSecondary}
                      style={{ ...type.font('display', 'bold'), fontSize: 14, lineHeight: 18 }}
                    >
                      {index + 1}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Tile>
        );
      })}

      <AddRowButton trackId="recipe_editor.appliance.add" label={t('web.editor.addAppliance')} onPress={() => setPicking(true)} disabled={!canAdd} />

      <SheetModal
        trackId="recipe_editor.appliance.sheet" visible={picking} onClose={() => setPicking(false)} title={t('recipeEditor.appliance.pickTitle')}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 4 }}>
          {available.map((key) => (
            <Pressable
              key={key}
              trackId="recipe_editor.appliance.pick"
              onPress={() => {
                onAdd(key);
                setPicking(false);
              }}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 12,
                borderRadius: Radii.inner,
                backgroundColor: pressed ? colors.backgroundElement : 'transparent',
              })}
            >
              <ApplianceIcon appliance={key} size={22} color={colors.primaryText} />
              <Text>{t(applianceNameKey(key))}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>
    </View>
  );
}
