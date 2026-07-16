// Single source of truth for Pinch's brand hex values. Plain CommonJS (not
// .ts) so `tailwind.config.js` can `require()` it directly at build time;
// app code imports the same file (Metro/TS both support plain JS modules —
// see `allowJs` in tsconfig). Keep these as the only place these hex codes
// are written — everything else should reference this or the `pinch-*`
// Tailwind classes it feeds.
module.exports = {
  pinchOrange: '#FF6B35',
  pinchGreen: '#2D6A4F',
  pinchCream: '#FFF8F0',
  pinchDark: '#1A1A2E',
};
