/**
 * The phone build compiles JSX through NativeWind (babel.config.js), which swaps React Native's Pressable for its
 * className wrapper. On iOS and Android that wrapper throws away `style={({ pressed }) => …}`, so every kit row,
 * chip and button lost its layout on the phone while Expo web (and the web screenshots) looked right.
 *
 * Under Node, NativeWind loads its web build, which leaves style functions alone. The mock below routes JSX through
 * NativeWind's native interop instead, the way wrap-jsx does on a phone, so these tests see what an iPhone sees.
 */
import { render, screen } from '@testing-library/react-native';
import { createElement, type ElementType, type ReactElement } from 'react';
// eslint-disable-next-line no-restricted-imports -- the bare component is what NativeWind wraps.
import { Pressable as RNPressable, StyleSheet } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { Pressable } from '@/components/ui/Pressable';

type Jsx = (type: ElementType, props: Record<string, unknown>, key?: string) => ReactElement;

vi.mock('nativewind/jsx-runtime', async () => {
  const runtime = await vi.importActual<typeof import('react/jsx-runtime')>('react/jsx-runtime');
  // The native half of NativeWind's runtime (an internal path, so typed by hand).
  const native = (await import('react-native-css-interop/dist/runtime/native/api')) as unknown as {
    cssInterop: (component: ElementType, mapping: Record<string, string>) => void;
    interopComponents: Map<ElementType, ElementType>;
  };
  const { Pressable: Base } = await import('react-native');
  native.cssInterop(Base, { className: 'style' });
  // The same swap as react-native-css-interop/dist/runtime/wrap-jsx.js, against the native component map.
  const wrap =
    (jsx: Jsx): Jsx =>
    (type, props, key) => {
      if (props?.cssInterop === false) {
        props = { ...props };
        delete props.cssInterop;
      } else {
        type = native.interopComponents.get(type) ?? type;
      }
      return jsx(type, props, key);
    };
  return { Fragment: runtime.Fragment, jsx: wrap(runtime.jsx as Jsx), jsxs: wrap(runtime.jsxs as Jsx) };
});

/** Renders through the mocked runtime, as a screen compiled for the phone would. */
async function renderNative(type: ElementType, props: Record<string, unknown>) {
  const { jsx } = (await import('nativewind/jsx-runtime')) as unknown as { jsx: Jsx };
  await render(jsx(type, props));
}

describe('Pressable on the phone', () => {
  it('NativeWind drops a style function on the bare Pressable (why the wrapper opts out)', async () => {
    await renderNative(RNPressable, { testID: 'bare', style: () => ({ flexDirection: 'row' }) });
    expect(StyleSheet.flatten(screen.getByTestId('bare').props.style)?.flexDirection).toBeUndefined();
  });

  it('keeps a style function', async () => {
    await renderNative(Pressable, {
      testID: 'row',
      trackId: 'test.row',
      onPress: () => {},
      style: ({ pressed }: { pressed: boolean }) => ({ flexDirection: 'row', gap: 12, opacity: pressed ? 0.5 : 1 }),
    });
    expect(StyleSheet.flatten(screen.getByTestId('row').props.style)).toMatchObject({
      flexDirection: 'row',
      gap: 12,
      opacity: 1,
    });
  });

  it('keeps a plain style', async () => {
    await render(createElement(Pressable, { testID: 'plain', trackId: 'test.plain', style: { width: 44, height: 44 } }));
    expect(StyleSheet.flatten(screen.getByTestId('plain').props.style)).toMatchObject({ width: 44, height: 44 });
  });
});
