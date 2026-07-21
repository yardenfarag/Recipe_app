import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { RECIPE_VARIANTS, RecipeVariantKey } from '@/lib/recipeVariants';
import { transformRecipe, TransformedRecipePayload } from '@/lib/supabase/transformRecipe';
import { TOKEN_COST_REMIX } from '@/lib/tokens';
import { Ingredient, Instruction } from '@/types/recipe';

interface RecipeVariantModalProps {
  visible: boolean;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
  onClose: () => void;
  onApply: (result: TransformedRecipePayload, variant: RecipeVariantKey) => void;
}

/**
 * Sheet for picking a dietary/lifestyle remix (healthier, vegan, etc.).
 * Calls Gemini and lets the user preview + apply the adapted recipe.
 */
export function RecipeVariantModal({
  visible,
  title,
  servings,
  ingredients,
  instructions,
  calories,
  onClose,
  onApply,
}: RecipeVariantModalProps) {
  const { colors } = useThemePreference();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    variant: RecipeVariantKey;
    recipe: TransformedRecipePayload;
  } | null>(null);

  function handleClose() {
    if (loading) return;
    setError(null);
    setPreview(null);
    onClose();
  }

  async function handleSelectVariant(variant: RecipeVariantKey) {
    if (loading) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const result = await transformRecipe(variant, {
        title,
        servings,
        ingredients,
        instructions,
        calories,
      });

      if (result.status === 'failed' || !result.recipe) {
        if (result.code === 'auth_required') {
          setError('sign_in');
        } else {
          setError(result.message ?? "Couldn't adapt this recipe. Try again.");
        }
        return;
      }

      setPreview({ variant, recipe: result.recipe });
    } catch {
      setError("Couldn't adapt this recipe. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!preview) return;
    onApply(preview.recipe, preview.variant);
    setPreview(null);
    setError(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
          <Pressable
            onPress={handleClose}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            Remix this recipe
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {!preview && !loading && (
            <>
              <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
                Pick a style — we&apos;ll adapt ingredients and steps while keeping the spirit of
                the dish.
              </Text>

              {RECIPE_VARIANTS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => handleSelectVariant(option.key)}
                  className="mb-3 flex-row items-center gap-3.5 rounded-3xl border p-4 active:opacity-90"
                  style={{ borderColor: colors.border, backgroundColor: colors.surface }}
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: colors.primarySoft }}
                  >
                    <Ionicons
                      name={option.icon as keyof typeof Ionicons.glyphMap}
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold" style={{ color: colors.text }}>
                      {option.label}
                    </Text>
                    <Text className="mt-0.5 text-sm" style={{ color: colors.textSecondary }}>
                      {option.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </Pressable>
              ))}
            </>
          )}

          {loading && (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.primary} size="large" />
              <Text className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                Adapting your recipe…
              </Text>
            </View>
          )}

          {!loading && error && (
            <View
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
            >
              {error === 'sign_in' ? (
                <>
                  <Text className="text-sm" style={{ color: colors.danger }}>
                    Sign in to remix recipes with AI.
                  </Text>
                  <Pressable
                    onPress={() => {
                      handleClose();
                      router.push('/auth?mode=signin&reason=sync');
                    }}
                    className="mt-3 self-start rounded-full px-4 py-2 active:opacity-80"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Text className="text-sm font-bold text-white">Sign in</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text className="text-sm" style={{ color: colors.danger }}>
                    {error}
                  </Text>
                  <Pressable onPress={() => setError(null)} className="mt-3 active:opacity-70">
                    <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                      Try another option
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {!loading && preview && (
            <View>
              <View
                className="mb-5 rounded-3xl border p-4"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <Text className="mb-1 text-xs font-medium" style={{ color: colors.textSecondary }}>
                  What changed
                </Text>
                <Text className="text-base leading-6" style={{ color: colors.text }}>
                  {preview.recipe.summary}
                </Text>
              </View>

              <Pressable
                className="mb-3 items-center rounded-full py-4 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
                onPress={handleApply}
              >
                <Text className="text-base font-bold text-white">
                  Use this version · {TOKEN_COST_REMIX} tokens
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setPreview(null)}
                className="items-center py-2 active:opacity-70"
              >
                <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                  Pick a different style
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
