import { useRef } from 'react';
import {
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps as RNPressableProps,
} from 'react-native';

import { logTap } from '@/lib/interactionLog';

export type PressableProps = RNPressableProps & {
  /**
   * Fixed id for the admin Activity log, like 'recipe.save' or
   * 'settings.theme.dark'. Never include titles, emails or typed text.
   */
  trackId?: string;
  ref?: React.Ref<React.ComponentRef<typeof RNPressable>>;
};

/**
 * React Native's Pressable, plus a tap log entry for every press and long
 * press. Logging is a synchronous push onto an in-memory queue, so it adds no
 * work to the render and nothing measurable to the press. Use this instead of
 * importing Pressable from 'react-native' (lint enforces it).
 */
export function Pressable({ trackId, onPress, onLongPress, ...rest }: PressableProps) {
  // Keep the latest handlers without making new wrapper functions each render.
  const testID = rest.testID;
  const handlers = useRef({ trackId, testID, onPress, onLongPress });
  handlers.current = { trackId, testID, onPress, onLongPress };

  const stable = useRef({
    press(event: GestureResponderEvent) {
      const { trackId: id, testID: tid, onPress: handler } = handlers.current;
      logTap(tapName(id, tid));
      handler?.(event);
    },
    longPress(event: GestureResponderEvent) {
      const { trackId: id, testID: tid, onLongPress: handler } = handlers.current;
      logTap(`${tapName(id, tid)}.long`);
      handler?.(event);
    },
  }).current;

  return (
    <RNPressable
      {...rest}
      onPress={onPress ? stable.press : undefined}
      onLongPress={onLongPress ? stable.longPress : undefined}
    />
  );
}

function tapName(trackId: string | undefined, testID: string | null | undefined): string {
  if (trackId) return trackId;
  if (testID) return testID;
  if (__DEV__) console.warn('[interactionLog] Pressable without trackId; logged as "unnamed"');
  return 'unnamed';
}
