import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';

import { CloseButton } from './CloseButton';
import { MessageContent, type MessageActionHandler } from './MessageContent';
import { useModalShow } from './useModalShow';
import type { MessageView } from './viewModel';

const TRACK = 'in_app_message.fullscreen';

const noop = () => {};

/**
 * A full-screen modal. A required message (or any that can't be dismissed)
 * has no close button, and Android back, the web Escape key and the iOS swipe
 * do nothing: `onRequestClose` is a no-op and `allowSwipeDismissal` stays
 * off. On web it is a full-viewport overlay with the RN-web Modal's focus trap.
 */
export function FullscreenPresenter({
  view,
  onAction,
  onClose,
  onShown,
  onAdminHide,
}: {
  view: MessageView;
  onAction: MessageActionHandler;
  onClose: () => void;
  /** The modal is really on screen; only then is the message recorded as seen. */
  onShown: () => void;
  /**
   * Given only when the signed-in user is an admin: hides the message for the
   * rest of this launch and records nothing. Without it a required message
   * covers the admin screen on the admin's own device.
   */
  onAdminHide?: () => void;
}) {
  const { colors } = useThemePreference();
  const { modalKey, onShow } = useModalShow(onShown);
  const dismissible = view.dismissible;

  return (
    <Modal
      key={modalKey}
      visible
      onShow={onShow}
      animationType="fade"
      presentationStyle="fullScreen"
      allowSwipeDismissal={dismissible}
      onRequestClose={dismissible ? onClose : noop}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, direction: view.rtl ? 'rtl' : 'ltr' }}
        accessibilityViewIsModal
        onAccessibilityEscape={dismissible ? onClose : undefined}
      >
        {onAdminHide ? (
          <View style={{ alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8 }}>
            <Pressable
              trackId={`${TRACK}.admin_hide`}
              onPress={onAdminHide}
              accessibilityRole="button"
              accessibilityLabel="Admin only: hide this message until the app restarts"
              style={({ pressed }) => ({
                minHeight: 40,
                justifyContent: 'center',
                borderRadius: 20,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                Admin only: hide until the app restarts
              </Text>
            </Pressable>
          </View>
        ) : null}
        {dismissible ? (
          <View style={{ alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }}>
            <CloseButton trackId={`${TRACK}.close`} onPress={onClose} />
          </View>
        ) : null}
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: '100%', maxWidth: 480 }}>
            <MessageContent view={view} trackPrefix={TRACK} onAction={onAction} align="center" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
