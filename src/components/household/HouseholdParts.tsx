import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { TextField } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { KitIcon, type IconName } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { inviteTokenFrom } from '@shared/lib/supabase/household';

function ShareLine({ icon, label, muted = false }: { icon: IconName; label: string; muted?: boolean }) {
  const { colors } = useThemePreference();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: muted ? colors.backgroundElement : colors.primarySoft,
        }}
      >
        <KitIcon icon={icon} size={17} color={muted ? colors.textSecondary : colors.primaryText} />
      </View>
      <Text variant="bodySmall" tone={muted ? 'muted' : 'default'} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </Text>
    </View>
  );
}

/** What a household shares (list, pantry, "Always have") and what stays each person's own. */
export function HouseholdShares() {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 12 }}>
      <Text variant="h3">{t('household.shares.title')}</Text>
      <View style={{ gap: 10 }} accessibilityRole="list">
        <ShareLine icon="cart-outline" label={t('household.shares.list')} />
        <ShareLine icon="basket-outline" label={t('household.shares.pantry')} />
        <ShareLine icon="home-outline" label={t('household.shares.staples')} />
        <ShareLine icon="person-outline" label={t('household.shares.personal')} muted />
      </View>
    </View>
  );
}

/** "Have an invite?": paste the link someone sent, and go to the join screen. */
export function InvitePasteTile() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function go() {
    const token = inviteTokenFrom(text);
    if (!token) {
      setError(t('household.join.pasteInvalid'));
      announce(t('household.join.pasteInvalid'));
      return;
    }
    setError(null);
    setText('');
    router.push(`/join/${token}`);
  }

  return (
    <Tile padding={20} style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="h3">{t('household.join.pasteTitle')}</Text>
        <Text variant="caption" tone="muted">
          {t('household.join.pasteHint')}
        </Text>
      </View>
      <TextField
        label={t('household.join.pasteLabel')}
        placeholder="https://pinch-app.io/app/join/…"
        value={text}
        onChangeText={(value) => {
          setText(value);
          if (error) setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={go}
        error={error}
        // A link reads left to right in every language.
        style={{ writingDirection: 'ltr', textAlign: 'left' }}
      />
      <Button
        trackId="household.join.paste_continue"
        variant="secondary"
        disabled={!text.trim()}
        onPress={go}
      >
        {t('household.join.pasteButton')}
      </Button>
    </Tile>
  );
}
