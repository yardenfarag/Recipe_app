import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MistAtmosphere } from '@/components/MistAtmosphere';

type ScreenProps = ViewProps & {
  children: ReactNode;
  edges?: Edge[];
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
  bare,
  plain,
  dense,
  className,
  ...rest
}: ScreenProps) {
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
    <SafeAreaView className={`flex-1 ${className ?? ''}`} edges={edges} {...rest}>
      {content}
    </SafeAreaView>
  );
}
