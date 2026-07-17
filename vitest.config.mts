import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@/assets': path.resolve(root, 'assets'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
});
