import { Capacitor } from '@capacitor/core';
import type { Platform } from './Platform';
import { nativePlatform } from './native';
import { webPlatform } from './web';

/**
 * The one platform object game code imports. Picked once at boot:
 * `Capacitor.isNativePlatform()` is true inside the Android/iOS shells and
 * false in any browser, including the installed PWA.
 */
const pick = (): Platform => {
  if (!Capacitor.isNativePlatform()) return webPlatform;
  const name = Capacitor.getPlatform();
  return nativePlatform(name === 'ios' ? 'ios' : 'android');
};

export const platform: Platform = pick();

export type { Platform, PlatformKind, Insets, SavePayload } from './Platform';
