import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MistAtmosphere } from '@/components/MistAtmosphere';

const TAB_SCREEN_EDGES: Edge[] = ['top', 'left', 'right'];

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
  const resolvedEdges = edges ?? (tabScreen ? TAB_SCREEN_EDGES : undefined);
  const content = plain ? (
    children
  ) : (
    <MistAtmosphere dense={dense}>{children}</MistAtmosphere>
  );

  if (bare) {
    return (
      <View className={`flex-1 ${className ?? ''}`} {...rest}>
        {content}
      </View>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${className ?? ''}`} edges={resolvedEdges} {...rest}>
      {content}
    </SafeAreaView>
  );
}
