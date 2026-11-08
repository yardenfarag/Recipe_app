import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemePreference } from '@/hooks/useThemePreference';

import { reorderShift, reorderTargetIndex, type RowLayout } from './reorderTarget';

const LONG_PRESS_MS = 250;
/** Moving further than this before the long press fires means the user is scrolling. */
const SLOP = 8;

type ReorderableListProps<T extends { id: string }> = {
  items: T[];
  /** Space between rows, in px. */
  gap?: number;
  onMove: (from: number, to: number) => void;
  /** The parent ScrollView should stop scrolling while a row is dragged. */
  onDragStateChange?: (dragging: boolean) => void;
  /** `handle` is the long-press drag grip; put it at the row's leading edge. */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
};

/**
 * Rows that reorder by long-pressing the grip and dragging (PanResponder + Animated, like
 * CookMode; no extra dependency). Screen readers get "Move up" / "Move down" actions instead.
 */
export function ReorderableList<T extends { id: string }>({
  items,
  gap = 12,
  onMove,
  onDragStateChange,
  renderItem,
}: ReorderableListProps<T>) {
  const offsets = useRef(new Map<string, Animated.Value>());
  const layouts = useRef(new Map<string, RowLayout>());
  const drag = useRef<{ id: string; from: number; target: number } | null>(null);
  const resetAfterMove = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const offsetOf = useCallback((id: string) => {
    let value = offsets.current.get(id);
    if (!value) {
      value = new Animated.Value(0);
      offsets.current.set(id, value);
    }
    return value;
  }, []);

  // Rows snap back only once the new order has rendered, so nothing jumps for a frame.
  useLayoutEffect(() => {
    if (!resetAfterMove.current) return;
    resetAfterMove.current = false;
    offsets.current.forEach((value) => value.setValue(0));
  }, [items]);

  const start = useCallback(
    (id: string) => {
      const from = itemsRef.current.findIndex((item) => item.id === id);
      if (from < 0) return;
      drag.current = { id, from, target: from };
      setActiveId(id);
      onDragStateChange?.(true);
    },
    [onDragStateChange],
  );

  const move = useCallback(
    (dy: number) => {
      const current = drag.current;
      if (!current) return;
      offsetOf(current.id).setValue(dy);
      const list = itemsRef.current;
      const rowLayouts = list.map((item) => layouts.current.get(item.id) ?? { y: 0, height: 0 });
      const target = reorderTargetIndex(rowLayouts, current.from, dy);
      if (target === current.target) return;
      current.target = target;
      const distance = (rowLayouts[current.from]?.height ?? 0) + gap;
      list.forEach((item, index) => {
        if (index === current.from) return;
        Animated.timing(offsetOf(item.id), {
          toValue: reorderShift(index, current.from, target, distance),
          duration: 140,
          useNativeDriver: false,
        }).start();
      });
    },
    [gap, offsetOf],
  );

  const end = useCallback(() => {
    const current = drag.current;
    drag.current = null;
    setActiveId(null);
    onDragStateChange?.(false);
    if (!current) return;
    if (current.target === current.from) {
      offsets.current.forEach((value) =>
        Animated.timing(value, { toValue: 0, duration: 140, useNativeDriver: false }).start(),
      );
      return;
    }
    resetAfterMove.current = true;
    onMove(current.from, current.target);
  }, [onDragStateChange, onMove]);

  return (
    <View style={{ gap }}>
      {items.map((item, index) => (
        <Animated.View
          key={item.id}
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout;
            layouts.current.set(item.id, { y, height });
          }}
          style={{
            transform: [{ translateY: offsetOf(item.id) }],
            zIndex: activeId === item.id ? 10 : 0,
            elevation: activeId === item.id ? 6 : 0,
            opacity: activeId && activeId !== item.id ? 0.85 : 1,
          }}
        >
          {renderItem(
            item,
            index,
            <DragHandle
              active={activeId === item.id}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onStart={() => start(item.id)}
              onDrag={move}
              onEnd={end}
              onStep={(delta) => onMove(index, index + delta)}
            />,
          )}
        </Animated.View>
      ))}
    </View>
  );
}

type DragHandleProps = {
  active: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onStart: () => void;
  onDrag: (dy: number) => void;
  onEnd: () => void;
  onStep: (delta: -1 | 1) => void;
};

function DragHandle({ active, canMoveUp, canMoveDown, onStart, onDrag, onEnd, onStep }: DragHandleProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const latest = useRef({ onStart, onDrag, onEnd });
  latest.current = { onStart, onDrag, onEnd };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !dragging.current,
      onPanResponderGrant: () => {
        timer.current = setTimeout(() => {
          timer.current = null;
          dragging.current = true;
          latest.current.onStart();
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_, gesture) => {
        if (dragging.current) {
          latest.current.onDrag(gesture.dy);
        } else if (timer.current && (Math.abs(gesture.dy) > SLOP || Math.abs(gesture.dx) > SLOP)) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      },
      onPanResponderRelease: () => finish(),
      onPanResponderTerminate: () => finish(),
    }),
  ).current;

  function finish() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dragging.current) {
      dragging.current = false;
      latest.current.onEnd();
    }
  }

  const actions = [
    ...(canMoveUp ? [{ name: 'moveUp', label: t('cookbook.moveUp') }] : []),
    ...(canMoveDown ? [{ name: 'moveDown', label: t('cookbook.moveDown') }] : []),
  ];

  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityLabel={t('recipeEditor.reorderHint')}
      accessibilityActions={actions}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveUp' && canMoveUp) onStep(-1);
        if (event.nativeEvent.actionName === 'moveDown' && canMoveDown) onStep(1);
      }}
      className="h-11 w-8 items-center justify-center rounded-xl"
      style={{ backgroundColor: active ? colors.primarySoft : 'transparent' }}
    >
      <Ionicons name="reorder-three" size={22} color={active ? colors.primary : colors.textSecondary} />
    </View>
  );
}
