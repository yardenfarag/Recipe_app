import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveInAppMessage, useInAppMessageActions } from '@/hooks/useInAppMessages';
import { useBreakpoint } from '@/hooks/useBreakpoint';

import { BannerPresenter } from './BannerPresenter';
import { useMessageView } from './useMessageView';
import type { InAppMessage } from '@/lib/inAppMessages';

/** Same numbers as `src/components/app-tabs.tsx`: the bottom tab bar's height, so a bottom banner sits above it. */
const TAB_BAR_CONTENT_HEIGHT = 56;

function isBanner(message: InAppMessage | null): message is InAppMessage {
  // A required message is always full screen, whatever its row says.
  return message !== null && message.presentation === 'banner' && !message.required;
}

function BannerView({ message, position }: { message: InAppMessage; position: 'top' | 'bottom' }) {
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();
  const view = useMessageView(message);
  const { onAction, onClose } = useInAppMessageActions(message);

  if (position === 'bottom') {
    // Over the content, just above the bottom tab bar (wide layouts have none).
    const bottom = isWide ? 0 : TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 8);
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 20 }}>
        <BannerPresenter view={view} onAction={onAction} onClose={onClose} edge="bottom" />
      </View>
    );
  }
  // In the layout, above the tabs (and, on wide web, above the sidebar and content), so it pushes the screen down.
  return <BannerPresenter view={view} onAction={onAction} onClose={onClose} edge="top" inset={insets.top} />;
}

/**
 * Where a `banner` message appears. Mount `position="top"` above the tabs and
 * `position="bottom"` over them, in `src/app/(tabs)/_layout.tsx`. Each shows
 * only the message whose `bannerPosition` matches (default top).
 */
export function InAppMessageBanner({ position }: { position: 'top' | 'bottom' }) {
  const message = useActiveInAppMessage();
  if (!isBanner(message)) return null;
  if ((message.bannerPosition ?? 'top') !== position) return null;
  return <BannerView message={message} position={position} />;
}
