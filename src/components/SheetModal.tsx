import { type ReactNode } from 'react';
import { Modal, Platform, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { MIN_TOUCH, Radii } from '@/components/ui/tokens';
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
  /** Tap-log id prefix; logs `<trackId>.close` and `<trackId>.backdrop`. */
  trackId?: string;
  /** Called once the modal is really on screen (the `Modal`'s own `onShow`). */
  onShow?: () => void;
};

/** Below this window width the web sheet rises from the bottom, as on a phone; wider, it is a centred card. */
const WEB_SHEET_BELOW = 640;

/** The small bar at the top of a sheet that says it is a sheet. */
function Grabber() {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 10, backgroundColor: colors.border }}
    />
  );
}

/**
 * A sheet for longer content (a picker, a form), Night Market style (PIN-177): the page colour, 28 corners at the
 * top, a grabber, the title in Space Grotesk, flat. Native: the system page sheet (iOS draws its own corners; Android
 * fills the window). Web: rises from the bottom on a phone-sized window, a centred card on a wider one, over the dim
 * overlay.
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
  trackId = 'sheet_modal',
  onShow,
}: SheetModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { rtl } = useRtl();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const dirStyle = { direction: rtl ? ('rtl' as const) : ('ltr' as const) };

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 8,
        minHeight: MIN_TOUCH + 18,
      }}
    >
      {headerLeft != null ? (
        headerLeft
      ) : showCloseButton ? (
        <IconButton
          variant="tile"
          icon="close"
          label={t('common.close')}
          trackId={`${trackId}.close`}
          onPress={onClose}
          iconSize={20}
        />
      ) : (
        <View style={{ width: MIN_TOUCH }} />
      )}
      <Text variant="h3" align="center" numberOfLines={2} style={{ flex: 1, paddingHorizontal: 4 }}>
        {title}
      </Text>
      {headerRight != null ? headerRight : <View style={{ width: MIN_TOUCH }} />}
    </View>
  );

  if (isWeb) {
    const asSheet = windowWidth < WEB_SHEET_BELOW;
    return (
      <Modal
        visible={visible}
        transparent
        animationType={asSheet ? 'slide' : 'fade'}
        onRequestClose={onClose}
        onShow={onShow}
      >
        <View
          style={{
            flex: 1,
            justifyContent: asSheet ? 'flex-end' : 'center',
            backgroundColor: colors.overlay,
            paddingHorizontal: asSheet ? 0 : 20,
            paddingTop: asSheet ? 48 : 32,
            paddingBottom: asSheet ? 0 : 32,
            ...dirStyle,
          }}
        >
          <Pressable
            trackId={`${trackId}.backdrop`}
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss')}
            onPress={onClose}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <View
            pointerEvents="auto"
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            accessibilityLabel={title}
            style={{
              width: '100%',
              maxWidth: asSheet ? undefined : maxWidth,
              alignSelf: 'center',
              maxHeight: asSheet ? windowHeight * 0.9 : Math.min(windowHeight * 0.88, 760),
              borderTopLeftRadius: Radii.tile,
              borderTopRightRadius: Radii.tile,
              borderBottomLeftRadius: asSheet ? 0 : Radii.tile,
              borderBottomRightRadius: asSheet ? 0 : Radii.tile,
              overflow: 'hidden',
              backgroundColor: colors.background,
              borderWidth: asSheet ? 0 : 1,
              borderColor: colors.border,
              paddingBottom: asSheet ? insets.bottom : 0,
              // RN-web: keep percentage widths inside the card, not the viewport.
              boxSizing: 'border-box',
            }}
          >
            {asSheet ? <Grabber /> : null}
            {header}
            <View
              style={{
                width: '100%',
                flexGrow: 1,
                flexShrink: 1,
                minHeight: 0,
                alignSelf: 'stretch',
              }}
            >
              {children}
            </View>
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
      onShow={onShow}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, ...dirStyle }}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <Grabber />
        {header}
        <View style={{ flex: 1 }}>{children}</View>
        {footer}
      </SafeAreaView>
    </Modal>
  );
}
