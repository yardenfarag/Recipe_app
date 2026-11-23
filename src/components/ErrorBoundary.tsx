import Ionicons from '@expo/vector-icons/Ionicons';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors } = useThemePreference();
  const { t } = useTranslation();

  useEffect(() => {
    announce(`${t('errorBoundary.title')}. ${t('errorBoundary.body')}`);
  }, [t]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: colors.background }}>
      <Tile padding={28} style={{ alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.dangerSoft,
            marginBottom: 4,
          }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        </View>
        <Text variant="h2" align="center">
          {t('errorBoundary.title')}
        </Text>
        <Text variant="bodySmall" tone="muted" align="center">
          {t('errorBoundary.body')}
        </Text>
        <Button trackId="error_boundary.retry" size="lg" fullWidth onPress={onRetry} style={{ marginTop: 8 }}>
          {t('common.tryAgainAction')}
        </Button>
      </Tile>
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
