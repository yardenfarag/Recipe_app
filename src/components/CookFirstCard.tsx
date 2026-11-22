import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeImage';
import { Pressable } from '@/components/ui/Pressable';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import type { Recipe } from '@shared/types/recipe';

const DISMISSED_KEY = 'pinch:cook-first-dismissed-at';
/** "Not now" hides the card for this long. */
const QUIET_DAYS = 3;

/**
 * For someone with saved recipes who has never marked one cooked: one recipe to make tonight, at the top of the
 * Library (as on the web). Cooking is what makes people come back and save more. `recipe` comes from
 * firstCookSuggestion (shared/lib/cookTonight.ts).
 */
export function CookFirstCard({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign, writingDirection } = useRtl();
  const rtlText = { textAlign, writingDirection };
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => {
        const at = Number(value);
        const recent = Number.isFinite(at) && at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
        if (active) setHidden(recent);
      })
      .catch(() => {
        if (active) setHidden(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    void AsyncStorage.setItem(DISMISSED_KEY, String(Date.now())).catch(() => {
      // Hidden for this session only.
    });
  }

  const title = recipe.display_title ?? recipe.title;
  const duration = recipe.estimated_time_minutes
    ? formatRecipeDuration(recipe.estimated_time_minutes, {
        minutes: t('recipe.durationMin'),
        hours: t('recipe.durationHr'),
      })
    : null;

  return (
    <Pressable
      trackId="library.cook_first.open"
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${t('library.cookFirstTitle')}: ${title}`}
      accessibilityHint={t('library.cookFirstBody')}
      className="flex-row items-center gap-3 rounded-[22px] p-3 active:opacity-90"
      style={{ backgroundColor: colors.accentSoft }}
    >
      {recipe.image_url ? (
        <RecipeImage uri={recipe.image_url} variant="compact" style={{ width: 56, height: 56 }} aiGenerated={recipe.image_generated} />
      ) : (
        <View
          className="h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Ionicons name="restaurant" size={22} color={colors.primary} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold" style={{ color: colors.accent, ...rtlText }}>
          {t('library.cookFirstTitle')}
        </Text>
        <Text className="text-base font-bold" numberOfLines={1} style={{ color: colors.text, ...rtlText }}>
          {title}
        </Text>
        <Text className="text-xs" numberOfLines={1} style={{ color: colors.textSecondary, ...rtlText }}>
          {duration ? `${duration} · ` : ''}
          {t('library.cookFirstBody')}
        </Text>
      </View>
      <Pressable
        trackId="library.cook_first.dismiss"
        onPress={dismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.notNow')}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}
