import type { CapacitorConfig } from '@capacitor/cli';

/**
 * One codebase, three platforms (ADR-64): the Android and iOS shells wrap the
 * same `dist/` the PWA ships. `pnpm cap:sync` builds the web app and copies
 * it into both native projects.
 *
 * appId is a placeholder until the title decision (ADR-68); it becomes
 * permanent the moment a store listing is created (M1), not before.
 */
const config: CapacitorConfig = {
  appId: 'com.nammaquest.app',
  appName: 'Namma Quest',
  webDir: 'dist',
  // Phaser + pixel art want the WebView to render at device pixels, not zoomed.
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
  plugins: {
    SplashScreen: { launchAutoHide: true, backgroundColor: '#0e0f13' },
  },
};

export default config;
