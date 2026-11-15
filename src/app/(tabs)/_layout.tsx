import { View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { InAppMessageBanner } from '@/components/inAppMessages/InAppMessageBanner';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      {/* In-app message banners: top pushes the tabs down, bottom floats above the tab bar. */}
      <InAppMessageBanner position="top" />
      <View style={{ flex: 1 }}>
        <AppTabs />
      </View>
      <InAppMessageBanner position="bottom" />
    </View>
  );
}
