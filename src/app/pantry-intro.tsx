import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, KitIcon, Radii } from '@/components/ui/tokens';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import { fetchPantryItems } from '@shared/lib/supabase/pantry';

/**
 * Right after a new account is made, before the first-recipes picker (PIN-181): a sheet offering to fill the pantry
 * by photographing the fridge and cupboards. "Later" goes on to the picker; the pantry stays in Settings. An account
 * that already has a pantry (signing in again through onboarding) goes straight on.
 */
export default function PantryIntroScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/first-recipes');
      return;
    }
    let active = true;
    void fetchPantryItems()
      .then((items) => {
        if (!active) return;
        if (items.length > 0) router.replace('/first-recipes');
        else setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [loading, user]);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primaryText} accessibilityLabel={t('a11y.loading')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.backgroundElement }}>
      {/* The picture: a fridge and a camera, on the soft brand colour. */}
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + 24 }}
      >
        <View
          style={{
            width: 168,
            height: 168,
            borderRadius: 56,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <KitIcon icon="basket-outline" size={84} color={colors.primaryText} />
          <View
            style={{
              position: 'absolute',
              bottom: -10,
              end: -10,
              width: 64,
              height: 64,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              borderWidth: 4,
              borderColor: colors.backgroundElement,
            }}
          >
            <KitIcon icon="camera" size={30} color={colors.onPrimary} />
          </View>
        </View>
      </View>

      <View
        accessibilityViewIsModal
        style={{
          borderTopLeftRadius: Radii.tile,
          borderTopRightRadius: Radii.tile,
          borderTopWidth: HAIRLINE,
          borderColor: colors.border,
          backgroundColor: colors.background,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: insets.bottom + 20,
        }}
      >
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 20, backgroundColor: colors.border }}
        />
        <View style={{ width: '100%', maxWidth: FormContentWidth, alignSelf: 'center', gap: 14 }}>
          <Text variant="h2" accessibilityRole="header">
            {t('pantry.intro.title')}
          </Text>
          <Text variant="body" tone="muted">
            {t('pantry.intro.body')}
          </Text>
          <View style={{ gap: 10, marginTop: 6 }}>
            <Button
              trackId="pantry_intro.now"
              size="lg"
              fullWidth
              icon="camera-outline"
              onPress={() => router.replace('/pantry/scan?next=/first-recipes')}
            >
              {t('pantry.intro.now')}
            </Button>
            <Button
              trackId="pantry_intro.later"
              variant="ghost"
              size="lg"
              fullWidth
              onPress={() => router.replace('/first-recipes')}
            >
              {t('pantry.intro.later')}
            </Button>
          </View>
          <Text variant="caption" tone="muted" align="center">
            {t('pantry.intro.laterHint')}
          </Text>
        </View>
      </View>
    </View>
  );
}
