/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        pinch: {
          orange: '#FF6B35',
          green: '#2D6A4F',
          cream: '#FFF8F0',
          dark: '#1A1A2E',
        },
      },
    },
  },
  plugins: [],
};
