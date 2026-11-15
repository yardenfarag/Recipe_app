import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';

import { CloseButton } from './CloseButton';
import { MessageContent, type MessageActionHandler } from './MessageContent';
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
}: {
  view: MessageView;
  onAction: MessageActionHandler;
  onClose: () => void;
}) {
  const { colors } = useThemePreference();
  const dismissible = view.dismissible;

  return (
    <Modal
      visible
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
