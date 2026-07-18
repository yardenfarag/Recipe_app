import Ionicons from '@expo/vector-icons/Ionicons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches unhandled render errors so the app shows recovery UI instead of a white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-pinch-bg px-8 dark:bg-pinch-bg-dark">
          <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
            <Ionicons name="alert-circle-outline" size={32} color="#C45C7A" />
          </View>
          <Text className="mb-2 text-center text-xl font-bold text-pinch-dark dark:text-pinch-text-dark">
            Something went wrong
          </Text>
          <Text className="mb-6 text-center text-sm leading-5 text-pinch-muted dark:text-pinch-muted-dark">
            {this.state.error.message || 'An unexpected error occurred.'}
          </Text>
          <Pressable
            onPress={this.handleRetry}
            className="rounded-full bg-pinch-primary px-6 py-3 active:opacity-80 dark:bg-pinch-primary-dark"
          >
            <Text className="text-base font-bold text-white">Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
