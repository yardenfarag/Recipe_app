const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// web/ is the separate Next.js app (ADR 026) with its own node_modules. Keep Metro from crawling it.
const webDir = path.join(__dirname, 'web').replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  new RegExp(`^${webDir}[\\\\/].*`),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
