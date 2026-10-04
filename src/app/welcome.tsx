import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Public intro, also linked from Settings on web: the static page at the site root. Native opens the app instead. */
export default function WelcomeScreen() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      window.location.assign('/');
    } else {
      router.replace('/');
    }
  }, []);

  return null;
}
