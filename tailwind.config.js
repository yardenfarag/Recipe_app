const { pinchOrange, pinchGreen, pinchCream, pinchDark } = require('./src/constants/brandColors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        pinch: {
          orange: pinchOrange,
          green: pinchGreen,
          cream: pinchCream,
          dark: pinchDark,
        },
      },
    },
  },
  plugins: [],
};
