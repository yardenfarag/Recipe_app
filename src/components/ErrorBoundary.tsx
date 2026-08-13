import Ionicons from '@expo/vector-icons/Ionicons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemePreference } from '@/hooks/useThemePreference';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors } = useThemePreference();
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ backgroundColor: colors.background }}
    >
      <View
        className="mb-5 h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.primarySoft }}
      >
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
      </View>
      <Text className="mb-2 text-center text-xl font-bold" style={{ color: colors.text }}>
        {t('errorBoundary.title')}
      </Text>
      <Text className="mb-6 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
        {t('errorBoundary.body')}
      </Text>
      <Pressable
        onPress={onRetry}
        className="rounded-full px-6 py-3 active:opacity-80"
        style={{ backgroundColor: colors.primary }}
      >
        <Text className="text-base font-bold text-white">{t('common.tryAgainAction')}</Text>
      </Pressable>
    </View>
  );
}

/** Catches unhandled render errors so the app shows recovery UI instead of a white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
