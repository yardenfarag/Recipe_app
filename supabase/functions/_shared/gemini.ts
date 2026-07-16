// Gemini extraction via the generateContent REST endpoint.
// Uses structured output (responseSchema) so we get valid JSON without parsing prose.

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3-flash-preview';

const SYSTEM_PROMPT = `You are a master chef. Analyze the provided social media content (video, description, and top comments) and extract a precise recipe.

Rules:
- Treat the video, description, and comments as equally valid sources — do NOT default to the video/description over comments. Short-form videos (e.g. YouTube Shorts) frequently show ONLY the cooking process with the full written recipe posted separately as a comment, often the creator's own pinned or first comment.
- Comments marked "(from the video's creator)" are especially likely to contain the authoritative, complete recipe — prefer their measurements and steps over your own guesses if they conflict with the video.
- Include ingredients with measurements, and step-by-step instructions.
- Estimate total calories (per the stated servings), total time in minutes, a cost tier from 1-3 dollar signs, and an effort level.
- If the content genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

// A JSON-Schema subset supported by Gemini structured output.
const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    found_recipe: { type: 'boolean' },
    title: { type: 'string' },
    servings: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['step', 'text'],
      },
    },
    calories: { type: 'integer' },
    estimated_time_minutes: { type: 'integer' },
    cost_estimate: { type: 'string', enum: ['$', '$$', '$$$'] },
    effort_level: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
  },
  required: ['found_recipe', 'title', 'servings', 'ingredients', 'instructions'],
};

export interface GeminiRecipe {
  found_recipe: boolean;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
  calories?: number;
  estimated_time_minutes?: number;
  cost_estimate?: '$' | '$$' | '$$$';
  effort_level?: 'Easy' | 'Medium' | 'Hard';
}

export interface ExtractInput {
  youtubeUrl: string;
  description?: string;
  topComments: { text: string; isCreator: boolean }[];
}

export async function extractRecipeWithGemini(input: ExtractInput): Promise<GeminiRecipe> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const textContext = buildTextContext(input);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: input.youtubeUrl } },
          { text: textContext },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_SCHEMA,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new Error('Gemini returned no content');
  }

  return JSON.parse(jsonText) as GeminiRecipe;
}

function buildTextContext(input: ExtractInput): string {
  const parts: string[] = [];
  parts.push('Extract the recipe from this YouTube video.');

  if (input.description?.trim()) {
    parts.push(`\n--- VIDEO DESCRIPTION ---\n${input.description.trim()}`);
  }

  if (input.topComments.length > 0) {
    const comments = input.topComments
      .map((c, i) => `${i + 1}. ${c.isCreator ? '(from the video\'s creator) ' : ''}${c.text}`)
      .join('\n');
    parts.push(
      `\n--- TOP COMMENTS ---\nThe full recipe is often posted here rather than in the description, especially for Shorts.\n${comments}`,
    );
  }

  return parts.join('\n');
}
