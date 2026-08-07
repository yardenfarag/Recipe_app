import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling for the confirm button (delete flows). */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Cross-platform confirm dialog — replaces Alert.alert / window.confirm. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const resolvedConfirm = confirmLabel ?? t('common.continue');
  const resolvedCancel = cancelLabel ?? t('common.cancel');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <View
          className="w-full max-w-sm rounded-[28px] p-5"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
          }}
        >
          <Text className="text-lg font-bold" style={{ color: colors.text }}>
            {title}
          </Text>
          <Text className="mt-2 text-sm leading-5" style={{ color: colors.textSecondary }}>
            {message}
          </Text>

          <View className="mt-5 flex-row gap-2">
            <Pressable
              onPress={onCancel}
              disabled={loading}
              className="min-h-[48px] flex-1 items-center justify-center rounded-[22px] active:opacity-80"
              style={{ backgroundColor: colors.primarySoft }}
              accessibilityRole="button"
              accessibilityLabel={resolvedCancel}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                {resolvedCancel}
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              className="min-h-[48px] flex-1 items-center justify-center rounded-[22px] active:opacity-80"
              style={{
                backgroundColor: destructive ? colors.danger : colors.primary,
                opacity: loading ? 0.7 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={resolvedConfirm}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-sm font-bold text-white">{resolvedConfirm}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
