export interface TranslationSourceIngredient {
  quantity: number;
}

export interface TranslationSourceInstruction {
  step: number;
}

export interface TranslationOutputIngredient {
  source_index?: number;
  quantity?: number;
}

export interface TranslationOutputInstruction {
  source_index?: number;
  step?: number;
}

export function assertTranslationIdentity(
  sourceIngredients: TranslationSourceIngredient[],
  sourceInstructions: TranslationSourceInstruction[],
  translatedIngredients: TranslationOutputIngredient[],
  translatedInstructions: TranslationOutputInstruction[],
): void {
  if (
    translatedIngredients.length !== sourceIngredients.length ||
    translatedInstructions.length !== sourceInstructions.length
  ) {
    throw new Error('Translation response did not preserve the complete recipe');
  }

  sourceIngredients.forEach((source, index) => {
    const translated = translatedIngredients[index];
    if (
      translated?.source_index !== index ||
      translated.quantity !== source.quantity
    ) {
      throw new Error(`Translation response changed ingredient identity at index ${index}`);
    }
  });

  sourceInstructions.forEach((source, index) => {
    const translated = translatedInstructions[index];
    if (
      translated?.source_index !== index ||
      translated.step !== source.step
    ) {
      throw new Error(`Translation response changed instruction identity at index ${index}`);
    }
  });
}
