import { useEffect, useRef } from 'react';
import { Alert, I18nManager, Modal, Platform, ScrollView, View, useWindowDimensions } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { logTap } from '@/lib/interactionLog';
import type { ButtonAction, ClickedButton } from '@/lib/inAppMessages';

import { CloseButton } from './CloseButton';
import { MessageContent, type MessageActionHandler } from './MessageContent';
import { useModalShow } from './useModalShow';
import { canUseSystemAlert, needsCloseButton, type MessageView } from './viewModel';

type PresenterProps = {
  view: MessageView;
  onAction: MessageActionHandler;
  onClose: () => void;
  /** The message is really on screen; only then is it recorded as seen. */
  onShown: () => void;
};

const TRACK = 'in_app_message.alert';

/**
 * The system alert (UIAlertController on iOS, AlertDialog on Android) when it
 * can show the message faithfully; otherwise a centred card in the
 * ConfirmDialog style. Web always gets the card, because `Alert.alert` does
 * nothing there. See `canUseSystemAlert` for when the card is used on a phone.
 */
export function AlertPresenter({ view, onAction, onClose, onShown }: PresenterProps) {
  const system = canUseSystemAlert(view, { platform: Platform.OS, deviceRtl: I18nManager.isRTL });
  return system ? (
    <SystemAlert view={view} onAction={onAction} onClose={onClose} onShown={onShown} />
  ) : (
    <AlertCard view={view} onAction={onAction} onClose={onClose} onShown={onShown} />
  );
}

function SystemAlert({ view, onAction, onClose, onShown }: PresenterProps) {
  // Latest handlers without re-showing the alert when they change.
  const latest = useRef({ onAction, onClose, onShown });
  latest.current = { onAction, onClose, onShown };
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (shownFor.current === view.message.id) return;
    shownFor.current = view.message.id;

    const entries: { text: string; kind: ClickedButton; action: ButtonAction }[] = view.buttons.map((button) => ({
      text: button.label,
      kind: button.kind,
      action: button.action,
    }));
    if (view.link && entries.length < 2) {
      entries.push({ text: view.link.label, kind: 'link', action: { type: 'link', url: view.link.url } });
    }

    const buttons = entries.map((entry) => ({
      text: entry.text,
      style: entry.action.type === 'dismiss' ? ('cancel' as const) : ('default' as const),
      onPress: () => {
        logTap(`${TRACK}.${entry.kind}`);
        latest.current.onAction(entry.kind, entry.action);
      },
    }));
    // iOS closes an alert only through a button, so a dismissible alert with no "dismiss" button gets one.
    if (needsCloseButton(view)) {
      buttons.push({
        text: view.closeLabel,
        style: 'cancel' as const,
        onPress: () => {
          logTap(`${TRACK}.close`);
          latest.current.onClose();
        },
      });
    }

    Alert.alert(view.title, view.body || undefined, buttons, {
      cancelable: view.dismissible,
      onDismiss: () => latest.current.onClose(),
    });
    // The system alert has no "shown" event and is not blocked by a modal that is up: it is on screen now.
    latest.current.onShown();
  }, [view]);

  return null;
}

function AlertCard({ view, onAction, onClose, onShown }: PresenterProps) {
  const { colors } = useThemePreference();
  const { modalKey, onShow } = useModalShow(onShown);
  const { height } = useWindowDimensions();
  const dismissible = view.dismissible;

  return (
    <Modal
      key={modalKey}
      visible
      transparent
      animationType="fade"
      onShow={onShow}
      // Android back and web Escape: close a dismissible message, ignore otherwise.
      onRequestClose={dismissible ? onClose : () => {}}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          backgroundColor: 'rgba(0,0,0,0.45)',
          direction: view.rtl ? 'rtl' : 'ltr',
        }}
      >
        {dismissible ? (
          <Pressable
            trackId={`${TRACK}.backdrop`}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={view.closeLabel}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          />
        ) : null}
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={dismissible ? onClose : undefined}
          style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: height - 48,
            borderRadius: 28,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
            // RN-web: keep percentage widths inside the card, not the viewport.
            boxSizing: 'border-box',
          }}
        >
          <ScrollView bounces={false} contentContainerStyle={{ padding: 20 }} style={{ flexGrow: 0 }}>
            <MessageContent
              view={view}
              trackPrefix={TRACK}
              onAction={onAction}
              closeButton={needsCloseButton(view) ? { label: view.closeLabel, onPress: onClose } : undefined}
            />
          </ScrollView>
          {/* The close control's side is explicit: react-native-web turns `end` into `right` whatever the direction. */}
          {dismissible ? (
            <View style={{ position: 'absolute', top: 12, ...(view.rtl ? { left: 12 } : { right: 12 }) }}>
              <CloseButton trackId={`${TRACK}.close`} onPress={onClose} size={36} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
