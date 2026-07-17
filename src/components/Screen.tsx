import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

type ScreenProps = ViewProps & {
  children: ReactNode;
  edges?: Edge[];
  /** Skip SafeAreaView — useful when a parent already handles insets. */
  bare?: boolean;
};

/** App canvas with theme-aware background. */
export function Screen({ children, edges, bare, className, ...rest }: ScreenProps) {
  const bg = 'flex-1 bg-pinch-bg dark:bg-pinch-bg-dark';

  if (bare) {
    return (
      <View className={`${bg} ${className ?? ''}`} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <SafeAreaView className={`${bg} ${className ?? ''}`} edges={edges} {...rest}>
      {children}
    </SafeAreaView>
  );
}
