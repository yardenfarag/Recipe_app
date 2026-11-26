// The words of the household pushes (ADR 034) in the five app languages. Placeholders: {name} is a member's name
// in the household, {count} a number of list items, {household} the household's name.
//
// A member's name can belong to anyone, so the lines avoid verbs that agree with the person's gender (Hebrew,
// Arabic, Russian): "Dana is on the way to the shop", not "Dana went". Hebrew speaks to the reader in the plural
// like the rest of Pinch's copy; Arabic uses the same register as the nudges. Keep pushes short: iOS shows about two
// lines of the body.
import type { EmailLocale } from '../email/copy.ts';

/** CLDR plural forms (Intl.PluralRules); `other` is the fallback for any form a language leaves out. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface HouseholdCopy {
  /** Push title when the household has no name. */
  fallbackTitle: string;
  /** Stands in for a member who has no name. */
  someone: string;
  /** {name} added {count} items to the shared list. */
  listAdded: PluralForms;
  memberJoined: string;
  memberLeft: string;
  /** To the others, when {name} was removed. */
  memberRemoved: string;
  /** To the person removed. */
  removedYou: string;
  goingShoppingTitle: string;
  goingShoppingBody: string;
}

const en: HouseholdCopy = {
  fallbackTitle: 'Pinch',
  someone: 'Someone',
  listAdded: {
    one: '{name} added an item to the list.',
    other: '{name} added {count} items to the list.',
  },
  memberJoined: '{name} joined. The list and pantry are shared with them now.',
  memberLeft: '{name} left the household.',
  memberRemoved: '{name} is no longer in the household.',
  removedYou: "You're no longer in {household}. You kept a copy of the list and pantry.",
  goingShoppingTitle: '{name} is going shopping',
  goingShoppingBody: 'Anything to add? Put it on the list now.',
};

const es: HouseholdCopy = {
  fallbackTitle: 'Pinch',
  someone: 'Alguien',
  listAdded: {
    one: '{name} añadió un artículo a la lista.',
    other: '{name} añadió {count} artículos a la lista.',
  },
  memberJoined: '{name} se unió. Ahora la lista y la despensa son compartidas.',
  memberLeft: '{name} salió del hogar.',
  memberRemoved: '{name} ya no está en el hogar.',
  removedYou: 'Ya no estás en {household}. Te quedas con una copia de la lista y la despensa.',
  goingShoppingTitle: '{name} va a hacer la compra',
  goingShoppingBody: '¿Falta algo? Añádelo a la lista ahora.',
};

const he: HouseholdCopy = {
  fallbackTitle: 'Pinch',
  someone: 'מישהו מהבית',
  listAdded: {
    one: 'פריט חדש ברשימה, נוסף על ידי {name}.',
    two: '{count} פריטים חדשים ברשימה, נוספו על ידי {name}.',
    other: '{count} פריטים חדשים ברשימה, נוספו על ידי {name}.',
  },
  memberJoined: 'הצטרפות חדשה: {name}. מעכשיו הרשימה והמזווה משותפים.',
  memberLeft: '{name} כבר לא חלק מהבית. הרשימה והמזווה נשארים אצלכם.',
  memberRemoved: '{name} כבר לא חלק מהבית.',
  removedYou: 'אתם כבר לא חלק מ״{household}״. עותק של הרשימה והמזווה נשאר אצלכם.',
  goingShoppingTitle: '{name} בדרך לסופר',
  goingShoppingBody: 'צריכים משהו? הוסיפו לרשימה עכשיו.',
};

const ru: HouseholdCopy = {
  fallbackTitle: 'Pinch',
  someone: 'Кто-то',
  listAdded: {
    one: '{name}: {count} новая позиция в списке покупок.',
    few: '{name}: {count} новые позиции в списке покупок.',
    many: '{name}: {count} новых позиций в списке покупок.',
    other: '{name}: {count} новых позиций в списке покупок.',
  },
  memberJoined: '{name} теперь с вами: список покупок и запасы общие.',
  memberLeft: 'Список покупок и запасы больше не общие с {name}.',
  memberRemoved: 'Список покупок и запасы больше не общие с {name}.',
  removedYou: 'Вы больше не в «{household}». Копия списка и запасов осталась у вас.',
  goingShoppingTitle: '{name} идёт за покупками',
  goingShoppingBody: 'Нужно что-то ещё? Добавьте в список сейчас.',
};

const ar: HouseholdCopy = {
  fallbackTitle: 'Pinch',
  someone: 'أحد أفراد البيت',
  listAdded: {
    zero: '{count} عنصر جديد في القائمة من {name}.',
    one: 'عنصر جديد في القائمة من {name}.',
    two: 'عنصران جديدان في القائمة من {name}.',
    few: '{count} عناصر جديدة في القائمة من {name}.',
    many: '{count} عنصرًا جديدًا في القائمة من {name}.',
    other: '{count} عنصر جديد في القائمة من {name}.',
  },
  memberJoined: 'انضمام جديد: {name}. القائمة والمؤونة مشتركة الآن.',
  memberLeft: 'لم تعد القائمة والمؤونة مشتركة مع {name}.',
  memberRemoved: 'لم تعد القائمة والمؤونة مشتركة مع {name}.',
  removedYou: 'لم تعد ضمن «{household}». بقيت معك نسخة من القائمة والمؤونة.',
  goingShoppingTitle: '{name} في الطريق إلى السوق',
  goingShoppingBody: 'تحتاج شيئًا؟ أضفه إلى القائمة الآن.',
};

export const HOUSEHOLD_COPY: Readonly<Record<EmailLocale, HouseholdCopy>> = { en, es, he, ru, ar };

/** The form of `forms` for `count` in `locale`. */
export function plural(locale: EmailLocale, forms: PluralForms, count: number): string {
  const rule = new Intl.PluralRules(locale).select(count);
  return forms[rule] ?? forms.other;
}
