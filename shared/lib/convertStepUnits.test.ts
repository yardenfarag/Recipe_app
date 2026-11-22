import { describe, expect, it } from 'vitest';

import { celsiusToFahrenheit, convertStepUnits, fahrenheitToCelsius } from './convertStepUnits';

describe('oven rounding', () => {
  it('rounds Celsius oven heat to the nearest 10', () => {
    expect(fahrenheitToCelsius(350)).toBe(180);
    expect(fahrenheitToCelsius(375)).toBe(190);
    expect(fahrenheitToCelsius(400)).toBe(200);
    expect(fahrenheitToCelsius(425)).toBe(220);
    expect(fahrenheitToCelsius(325)).toBe(160);
    expect(fahrenheitToCelsius(450)).toBe(230);
  });

  it('keeps low heat to the degree', () => {
    expect(fahrenheitToCelsius(165)).toBe(74);
    expect(fahrenheitToCelsius(212)).toBe(100);
    expect(fahrenheitToCelsius(240)).toBe(116);
  });

  it('rounds Fahrenheit oven heat to the nearest 25', () => {
    expect(celsiusToFahrenheit(180)).toBe(350);
    expect(celsiusToFahrenheit(175)).toBe(350);
    expect(celsiusToFahrenheit(190)).toBe(375);
    expect(celsiusToFahrenheit(200)).toBe(400);
    expect(celsiusToFahrenheit(220)).toBe(425);
    expect(celsiusToFahrenheit(160)).toBe(325);
    expect(celsiusToFahrenheit(74)).toBe(165);
  });
});

describe('convertStepUnits: temperatures for a Metric reader', () => {
  const metric = (text: string, language: Parameters<typeof convertStepUnits>[2] = 'en') =>
    convertStepUnits(text, 'metric', language);

  it('converts the common English spellings', () => {
    expect(metric('Preheat the oven to 350°F.')).toBe('Preheat the oven to 180°C.');
    expect(metric('Preheat the oven to 350 °F.')).toBe('Preheat the oven to 180°C.');
    expect(metric('Preheat the oven to 350ºF.')).toBe('Preheat the oven to 180°C.');
    expect(metric('Bake at 350F for 20 minutes.')).toBe('Bake at 180°C for 20 minutes.');
    expect(metric('Bake at 350 F for 20 minutes.')).toBe('Bake at 180°C for 20 minutes.');
    expect(metric('Heat to 350 degrees F.')).toBe('Heat to 180°C.');
    expect(metric('Heat to 350 degrees Fahrenheit.')).toBe('Heat to 180°C.');
    expect(metric('Heat to 400 Fahrenheit.')).toBe('Heat to 200°C.');
  });

  it('converts ranges', () => {
    expect(metric('Bake at 350–375°F.')).toBe('Bake at 180–190°C.');
    expect(metric('Bake at 350-375 F.')).toBe('Bake at 180–190°C.');
    expect(metric('Bake at 350 to 375 degrees F.')).toBe('Bake at 180–190°C.');
  });

  it('keeps one side of a written pair', () => {
    expect(metric('Preheat to 350°F (180°C).')).toBe('Preheat to 180°C.');
    expect(metric('Preheat to 350°F (175°C).')).toBe('Preheat to 175°C.');
    expect(metric('Preheat to 180°C / 350°F and line a tin.')).toBe('Preheat to 180°C and line a tin.');
  });

  it('leaves Celsius and unrelated numbers alone', () => {
    expect(metric('Bake at 180°C for 25 minutes.')).toBe('Bake at 180°C for 25 minutes.');
    expect(metric('Add 2 C flour and 1 F egg.')).toBe('Add 2 C flour and 1 F egg.');
    expect(metric('Cook for 350 seconds.')).toBe('Cook for 350 seconds.');
  });

  it('reads bare degrees in English as Fahrenheit only from 260 up', () => {
    expect(metric('Bake at 350 degrees for an hour.')).toBe('Bake at 180°C for an hour.');
    expect(metric('Bake at 350° for an hour.')).toBe('Bake at 180°C for an hour.');
    expect(metric('Roast at 200 degrees.')).toBe('Roast at 200 degrees.');
  });

  it('converts internal temperatures to the degree', () => {
    expect(metric('Cook until it reaches 165°F inside.')).toBe('Cook until it reaches 74°C inside.');
  });

  it('handles Hebrew, Arabic, Russian and Spanish spellings', () => {
    expect(metric('אופים ב-350 מעלות פרנהייט כ-20 דקות.', 'he')).toBe('אופים ב-180°C כ-20 דקות.');
    expect(metric('מחממים תנור ל-350°F.', 'he')).toBe('מחממים תנור ל-180°C.');
    expect(metric('سخّن الفرن إلى 350 درجة فهرنهايت.', 'ar')).toBe('سخّن الفرن إلى 180°C.');
    expect(metric('سخّن الفرن إلى ٣٥٠ درجة فهرنهايت.', 'ar')).toBe('سخّن الفرن إلى ١٨٠°C.');
    expect(metric('Разогрейте духовку до 425°F.', 'ru')).toBe('Разогрейте духовку до 220°C.');
    expect(metric('Разогрейте духовку до 350 градусов по Фаренгейту.', 'ru')).toBe('Разогрейте духовку до 180°C.');
    expect(metric('Precalienta el horno a 400 °F.', 'es')).toBe('Precalienta el horno a 200°C.');
    expect(metric('Hornea a 350 grados Fahrenheit.', 'es')).toBe('Hornea a 180°C.');
  });

  it('copes with right-to-left marks between the number and the unit', () => {
    expect(metric('אופים ב-‏350‏°F', 'he')).toBe('אופים ב-‏180°C');
  });
});

