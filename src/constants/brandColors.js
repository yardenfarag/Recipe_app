// Single source of truth for Pinch brand hex values. Plain CommonJS so
// `tailwind.config.js` can require() it at build time. App code imports the
// same file — keep hex codes here only.
module.exports = {
  // Soft berry rose — primary actions, tabs, accents
  pinchPrimary: '#C45B7A',
  pinchPrimarySoft: '#F5DCE4',
  // Soft sky — secondary accent (cute, never green/orange)
  pinchRose: '#6B8FAF',
  pinchRoseSoft: '#E4EEF5',
  // Surfaces — warm blush mist (not cream/terracotta)
  pinchBg: '#F8F4F6',
  pinchSurface: '#FFFFFF',
  pinchDark: '#2A2428',
  pinchMuted: '#6E646A',
  // Dark mode counterparts
  pinchBgDark: '#161214',
  pinchSurfaceDark: '#221C20',
  pinchPrimaryDark: '#E8A0B5',
  pinchPrimarySoftDark: '#3A2830',
  pinchRoseDark: '#9BB8D0',
  pinchRoseSoftDark: '#243040',
  pinchTextDark: '#F5F0F2',
  pinchMutedDark: '#A89AA0',
  // Borders
  pinchBorder: '#E8DDE2',
  pinchBorderDark: '#3A3034',
  // Legacy aliases → new primary so stray imports stay on-brand
  pinchOrange: '#C45B7A',
  pinchGreen: '#C45B7A',
  pinchCream: '#F8F4F6',
};
