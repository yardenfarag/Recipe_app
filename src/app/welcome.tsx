import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { WebIntroPage } from '@/components/web-intro/WebIntroPage';

/** Public intro, also linked from Settings on web. Native opens the app instead. */
export default function WelcomeScreen() {
  useEffect(() => {
    if (Platform.OS !== 'web') router.replace('/');
  }, []);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#070508' }}>
      <WebIntroPage />
    </View>
  );
}
