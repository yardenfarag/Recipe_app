// The app is locked to portrait ("orientation": "portrait" in app.json). Android then treats a
// portrait screen as a required hardware feature, so Play hides the app from devices without one
// (Chromebooks, Android XR, some tablets) and blocks the release for review. Declaring the feature
// as optional keeps phones in portrait and lets those devices install it.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    const existing = features.find((feature) => feature.$['android:name'] === FEATURE);
    if (existing) {
      existing.$['android:required'] = 'false';
    } else {
      features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    }
    return config;
  });
};
