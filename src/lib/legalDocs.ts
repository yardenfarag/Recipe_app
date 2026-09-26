import { SUPPORT_EMAIL } from '@/lib/legal';

export const LEGAL_DOC_IDS = ['privacy', 'terms', 'delete-account', 'delete-data'] as const;

export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

export type LegalHref = `/legal/${LegalDocId}`;

type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; to: LegalHref | `mailto:${string}` };

type Block =
  | { kind: 'card' | 'p'; parts: Inline[] }
  | { kind: 'h2'; text: string }
  | { kind: 'ul' | 'ol'; items: Inline[][] };

export type LegalDoc = {
  id: LegalDocId;
  title: string;
  meta: string;
  blocks: Block[];
  related: { label: string; to: LegalHref }[];
};

const mail = `mailto:${SUPPORT_EMAIL}` as const;
const deleteMail = `mailto:${SUPPORT_EMAIL}?subject=Pinch%20account%20deletion` as const;
const dataMail = `mailto:${SUPPORT_EMAIL}?subject=Pinch%20data%20deletion` as const;

function text(value: string): Inline {
  return { kind: 'text', text: value };
}

function strong(value: string): Inline {
  return { kind: 'strong', text: value };
}

function link(label: string, to: Inline extends { kind: 'link' } ? never : LegalHref | `mailto:${string}`): Inline {
  return { kind: 'link', text: label, to };
}

const DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    meta: 'Last updated: July 22, 2026',
    blocks: [
      {
        kind: 'card',
        parts: [
          text(
            'Pinch (“we”, “us”) helps you extract structured recipes from social video URLs. This policy explains what we collect, how we use it, and your choices.',
          ),
        ],
      },
      { kind: 'h2', text: 'Data we collect' },
      {
        kind: 'ul',
        items: [
          [strong('Account:'), text(' email address when you sign up with email, Apple, or Google; optional profile photo.')],
          [strong('Recipes & library:'), text(' saved recipes, collections, shopping list items, favorites, and related metadata you create in the app.')],
          [strong('Usage & tokens:'), text(' token balance and a ledger of AI actions (extract, remix, etc.) used to operate free allowances.')],
          [strong('Guest device limits:'), text(' a local install identifier and guest extraction/save limits on your device before you create an account.')],
          [strong('Content you submit:'), text(' social video URLs you paste or share into Pinch so we can fetch public metadata and generate a recipe.')],
        ],
      },
      { kind: 'h2', text: 'How we use data' },
      {
        kind: 'ul',
        items: [
          [text('Provide recipe extraction, remix, translation, and substitutions.')],
          [text('Sync your library across devices when signed in.')],
          [text('Enforce free token allowances and prevent abuse.')],
          [text('Respond to support requests you send us.')],
          [text('Notify you about token packs if you opt in (no purchases in the current soft launch).')],
        ],
      },
      { kind: 'h2', text: 'Third parties' },
      {
        kind: 'ul',
        items: [
          [strong('Supabase'), text(' — authentication, database, and file storage.')],
          [strong('Google Gemini'), text(' — AI recipe generation from content we fetch.')],
          [strong('ScrapeCreators'), text(' — metadata for some Instagram/TikTok URLs.')],
          [strong('Apple / Google'), text(' — optional sign-in providers.')],
          [strong('YouTube Data API'), text(' — optional metadata for YouTube links.')],
        ],
      },
      {
        kind: 'p',
        parts: [
          text('We do not sell your personal information. Provider processing is limited to operating Pinch.'),
        ],
      },
      { kind: 'h2', text: 'Retention' },
      {
        kind: 'p',
        parts: [
          text(
            'We keep account and library data while your account exists. Aggregated or anonymized usage events may be retained after deletion for cost and abuse analysis. Guest data stays on your device until you clear app data or migrate to an account.',
          ),
        ],
      },
      { kind: 'h2', text: 'Your choices' },
      {
        kind: 'ul',
        items: [
          [text('Delete your account anytime in the app: '), strong('Settings → Delete account'), text('.')],
          [
            text('Or follow the instructions to '),
            link('delete your data', '/legal/delete-data'),
            text(' (keep the account) or '),
            link('delete your account', '/legal/delete-account'),
            text('.'),
          ],
          [text('Contact us at '), link(SUPPORT_EMAIL, mail), text('.')],
        ],
      },
      { kind: 'h2', text: 'Children' },
      {
        kind: 'p',
        parts: [text('Pinch is not directed at children under 13. Do not create an account if you are under 13.')],
      },
      { kind: 'h2', text: 'Changes' },
      {
        kind: 'p',
        parts: [
          text(
            'We may update this policy. The “Last updated” date above will change when we do. Continued use after updates means you accept the revised policy.',
          ),
        ],
      },
    ],
    related: [
      { label: 'Terms of Use', to: '/legal/terms' },
      { label: 'Delete data', to: '/legal/delete-data' },
      { label: 'Delete account', to: '/legal/delete-account' },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    meta: 'Last updated: July 22, 2026',
    blocks: [
      {
        kind: 'card',
        parts: [
          text(
            'These Terms govern your use of the Pinch mobile app. By using Pinch you agree to them. If you do not agree, do not use the app.',
          ),
        ],
      },
      { kind: 'h2', text: 'The service' },
      {
        kind: 'p',
        parts: [
          text(
            'Pinch extracts structured recipes from public social video URLs (for example YouTube, Instagram, and TikTok) using automated systems, then lets you save, scale, remix, and organize recipes. Results are estimates and may be incomplete or inaccurate — always use your own judgment when cooking.',
          ),
        ],
      },
      { kind: 'h2', text: 'Accounts' },
      {
        kind: 'p',
        parts: [
          text(
            'You may use limited guest features on a device. Creating an account lets you sync recipes and receive a free token allowance for AI actions. You are responsible for keeping your sign-in credentials secure.',
          ),
        ],
      },
      { kind: 'h2', text: 'Acceptable use' },
      {
        kind: 'ul',
        items: [
          [text('Only submit URLs you are allowed to access.')],
          [text('Do not abuse, reverse engineer, or overload the service.')],
          [text('Do not use Pinch for unlawful or harmful purposes.')],
          [text('Respect third-party platform terms when sharing content into Pinch.')],
        ],
      },
      { kind: 'h2', text: 'Tokens & purchases' },
      {
        kind: 'p',
        parts: [
          text(
            'Soft launch builds use free token allowances. Paid token packs are not yet available. Features labeled “coming soon” are not a commitment to ship on a specific date.',
          ),
        ],
      },
      { kind: 'h2', text: 'Intellectual property' },
      {
        kind: 'p',
        parts: [
          text(
            'Pinch’s branding, app design, and software are owned by us. Recipe text generated for you is provided for personal use. Original video content remains owned by its creators / platforms.',
          ),
        ],
      },
      { kind: 'h2', text: 'Disclaimers' },
      {
        kind: 'p',
        parts: [
          text(
            'Pinch is provided “as is” without warranties of any kind. We do not guarantee uninterrupted service, extraction quality, calorie accuracy, allergen safety, or fitness for a particular purpose. Cooking involves risk — verify ingredients and methods yourself.',
          ),
        ],
      },
      { kind: 'h2', text: 'Limitation of liability' },
      {
        kind: 'p',
        parts: [
          text(
            'To the fullest extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of Pinch, including food safety outcomes or loss of data.',
          ),
        ],
      },
      { kind: 'h2', text: 'Termination' },
      {
        kind: 'p',
        parts: [
          text('You may delete your account at any time (in-app Settings or '),
          link('these instructions', '/legal/delete-account'),
          text('). We may suspend access for abuse or Terms violations.'),
        ],
      },
      { kind: 'h2', text: 'Contact' },
      {
        kind: 'p',
        parts: [text('Questions: '), link(SUPPORT_EMAIL, mail)],
      },
    ],
    related: [
      { label: 'Privacy Policy', to: '/legal/privacy' },
      { label: 'Delete account', to: '/legal/delete-account' },
    ],
  },
  'delete-account': {
    id: 'delete-account',
    title: 'Delete your account',
    meta: 'How to remove your Pinch account and associated data',
    blocks: [
      {
        kind: 'card',
        parts: [text('You can permanently delete your Pinch account and personal data. This cannot be undone.')],
      },
      { kind: 'h2', text: 'In the app (recommended)' },
      {
        kind: 'ol',
        items: [
          [text('Open '), strong('Pinch'), text(' and sign in.')],
          [text('Go to '), strong('Settings'), text('.')],
          [text('Tap '), strong('Delete account'), text(' and confirm.')],
        ],
      },
      {
        kind: 'p',
        parts: [
          text(
            'If you signed in with Apple, the app may ask you to confirm with Apple so we can revoke Sign in with Apple access.',
          ),
        ],
      },
      { kind: 'h2', text: 'What we delete' },
      {
        kind: 'ul',
        items: [
          [text('Your auth account and profile')],
          [text('Saved recipes, collections, and shopping list items')],
          [text('Profile photo stored for your account')],
          [text('Token balance and personal token ledger entries')],
        ],
      },
      {
        kind: 'p',
        parts: [
          text(
            'Anonymized usage metrics (without your user id) may remain for operating the service. Shared recipe thumbnail files keyed by video id are not unique to your account and may remain.',
          ),
        ],
      },
      { kind: 'h2', text: 'Without the app installed' },
      {
        kind: 'p',
        parts: [
          text('Email '),
          link(SUPPORT_EMAIL, deleteMail),
          text(' from the address on your account with the subject '),
          strong('Pinch account deletion'),
          text(
            '. Include the email tied to your Pinch account. We will confirm and delete within a reasonable time (typically within 7 days).',
          ),
        ],
      },
      { kind: 'h2', text: 'Guest data on a device' },
      {
        kind: 'p',
        parts: [
          text(
            'Guest recipes and limits live on the device. Clear Pinch app storage or uninstall the app to remove local guest data.',
          ),
        ],
      },
    ],
    related: [
      { label: 'Delete data', to: '/legal/delete-data' },
      { label: 'Privacy Policy', to: '/legal/privacy' },
      { label: 'Terms of Use', to: '/legal/terms' },
    ],
  },
  'delete-data': {
    id: 'delete-data',
    title: 'Delete your data',
    meta: 'How to remove Pinch data without deleting your account',
    blocks: [
      {
        kind: 'card',
        parts: [
          text('You can delete some or all of the data stored with your '),
          strong('Pinch'),
          text(' account and keep the account itself. To close the account as well, use '),
          link('Delete your account', '/legal/delete-account'),
          text('.'),
        ],
      },
      { kind: 'h2', text: 'In the app (recommended)' },
      {
        kind: 'p',
        parts: [text('Open '), strong('Pinch'), text(' and sign in, then:')],
      },
      {
        kind: 'ol',
        items: [
          [strong('Recipes:'), text(' Library → tap the ⋯ menu on a recipe → '), strong('Delete'), text('.')],
          [strong('Collections:'), text(' Library → open a collection → '), strong('Delete collection'), text('. Recipes stay in your library unless you delete them separately.')],
          [strong('Shopping list:'), text(' List → remove items, '), strong('Clear checked'), text(', or '), strong('Clear list'), text('.')],
          [strong('Profile photo:'), text(' Settings → change your photo to replace the one on file.')],
        ],
      },
      { kind: 'p', parts: [text('These deletions take effect immediately and cannot be undone.')] },
      { kind: 'h2', text: 'Request deletion by email' },
      {
        kind: 'p',
        parts: [
          text('If you cannot use the app, email '),
          link(SUPPORT_EMAIL, dataMail),
          text(' from the address on your Pinch account with the subject '),
          strong('Pinch data deletion'),
          text('. Say which data to remove (for example recipes, shopping list, profile photo, or all of it) and that you want to '),
          strong('keep the account'),
          text('. We will confirm and complete the request typically within 7 days.'),
        ],
      },
      { kind: 'h2', text: 'What we delete' },
      {
        kind: 'ul',
        items: [
          [text('The recipes, collections, list items, or photo you asked to remove')],
          [text('Related metadata for those items (tags, favorites, token ledger lines tied to a deleted recipe, where applicable)')],
        ],
      },
      { kind: 'h2', text: 'What we keep' },
      {
        kind: 'ul',
        items: [
          [text('Your Pinch account, email, and sign-in providers, unless you also delete the account')],
          [text('Any recipes, lists, collections, and photo you did not ask to delete')],
          [text('Token / credit balance, unless you ask us to reset it')],
          [text('Anonymized usage metrics (without your user id) may remain for operating the service')],
          [text('Shared recipe thumbnail files keyed by video id are not unique to your account and may remain')],
        ],
      },
      { kind: 'h2', text: 'Guest data on a device' },
      {
        kind: 'p',
        parts: [
          text(
            'Guest recipes and limits live on the device. Clear Pinch app storage or uninstall the app to remove local guest data.',
          ),
        ],
      },
    ],
    related: [
      { label: 'Delete account', to: '/legal/delete-account' },
      { label: 'Privacy Policy', to: '/legal/privacy' },
    ],
  },
};

export function isLegalDocId(value: string): value is LegalDocId {
  return (LEGAL_DOC_IDS as readonly string[]).includes(value);
}

export function legalDoc(id: string): LegalDoc | null {
  return isLegalDocId(id) ? DOCS[id] : null;
}

export function legalHref(id: LegalDocId): LegalHref {
  return `/legal/${id}`;
}
