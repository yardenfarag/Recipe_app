import { type ReactNode } from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { MistAtmosphere } from '@/components/MistAtmosphere';
import { MaxContentWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Tab roots: top inset clears the status bar; bottom is owned by the tab bar. */
const TAB_SCREEN_EDGES: Edge[] = ['top', 'left', 'right'];

/** Stack screens without a native header — inset all sides. */
const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right', 'bottom'];

/** Web has no status-bar inset — keep content from kissing the viewport edge. */
const WEB_TOP_INSET = 28;

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
  /**
   * Constrain children to MaxContentWidth on medium+ (default true).
   * Atmosphere stays full-bleed either way.
   */
  constrainWidth?: boolean;
};

/** App canvas with theme-pack Drift atmosphere. */
export function Screen({
  children,
  edges,
  tabScreen,
  bare,
  plain,
  dense,
  constrainWidth = true,
  className,
  style,
  ...rest
}: ScreenProps) {
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const resolvedEdges = edges ?? (tabScreen ? TAB_SCREEN_EDGES : DEFAULT_EDGES);
  const needsTop = resolvedEdges.includes('top');
  // Pad content only — never the outer canvas — so MistAtmosphere stays edge-to-edge.
  const webTopPad =
    Platform.OS === 'web' && needsTop ? Math.max(0, WEB_TOP_INSET - insets.top) : 0;
  const canvasStyle = { flex: 1, backgroundColor: colors.background };

  // Keep layout classes (items-center, px-*, etc.) on an inner flex child so
  // SafeAreaView / MistAtmosphere stay full-bleed. Centering on the outer
  // canvas shrinks the atmosphere to content width — a thin "narrow screen".
  const inner = (
    <View
      className={`flex-1 ${className ?? ''}`}
      style={[{ paddingTop: webTopPad || undefined }, style]}
      {...rest}
    >
      {children}
    </View>
  );

  const body =
    constrainWidth && isMediumUp ? (
      <View style={{ flex: 1, width: '100%', alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: MaxContentWidth }}>{inner}</View>
      </View>
    ) : (
      inner
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
