// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
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
]);
