import { Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin/AdminOnly';
import { Screen } from '@/components/Screen';
import { useThemePreference } from '@/hooks/useThemePreference';

/** The dashboard is built for a desktop browser; dashboard.web.tsx is the real page. */
export default function AdminDashboardScreen() {
  const { colors } = useThemePreference();
  return (
    <AdminOnly>
      <Screen dense>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="mb-2 text-center text-lg font-semibold" style={{ color: colors.text }} accessibilityRole="header">
            Open the dashboard on a computer
          </Text>
          <Text className="text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
            pinch-app.io/app/admin/dashboard
          </Text>
        </View>
      </Screen>
    </AdminOnly>
  );
}
