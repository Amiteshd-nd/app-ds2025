import type { Insets, Platform, SavePayload } from './Platform';

/** Prefix so a save slot can never collide with a settings key. */
const SLOT_PREFIX = 'bangalore-times:slot:';

/**
 * Browser implementation. Deliberately plain: localStorage behind the
 * async interface today, IndexedDB + lz-string when ADR-63's slot system
 * lands (T-011). Every storage call is guarded — private browsing or a full
 * quota must never take the game down with it.
 */
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort; the caller sees no error because there is nothing to do.
  }
};

const erase = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Already unreachable.
  }
};

const slotKeys = (): string[] => {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(SLOT_PREFIX));
  } catch {
    return [];
  }
};

/** `env(safe-area-inset-*)` resolved through a probe element, once. */
const readSafeArea = (): Insets => {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'top:env(safe-area-inset-top);right:env(safe-area-inset-right);' +
    'bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const insets = { top: px(s.top), right: px(s.right), bottom: px(s.bottom), left: px(s.left) };
  probe.remove();
  return insets;
};

export const webPlatform: Platform = {
  kind: 'web',

  storage: {
    get: async (key) => read(key),
    set: async (key, value) => write(key, value),
    remove: async (key) => erase(key),
  },

  saves: {
    read: async (slot) => {
      const raw = read(SLOT_PREFIX + slot);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as SavePayload;
      } catch {
        return null; // corrupt slot reads as empty rather than throwing
      }
    },
    write: async (slot, payload) => write(SLOT_PREFIX + slot, JSON.stringify(payload)),
    remove: async (slot) => erase(SLOT_PREFIX + slot),
    export: async () => {
      const all: Record<string, SavePayload> = {};
      for (const key of slotKeys()) {
        const raw = read(key);
        if (raw) all[key.slice(SLOT_PREFIX.length)] = JSON.parse(raw) as SavePayload;
      }
      return new Blob([JSON.stringify(all)], { type: 'application/json' });
    },
    import: async (file) => {
      const all = JSON.parse(await file.text()) as Record<string, SavePayload>;
      for (const [slot, payload] of Object.entries(all)) write(SLOT_PREFIX + slot, JSON.stringify(payload));
    },
  },

  lifecycle: {
    // A hidden tab is the browser's "backgrounded".
    onPause: (cb) => {
      const handler = () => { if (document.hidden) cb(); };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    onResume: (cb) => {
      const handler = () => { if (!document.hidden) cb(); };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    onBackButton: () => () => {}, // no hardware back on the web
  },

  haptics: {
    tap: () => navigator.vibrate?.(10),
    impact: (level) => navigator.vibrate?.(level === 'heavy' ? 40 : level === 'medium' ? 25 : 12),
  },

  display: {
    safeArea: readSafeArea,
    lockLandscape: async () => {
      // Orientation lock is only honoured in fullscreen on most browsers, and
      // not at all on iOS Safari; the manifest's `orientation: landscape`
      // covers the installed PWA. Best-effort, never an error.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      try {
        await orientation.lock?.('landscape');
      } catch {
        // Not permitted here; the "rotate your phone" panel handles it.
      }
    },
    hideStatusBar: () => {},
  },

  network: {
    isOnline: () => navigator.onLine,
    onChange: (cb) => {
      const on = () => cb(true);
      const off = () => cb(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => {
        window.removeEventListener('online', on);
        window.removeEventListener('offline', off);
      };
    },
  },

  share: {
    image: async (dataUrl, text) => {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'namma-moment.png', { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
      // No share sheet: hand the image over as a download instead.
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = file.name;
      a.click();
    },
  },

  audio: {
    // Phaser's sound manager resumes its WebAudio context on the first input
    // it sees; calling this from the Title "tap to start" makes that explicit.
    unlock: async () => {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') await ctx.resume();
      await ctx.close();
    },
  },
};
