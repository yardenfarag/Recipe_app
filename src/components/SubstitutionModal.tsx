import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { formatQuantity } from '@/lib/formatQuantity';
import { RecipeLanguageCode } from '@/lib/recipeLanguages';
import {
  SubstitutionAlternative,
  suggestSubstitution,
} from '@/lib/supabase/suggestSubstitution';
import { Ingredient } from '@/types/recipe';

interface SubstitutionModalProps {
  visible: boolean;
  ingredient: Ingredient | null;
  recipeTitle: string;
  otherIngredients: string[];
  /** Active translation language — biases swaps to that locale's supermarket. */
  language?: RecipeLanguageCode | null;
  onClose: () => void;
  onApply: (alternative: SubstitutionAlternative) => void;
}

/**
 * Full-screen modal (ADR 005) shown when the user taps "Swap" on an
 * ingredient. Fetches 2-3 AI alternatives on open and lets the user apply
 * one, which the caller (`RecipeView`) writes back into the recipe.
 */
export function SubstitutionModal({
  visible,
  ingredient,
  recipeTitle,
  otherIngredients,
  language = null,
  onClose,
  onApply,
}: SubstitutionModalProps) {
  const { colors } = useThemePreference();
  const [loading, setLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<SubstitutionAlternative[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !ingredient) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setAlternatives([]);

    suggestSubstitution(ingredient, recipeTitle, otherIngredients, language)
      .then((result) => {
        if (!isMounted) return;
        if (result.status === 'failed' || !result.alternatives) {
          setError(result.message ?? "Couldn't find a substitute. Try again.");
          return;
        }
        setAlternatives(result.alternatives);
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Couldn't find a substitute. Try again.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ingredient?.name, language]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            Swap ingredient
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {ingredient && (
            <View
              className="mb-5 rounded-3xl border p-4"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <Text className="mb-1 text-xs font-medium" style={{ color: colors.textSecondary }}>
                Instead of
              </Text>
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                {formatQuantity(ingredient.quantity, ingredient.unit, language)} {ingredient.name}
              </Text>
            </View>
          )}

          {loading && (
            <View className="items-center py-12">
              <ActivityIndicator color={colors.primary} size="large" />
              <Text className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                Finding cozy alternatives…
              </Text>
            </View>
          )}

          {!loading && error && (
            <View
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
            >
              <Text className="text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            </View>
          )}

          {!loading &&
            alternatives.map((alt) => (
              <View
                key={alt.name}
                className="mb-3 rounded-3xl border p-4"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <Text className="mb-1 text-base font-bold" style={{ color: colors.text }}>
                  {formatQuantity(alt.quantity, alt.unit, language)} {alt.name}
                </Text>
                <Text className="mb-3 text-sm leading-5" style={{ color: colors.textSecondary }}>
                  {alt.reason}
                </Text>
                <Pressable
                  className="items-center rounded-full py-3 active:opacity-80"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => onApply(alt)}
                >
                  <Text className="text-sm font-bold text-white">Use this</Text>
                </Pressable>
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
