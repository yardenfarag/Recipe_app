// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// shared/ is imported by the mobile app and by the Next.js app (web/), so nothing in it may depend on one platform.
// It may import its own files, and only the packages both apps install (shared/packages.json).
const sharedPackages = require("./shared/packages.json");
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sharedImportRule = (extraPackages = []) => [
  "error",
  {
    patterns: [
      {
        regex: `^(?!\\.{1,2}/|(?:${[...sharedPackages.map(escapeRegex), ...extraPackages].join("|")})$)`,
        message:
          "shared/ may import only its own files (relative paths) and the packages in shared/packages.json. No react-native, expo, next or '@/…'. See shared/README.md.",
      },
      {
        regex: "^(\\.\\./)+(src|web)/",
        message: "shared/ must not import from the mobile app (src/) or the web app (web/). See shared/README.md.",
      },
    ],
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    // web/ is the Next.js app; it has its own ESLint config (web/eslint.config.mjs).
    ignores: ["dist/*", "web/**"],
  },
  {
    // Taps are logged for the admin Activity page through our Pressable.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/Pressable.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Pressable", "TouchableOpacity", "TouchableHighlight"],
              message: "Use Pressable from '@/components/ui/Pressable' (with a trackId) so taps are logged.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["shared/**/*.{ts,tsx,js}"],
    rules: {
      "no-restricted-imports": sharedImportRule(),
      "no-restricted-globals": [
        "error",
        { name: "__DEV__", message: "__DEV__ exists only in the mobile app. Take the value as a parameter." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "shared/ cannot read env vars: the mobile app's are EXPO_PUBLIC_*, the web app's NEXT_PUBLIC_*. Take the value as a parameter.",
        },
      ],
    },
  },
  {
    // Tests run in Node under Vitest.
    files: ["shared/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": sharedImportRule(["vitest", "node:.+"]),
    },
  },
]);
