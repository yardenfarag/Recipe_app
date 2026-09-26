import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';

import { LegalDocumentView } from '@/components/LegalDocument';
import { Screen } from '@/components/Screen';
import { useThemePreference } from '@/hooks/useThemePreference';
import { legalDoc } from '@/lib/legalDocs';

export default function LegalDocScreen() {
  const { doc: raw } = useLocalSearchParams<{ doc: string }>();
  const doc = legalDoc(typeof raw === 'string' ? raw : '');
  const { colors } = useThemePreference();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const previous = document.title;
    document.title = doc ? `${doc.title} — Pinch` : 'Pinch';
    return () => {
      document.title = previous;
    };
  }, [doc]);

  if (!doc) {
    return (
      <Screen dense>
        <Stack.Screen options={{ title: 'Legal' }} />
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ color: colors.textSecondary }}>That page is not available.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: doc.title }} />
      <LegalDocumentView doc={doc} />
    </>
  );
}
