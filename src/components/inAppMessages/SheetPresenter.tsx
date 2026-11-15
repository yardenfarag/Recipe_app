import { ScrollView, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';

import { MessageContent, type MessageActionHandler } from './MessageContent';
import { useModalShow } from './useModalShow';
import type { MessageView } from './viewModel';

const TRACK = 'in_app_message.sheet';

const noop = () => {};

/**
 * `SheetModal`: a page sheet on iOS (UIModalPresentationPageSheet), a
 * full-window dialog on Android (no native bottom sheet without a new module,
 * see docs/research/07-in-app-messages-native-components.md), and a centred
 * card on a dimmed backdrop on web. `SheetModal` never turns on swipe-down
 * dismissal, so a swipe never closes it; a message that can't be dismissed
 * also loses its close button, and back, backdrop and Escape do nothing.
 */
export function SheetPresenter({
  view,
  onAction,
  onClose,
  onShown,
}: {
  view: MessageView;
  onAction: MessageActionHandler;
  onClose: () => void;
  onShown: () => void;
}) {
  const dismissible = view.dismissible;
  const { modalKey, onShow } = useModalShow(onShown);
  return (
    <SheetModal
      key={modalKey}
      visible
      onShow={onShow}
      title={view.title}
      onClose={dismissible ? onClose : noop}
      showCloseButton={dismissible}
      headerLeft={dismissible ? undefined : <View style={{ width: 40 }} />}
      trackId={TRACK}
      maxWidth={480}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <MessageContent view={view} trackPrefix={TRACK} onAction={onAction} showTitle={false} />
      </ScrollView>
    </SheetModal>
  );
}