describe('convertStepUnits: temperatures for a US reader', () => {
  const us = (text: string, language: Parameters<typeof convertStepUnits>[2] = 'en') =>
    convertStepUnits(text, 'us', language);

  it('converts Celsius in every spelling', () => {
    expect(us('Bake at 180°C.')).toBe('Bake at 350°F.');
    expect(us('Bake at 180 °C.')).toBe('Bake at 350°F.');
    expect(us('Bake at 200C.')).toBe('Bake at 400°F.');
    expect(us('Bake at 180 degrees Celsius.')).toBe('Bake at 350°F.');
    expect(us('Разогрейте духовку до 180 °С.', 'ru')).toBe('Разогрейте духовку до 350°F.');
    expect(us('Разогрейте до 200 градусов по Цельсию.', 'ru')).toBe('Разогрейте до 400°F.');
    expect(us('سخّن الفرن إلى 180 درجة مئوية.', 'ar')).toBe('سخّن الفرن إلى 350°F.');
    expect(us('Hornea a 180 grados centígrados.', 'es')).toBe('Hornea a 350°F.');
    expect(us('אופים ב-180 מעלות צלזיוס.', 'he')).toBe('אופים ב-350°F.');
  });

  it('reads bare degrees in other languages as Celsius', () => {
    expect(us('מחממים תנור ל-180 מעלות.', 'he')).toBe('מחממים תנור ל-350°F.');
    expect(us('מחממים תנור ל־200 מעלות טורבו.', 'he')).toBe('מחממים תנור ל־400°F טורבו.');
    expect(us('Hornea a 170 grados durante 15 minutos.', 'es')).toBe('Hornea a 325°F durante 15 minutos.');
    expect(us('Выпекайте при 180 градусах 30 минут.', 'ru')).toBe('Выпекайте при 350°F 30 минут.');
    expect(us('Выпекайте при 180 градусов 30 минут.', 'ru')).toBe('Выпекайте при 350°F 30 минут.');
  });

  it('uses the script when no language is given', () => {
    expect(convertStepUnits('אופים ב-180 מעלות', 'us')).toBe('אופים ב-350°F');
    expect(convertStepUnits('Roast at 180 degrees', 'us')).toBe('Roast at 180 degrees');
  });

  it('keeps one side of a written pair', () => {
    expect(us('Preheat to 180°C (350°F).')).toBe('Preheat to 350°F.');
    expect(us('Preheat to 350°F (180°C).')).toBe('Preheat to 350°F.');
  });

  it('converts ranges', () => {
    expect(us('Fry at 170–175°C.')).toBe('Fry at 325–350°F.');
    expect(us('מטגנים בשמן שחומם ל-170–175 מעלות.', 'he')).toBe('מטגנים בשמן שחומם ל-325-350°F.');
    // Right to left, the range keeps its order with a plain hyphen.
    expect(convertStepUnits('אופים ב-325–350°F.', 'metric', 'he')).toBe('אופים ב-160-180°C.');
  });
});

describe('convertStepUnits: lengths', () => {
  it('turns inches into centimeters for a Metric reader', () => {
    expect(convertStepUnits('Grease a 9-inch pan.', 'metric', 'en')).toBe('Grease a 23 cm pan.');
    expect(convertStepUnits('Use a 9x13-inch dish.', 'metric', 'en')).toBe('Use a 23 × 33 cm dish.');
    expect(convertStepUnits('Use a 9 x 13 inch dish.', 'metric', 'en')).toBe('Use a 23 × 33 cm dish.');
    expect(convertStepUnits('Roll out to 1/2 inch thick.', 'metric', 'en')).toBe('Roll out to 1.5 cm thick.');
    expect(convertStepUnits('Use a 9" pie dish.', 'metric', 'en')).toBe('Use a 23 cm pie dish.');
    expect(convertStepUnits("שמנו תבנית בגודל 9x5 אינץ'.", 'metric', 'he')).toBe('שמנו תבנית בגודל 23 × 13 ס״מ.');
    expect(convertStepUnits('Возьмите форму 9 дюймов.', 'metric', 'ru')).toBe('Возьмите форму 23 см.');
    expect(convertStepUnits('Usa un molde de 8 pulgadas.', 'metric', 'es')).toBe('Usa un molde de 20 cm.');
  });

  it('keeps the metric side of a written pair', () => {
    expect(convertStepUnits('Line a 20 × 10 cm / 8 × 4-inch loaf pan.', 'metric', 'en')).toBe('Line a 20 × 10 cm loaf pan.');
  });

  it('turns centimeters into inches for a US reader', () => {
    expect(convertStepUnits('Use a 23 cm tin.', 'us', 'en')).toBe('Use a 9 in tin.');
    expect(convertStepUnits('רפדו תבנית בגודל 20 על 10 ס"מ.', 'us', 'he')).toBe('רפדו תבנית בגודל 8 × 4 אינץ׳.');
    expect(convertStepUnits('Roll to 1 cm thick.', 'us', 'en')).toBe('Roll to ½ in thick.');
  });

  it('leaves words that only look like units alone', () => {
    expect(convertStepUnits('Mix in 2 eggs.', 'metric', 'en')).toBe('Mix in 2 eggs.');
    expect(convertStepUnits('Cut in 4 pieces.', 'us', 'en')).toBe('Cut in 4 pieces.');
  });
});

describe('convertStepUnits: no change', () => {
  it('returns empty text as is', () => {
    expect(convertStepUnits('', 'metric')).toBe('');
  });

  it('is stable when run twice', () => {
    const once = convertStepUnits('Preheat to 350°F and use a 9-inch pan.', 'metric', 'en');
    expect(convertStepUnits(once, 'metric', 'en')).toBe(once);
  });
});
