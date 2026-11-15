import type { InAppMessage } from '@/lib/inAppMessages';

/**
 * Hard-coded messages for looking at each way of showing in dev. Shown by
 * opening the app with `?inAppSample=<key>` (see InAppMessageHost). They have
 * English, Hebrew and Arabic text, so switching the app language shows
 * right-to-left. Never sent anywhere.
 */

const IMAGE = 'https://picsum.photos/id/292/960/540';

const base = {
  tone: 'info',
  dismissible: true,
  required: false,
  frequency: { type: 'once' },
  priority: 0,
} as const;

export const SAMPLE_MESSAGES: Record<string, InAppMessage> = {
  alert: {
    ...base,
    id: 'sample-alert',
    presentation: 'alert',
    content: {
      en: { title: 'Meet the weekly planner', body: 'Plan your week from what is in your pantry.', primaryLabel: 'Take a look', secondaryLabel: 'Not now' },
      he: { title: 'מכירים את מתכנן השבוע', body: 'מתכננים את השבוע ממה שיש במזווה.', primaryLabel: 'בואו נראה', secondaryLabel: 'לא עכשיו' },
      ar: { title: 'تعرّف على مخطط الأسبوع', body: 'خطّط أسبوعك مما في مخزنك.', primaryLabel: 'ألقِ نظرة', secondaryLabel: 'ليس الآن' },
    },
    primaryAction: { type: 'route', href: '/hub' },
    secondaryAction: { type: 'dismiss' },
  },
  'alert-image': {
    ...base,
    id: 'sample-alert-image',
    presentation: 'alert',
    tone: 'success',
    imageUrl: IMAGE,
    content: {
      en: { title: 'Thanks for cooking with us', body: 'An alert with an image is shown as a card, because the system alert has no image.', primaryLabel: 'Great' },
      he: { title: 'תודה שמבשלים איתנו', body: 'התראה עם תמונה מוצגת ככרטיס, כי להתראת המערכת אין תמונה.', primaryLabel: 'מעולה' },
      ar: { title: 'شكرًا لأنك تطبخ معنا', body: 'يظهر التنبيه الذي يحتوي على صورة كبطاقة.', primaryLabel: 'رائع' },
    },
    primaryAction: { type: 'dismiss' },
  },
  sheet: {
    ...base,
    id: 'sample-sheet',
    presentation: 'sheet',
    tone: 'success',
    icon: 'sparkles',
    imageUrl: IMAGE,
    content: {
      en: { title: 'What is new', body: 'Snap a recipe from a video, then cook it step by step. Read what changed in this version.', primaryLabel: 'Got it', linkLabel: 'Release notes' },
      he: { title: 'מה חדש', body: 'מצלמים מתכון מסרטון ומבשלים אותו צעד אחר צעד. קראו מה השתנה בגרסה הזאת.', primaryLabel: 'הבנתי', linkLabel: 'מה חדש בגרסה' },
      ar: { title: 'ما الجديد', body: 'التقط وصفة من فيديو ثم اطبخها خطوة بخطوة.', primaryLabel: 'فهمت', linkLabel: 'ملاحظات الإصدار' },
    },
    primaryAction: { type: 'dismiss' },
    link: { url: 'https://example.com/release-notes' },
  },
  banner: {
    ...base,
    id: 'sample-banner',
    presentation: 'banner',
    tone: 'warning',
    content: {
      en: { title: 'A new version is out', body: 'Update for the latest fixes.', primaryLabel: 'Update' },
      he: { title: 'יצאה גרסה חדשה', body: 'עדכנו כדי לקבל את התיקונים האחרונים.', primaryLabel: 'עדכון' },
      ar: { title: 'صدر إصدار جديد', body: 'حدّث للحصول على آخر الإصلاحات.', primaryLabel: 'تحديث' },
    },
    primaryAction: { type: 'store' },
  },
  'banner-bottom': {
    ...base,
    id: 'sample-banner-bottom',
    presentation: 'banner',
    tone: 'info',
    bannerPosition: 'bottom',
    content: {
      en: { title: 'Tip', body: 'Long-press a recipe to add it to a collection.' },
      he: { title: 'טיפ', body: 'לחיצה ארוכה על מתכון מוסיפה אותו לאוסף.' },
      ar: { title: 'نصيحة', body: 'اضغط مطولًا على وصفة لإضافتها إلى مجموعة.' },
    },
  },
  fullscreen: {
    ...base,
    id: 'sample-fullscreen',
    presentation: 'fullscreen',
    tone: 'critical',
    content: {
      en: { title: 'Scheduled maintenance', body: 'Pinch will be unavailable tonight between 02:00 and 02:30.', primaryLabel: 'OK' },
      he: { title: 'תחזוקה מתוכננת', body: 'Pinch לא יהיה זמין הלילה בין 02:00 ל־02:30.', primaryLabel: 'אישור' },
      ar: { title: 'صيانة مجدولة', body: 'لن يكون Pinch متاحًا الليلة بين 02:00 و02:30.', primaryLabel: 'حسنًا' },
    },
    primaryAction: { type: 'dismiss' },
  },
  required: {
    ...base,
    id: 'sample-required',
    presentation: 'fullscreen',
    tone: 'critical',
    required: true,
    dismissible: false,
    content: {
      en: { title: 'Please update Pinch', body: 'This version is too old to keep working. Update to continue.' },
      he: { title: 'צריך לעדכן את Pinch', body: 'הגרסה הזאת ישנה מדי כדי להמשיך לעבוד. עדכנו כדי להמשיך.' },
      ar: { title: 'يرجى تحديث Pinch', body: 'هذا الإصدار قديم جدًا ولا يمكنه العمل. حدّث للمتابعة.' },
    },
  },
};
