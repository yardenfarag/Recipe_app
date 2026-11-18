/**
 * Parse model output into JSON. Shared by OpenRouter and tests.
 * No Deno APIs — vitest can import this file.
 */

export function parseLlmJsonText(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }

  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  return text;
}
