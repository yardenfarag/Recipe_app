const {
  pinchPrimary,
  pinchPrimarySoft,
  pinchRose,
  pinchRoseSoft,
  pinchBg,
  pinchSurface,
  pinchDark,
  pinchMuted,
  pinchBorder,
  pinchBorderDark,
  pinchBgDark,
  pinchSurfaceDark,
  pinchPrimaryDark,
  pinchPrimarySoftDark,
  pinchRoseDark,
  pinchRoseSoftDark,
  pinchTextDark,
  pinchMutedDark,
} = require('./src/constants/brandColors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pinch: {
          primary: pinchPrimary,
          'primary-soft': pinchPrimarySoft,
          rose: pinchRose,
          'rose-soft': pinchRoseSoft,
          bg: pinchBg,
          surface: pinchSurface,
          dark: pinchDark,
          muted: pinchMuted,
          border: pinchBorder,
          // Dark-mode named tokens (also use dark: variants on light tokens)
          'bg-dark': pinchBgDark,
          'surface-dark': pinchSurfaceDark,
          'primary-dark': pinchPrimaryDark,
          'primary-soft-dark': pinchPrimarySoftDark,
          'rose-dark': pinchRoseDark,
          'rose-soft-dark': pinchRoseSoftDark,
          'text-dark': pinchTextDark,
          'muted-dark': pinchMutedDark,
          'border-dark': pinchBorderDark,
          // Legacy aliases → map to new primary so old class names don't break
          orange: pinchPrimary,
          green: pinchPrimary,
          cream: pinchBg,
        },
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
