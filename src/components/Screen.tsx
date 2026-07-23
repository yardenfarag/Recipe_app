import { type ReactNode } from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MistAtmosphere } from '@/components/MistAtmosphere';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Android status bar is opaque — top inset is handled natively; extra padding caused a light band. */
const TAB_SCREEN_EDGES: Edge[] =
  Platform.OS === 'android' ? ['left', 'right'] : ['top', 'left', 'right'];

type ScreenProps = ViewProps & {
  children: ReactNode;
  edges?: Edge[];
  /** Bottom inset is handled by the tab bar — use on tab root screens. */
  tabScreen?: boolean;
  /** Skip SafeAreaView — useful when a parent already handles insets. */
  bare?: boolean;
  /** Skip mist gradient/orbs (rare — e.g. full-bleed media). */
  plain?: boolean;
  /** Fewer atmosphere orbs. */
  dense?: boolean;
};

/** App canvas with theme-pack Drift atmosphere. */
export function Screen({
  children,
  edges,
  tabScreen,
  bare,
  plain,
  dense,
  className,
  ...rest
}: ScreenProps) {
  const { colors } = useThemePreference();
  const resolvedEdges =
    edges ??
    (tabScreen
      ? TAB_SCREEN_EDGES
      : Platform.OS === 'android'
        ? (['left', 'right', 'bottom'] as Edge[])
        : undefined);
  const canvasStyle = { backgroundColor: colors.background };
  const content = plain ? (
    children
  ) : (
    <MistAtmosphere dense={dense}>{children}</MistAtmosphere>
  );

  if (bare) {
    return (
      <View className={`flex-1 ${className ?? ''}`} style={canvasStyle} {...rest}>
        {content}
      </View>
    );
  }

  return (
    <SafeAreaView
      className={`flex-1 ${className ?? ''}`}
      edges={resolvedEdges}
      style={canvasStyle}
      {...rest}
    >
      {content}
    </SafeAreaView>
  );
}
