import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pinchOrange } from '@/constants/brandColors';
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
  onClose,
  onApply,
}: SubstitutionModalProps) {
  const [loading, setLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<SubstitutionAlternative[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !ingredient) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setAlternatives([]);

    suggestSubstitution(ingredient, recipeTitle, otherIngredients).then((result) => {
      if (!isMounted) return;
      setLoading(false);
      if (result.status === 'failed' || !result.alternatives) {
        setError(result.message ?? "Couldn't find a substitute. Try again.");
        return;
      }
      setAlternatives(result.alternatives);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ingredient?.name]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-pinch-cream">
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Pressable onPress={onClose} className="px-1 py-1 active:opacity-60">
            <Text className="text-2xl text-pinch-dark">‹</Text>
          </Pressable>
          <Text className="text-base font-bold text-pinch-dark">Swap Ingredient</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView className="flex-1 px-5">
          {ingredient && (
            <View className="bg-white rounded-2xl p-4 mb-5 border border-gray-100">
              <Text className="text-xs text-gray-400 mb-1">Instead of</Text>
              <Text className="text-lg font-bold text-pinch-dark">
                {ingredient.quantity} {ingredient.unit} {ingredient.name}
              </Text>
            </View>
          )}

          {loading && (
            <View className="items-center py-10">
              <ActivityIndicator color={pinchOrange} />
              <Text className="text-sm text-gray-400 mt-3">Finding alternatives…</Text>
            </View>
          )}

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          )}

          {!loading &&
            alternatives.map((alt) => (
              <View
                key={alt.name}
                className="bg-white rounded-2xl p-4 mb-3 border border-gray-100"
              >
                <Text className="text-base font-bold text-pinch-dark mb-1">
                  {alt.quantity} {alt.unit} {alt.name}
                </Text>
                <Text className="text-sm text-gray-500 mb-3">{alt.reason}</Text>
                <Pressable
                  className="bg-pinch-green rounded-full py-3 items-center active:opacity-80"
                  onPress={() => onApply(alt)}
                >
                  <Text className="text-white font-bold text-sm">Use this</Text>
                </Pressable>
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
