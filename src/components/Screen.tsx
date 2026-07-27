import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MistAtmosphere } from '@/components/MistAtmosphere';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Tab roots: top inset clears the status bar; bottom is owned by the tab bar. */
const TAB_SCREEN_EDGES: Edge[] = ['top', 'left', 'right'];

/** Stack screens without a native header — inset all sides. */
const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right', 'bottom'];

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
  style,
  ...rest
}: ScreenProps) {
  const { colors } = useThemePreference();
  const resolvedEdges = edges ?? (tabScreen ? TAB_SCREEN_EDGES : DEFAULT_EDGES);
  const canvasStyle = { flex: 1, backgroundColor: colors.background };

  // Keep layout classes (items-center, px-*, etc.) on an inner flex child so
  // SafeAreaView / MistAtmosphere stay full-bleed. Centering on the outer
  // canvas shrinks the atmosphere to content width — a thin "narrow screen".
  const body = (
    <View className={`flex-1 ${className ?? ''}`} style={style} {...rest}>
      {children}
    </View>
  );

  const content = plain ? body : <MistAtmosphere dense={dense}>{body}</MistAtmosphere>;

  if (bare) {
    return <View style={canvasStyle}>{content}</View>;
  }

  return (
    <SafeAreaView className="flex-1" edges={resolvedEdges} style={canvasStyle}>
      {content}
    </SafeAreaView>
  );
}
