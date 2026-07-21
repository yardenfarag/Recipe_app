// Single source of truth for Pinch brand hex values. Plain CommonJS so
// `tailwind.config.js` can require() it at build time. App code imports the
// same file — keep hex codes here only.
//
// Visual language: Mist Drift — soft lilac-slate + cool mist blue.
// No orange / green accents.
module.exports = {
  // Soft lilac-slate — primary actions, tabs, accents
  pinchPrimary: '#7B6B9A',
  pinchPrimarySoft: '#E8E2F0',
  // Cool mist blue — secondary accent
  pinchRose: '#6B849E',
  pinchRoseSoft: '#E0E8F0',
  // Surfaces — soft lilac mist (light)
  pinchBg: '#F4F1F8',
  pinchSurface: '#FFFFFF',
  pinchDark: '#2A2634',
  pinchMuted: '#6E6878',
  // Dark mode counterparts
  pinchBgDark: '#12101A',
  pinchSurfaceDark: '#1E1A28',
  pinchPrimaryDark: '#B8A8D4',
  pinchPrimarySoftDark: '#2E2838',
  pinchRoseDark: '#9BB4D0',
  pinchRoseSoftDark: '#243040',
  pinchTextDark: '#F2F0F6',
  pinchMutedDark: '#A49AB0',
  // Borders
  pinchBorder: '#E2DCE8',
  pinchBorderDark: '#3A3448',
  // Atmosphere (orbs / gradients)
  pinchMistOrbA: '#DDD4EC',
  pinchMistOrbB: '#D2DEEA',
  pinchMistOrbC: '#E8E0F0',
  pinchMistOrbADark: '#352848',
  pinchMistOrbBDark: '#243848',
  pinchMistOrbCDark: '#2C2438',
  // Legacy aliases → primary so stray imports stay on-brand
  pinchOrange: '#7B6B9A',
  pinchGreen: '#7B6B9A',
  pinchCream: '#F4F1F8',
};
