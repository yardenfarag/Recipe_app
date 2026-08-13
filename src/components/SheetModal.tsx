import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

type SheetModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional trailing header control (e.g. Save). */
  headerRight?: ReactNode;
  /** Optional footer pinned below scroll content. */
  footer?: ReactNode;
  /** Web card max width (default 520). */
  maxWidth?: number;
  /** When false, hide the default close button (use Cancel text in headerRight/left). */
  showCloseButton?: boolean;
  /** Replace the default close control on the left. */
  headerLeft?: ReactNode;
};

/**
 * Native: page-sheet modal. Web: centered frosted card over a dimmed backdrop.
 */
export function SheetModal({
  visible,
  onClose,
  title,
  children,
  headerRight,
  footer,
  maxWidth = 520,
  showCloseButton = true,
  headerLeft,
}: SheetModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { rtl } = useRtl();
  const { height: windowHeight } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const dirStyle = { direction: rtl ? ('rtl' as const) : ('ltr' as const) };

  const header = (
    <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
      {headerLeft != null ? (
        headerLeft
      ) : showCloseButton ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <Text
        className="flex-1 px-3 text-center text-base font-bold"
        style={{ color: colors.text }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {headerRight != null ? headerRight : <View style={{ width: 40 }} />}
    </View>
  );

  if (isWeb) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View
          className="flex-1 items-center justify-center px-4 py-8"
          style={{ backgroundColor: 'rgba(20, 16, 28, 0.48)', ...dirStyle }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss')}
            onPress={onClose}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          />
          <View
            pointerEvents="auto"
            accessibilityViewIsModal
            accessibilityLabel={title}
            style={{
              width: '100%',
              maxWidth,
              maxHeight: Math.min(windowHeight * 0.88, 760),
              borderRadius: 28,
              overflow: 'hidden',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.frostedBorder,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.18,
              shadowRadius: 28,
            }}
          >
            {header}
            <View style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>{children}</View>
            {footer}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background, ...dirStyle }}
        accessibilityViewIsModal
        accessibilityLabel={title}
      >
        {header}
        <View className="flex-1">{children}</View>
        {footer}
      </SafeAreaView>
    </Modal>
  );
}
