import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  /** Destructive styling for the confirm button (delete flows). */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSecondary?: () => void;
  /** Tap-log id prefix; logs `<trackId>.cancel`, `.secondary` and `.confirm`. */
  trackId?: string;
}

/**
 * Cross-platform confirm dialog — replaces Alert.alert / window.confirm. Night Market (PIN-177): a surface tile with
 * 28 corners over the dim overlay, the title in Space Grotesk, and the kit's buttons (danger when it deletes).
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  secondaryLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  onSecondary,
  trackId = 'confirm_dialog',
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { rtl } = useRtl();
  const { height: windowHeight } = useWindowDimensions();
  const resolvedConfirm = confirmLabel ?? t('common.continue');
  const resolvedCancel = cancelLabel ?? t('common.cancel');
  const hasSecondary = Boolean(secondaryLabel && onSecondary);
  // A button's label stays on one line: long labels (or a third button) stack the buttons instead.
  const stacked = hasSecondary || resolvedConfirm.length + resolvedCancel.length > 26;
  // Side by side, each takes half; stacked, each takes the width.
  const buttonStyle = stacked ? undefined : { flex: 1, minWidth: 0 };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          backgroundColor: colors.overlay,
          direction: rtl ? 'rtl' : 'ltr',
        }}
      >
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={loading ? undefined : onCancel}
          style={{
            width: '100%',
            maxWidth: 400,
            overflow: 'hidden',
            borderRadius: Radii.tile,
            backgroundColor: colors.surface,
            borderWidth: HAIRLINE,
            borderColor: colors.border,
            maxHeight: windowHeight - 48,
            flexShrink: 0,
          }}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={{ padding: 24 }}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
          >
            {/* A title or message can start with a Latin word such as "Pinch": Text keeps the app's direction. */}
            <Text variant="h3" style={{ fontSize: 20, lineHeight: 26 }}>
              {title}
            </Text>
            <Text variant="bodySmall" tone="muted" style={{ marginTop: 8 }}>
              {message}
            </Text>

            <View style={[{ marginTop: 24, gap: 8 }, stacked ? null : { flexDirection: 'row' }]}>
              <Button
                variant="outline"
                trackId={`${trackId}.cancel`}
                onPress={onCancel}
                disabled={loading}
                fullWidth={stacked}
                accessibilityLabel={resolvedCancel}
                style={buttonStyle}
              >
                {resolvedCancel}
              </Button>
              {hasSecondary ? (
                <Button
                  variant="secondary"
                  trackId={`${trackId}.secondary`}
                  onPress={onSecondary}
                  disabled={loading}
                  fullWidth
                  accessibilityLabel={secondaryLabel}
                >
                  {secondaryLabel}
                </Button>
              ) : null}
              <Button
                variant={destructive ? 'danger' : 'primary'}
                trackId={`${trackId}.confirm`}
                onPress={onConfirm}
                busy={loading}
                fullWidth={stacked}
                accessibilityLabel={resolvedConfirm}
                style={buttonStyle}
              >
                {resolvedConfirm}
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
