import { describe, expect, it } from 'vitest';

import { classifyLlmRecipe, recipeRepairIsUpgrade } from './recipeCompleteness';

const titleOnly = {
  found_recipe: true,
  title: 'Soup',
  ingredients: [],
  instructions: [],
};

const ingredientsOnly = {
  found_recipe: true,
  title: 'Soup',
  ingredients: [{ name: 'salt' }],
  instructions: [],
};

const full = {
  found_recipe: true,
  title: 'Soup',
  ingredients: [{ name: 'salt' }],
  instructions: [{ step: 1, text: 'Boil' }],
};

describe('classifyLlmRecipe', () => {
  it('marks title + ingredients without steps as partial', () => {
    expect(classifyLlmRecipe(ingredientsOnly).status).toBe('partial');
    expect(classifyLlmRecipe(ingredientsOnly).missingFields).toContain('instructions');
  });

  it('marks title + both lists as full', () => {
    expect(classifyLlmRecipe(full).status).toBe('full');
  });

  it('fails when nothing cookable was found', () => {
    expect(classifyLlmRecipe(titleOnly).status).toBe('failed');
  });
});

describe('recipeRepairIsUpgrade', () => {
  it('charges when a partial becomes full', () => {
    expect(recipeRepairIsUpgrade(ingredientsOnly, full)).toBe(true);
  });

  it('charges when missing steps are filled', () => {
    expect(recipeRepairIsUpgrade(ingredientsOnly, full)).toBe(true);
  });

  it('does not charge when nothing cookable improved', () => {
    expect(recipeRepairIsUpgrade(ingredientsOnly, ingredientsOnly)).toBe(false);
    expect(recipeRepairIsUpgrade(ingredientsOnly, titleOnly)).toBe(false);
  });
});
