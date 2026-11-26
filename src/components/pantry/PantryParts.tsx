import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, MIN_TOUCH, type IconSource } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

/** The round icon a pantry state starts with (empty, sign in). */
export function PantryBadgeIcon({ icon, size = 64 }: { icon: IconSource; size?: number }) {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
      }}
    >
      <KitIcon icon={icon} size={size * 0.46} color={colors.primaryText} />
    </View>
  );
}

/** The pantry is kept on the account: a guest is asked to sign in first. */
export function PantrySignInPrompt({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <Tile padding={24} style={{ alignItems: 'center', gap: 14 }}>
      <PantryBadgeIcon icon="basket-outline" />
      <Text variant="h3" align="center">
        {t('pantry.title')}
      </Text>
      <Text variant="bodySmall" tone="muted" align="center">
        {t('pantry.emptyBody')}
      </Text>
      <Button
        trackId="pantry.sign_in"
        fullWidth
        onPress={() => {
          onBeforeNavigate?.();
          router.push('/auth?mode=signin&reason=sync');
        }}
      >
        {t('auth.signIn')}
      </Button>
    </Tile>
  );
}

/** A square check, filled with the brand colour once ticked. Drawn only: the row around it is the checkbox. */
export function CheckSquare({ checked }: { checked: boolean }) {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: checked ? 0 : 2,
        borderColor: colors.textSecondary,
        backgroundColor: checked ? colors.primary : 'transparent',
      }}
    >
      {checked ? <KitIcon icon="checkmark" size={16} color={colors.onPrimary} /> : null}
    </View>
  );
}

/** One tickable row: a check, the name, a muted line under it, and anything at the end. */
export function CheckRow({
  checked,
  onToggle,
  label,
  detail,
  trailing,
  first,
  trackId,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  detail?: string | null;
  trailing?: ReactNode;
  first?: boolean;
  trackId: string;
  /** Drawn in place of the name (an inline rename field). */
  children?: ReactNode;
}) {
  const { colors } = useThemePreference();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 52 },
        first ? null : { borderTopWidth: HAIRLINE, borderColor: colors.border },
      ]}
    >
      <Pressable
        trackId={trackId}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={[label, detail].filter(Boolean).join(', ')}
        style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
      >
        <CheckSquare checked={checked} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 8, gap: 2 }}>
        {children ?? (
          <Text variant="bodySmall" weight="semibold" numberOfLines={2}>
            {label}
          </Text>
        )}
        {detail ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
