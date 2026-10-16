import type { Platform, PlatformKind } from './Platform';
import { webPlatform } from './web';

/**
 * Capacitor implementation. P0.4 ships the shell only: every capability
 * falls back to the web version, which already works inside the WebView.
 * Each molecule is replaced in the phase that needs it, with its plugin
 * declared then (mobile foundation §6): saves/storage → Filesystem +
 * Preferences in P3; haptics, back button, status bar in P6; share for City
 * Moments in P9. Keeping the plugins out until then keeps the shells small
 * and the licence list short.
 */
export const nativePlatform = (kind: Exclude<PlatformKind, 'web'>): Platform => ({
  ...webPlatform,
  kind,
  // A phone or tablet build is always driven by touch.
  input: { coarsePointer: () => true },
});
