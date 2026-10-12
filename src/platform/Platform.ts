/**
 * The platform seam (mobile_platform_foundation_v1 §4, ADR-64).
 *
 * Game code never calls `navigator.*`, `localStorage`, `indexedDB` or
 * `Capacitor.*` directly — it imports `platform` from `src/platform` and
 * calls one of these. `scripts/validate-platform.mjs` fails the build when a
 * file outside this folder reaches for a device API, so the rule is enforced
 * rather than remembered.
 *
 * In the atomic SYSTEMS tree `Platform` is an organism; each capability
 * below is a molecule. Each implementation is small and boring; where a
 * feature has no native equivalent, `native.ts` falls back to `web.ts`.
 */

export type PlatformKind = 'web' | 'android' | 'ios';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What a save slot holds on disk. Shape owned by SaveManager; opaque here. */
export type SavePayload = Record<string, unknown>;

export interface Platform {
  readonly kind: PlatformKind;

  /** Small key/value pairs: settings, the last-used slot. */
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };

  /**
   * Save slots. Native builds put these on the filesystem, never in WebView
   * storage the OS may evict (rule 12). Same payload and export/import format
   * everywhere, so a save exported on web imports on a phone.
   */
  saves: {
    read(slot: string): Promise<SavePayload | null>;
    write(slot: string, payload: SavePayload): Promise<void>;
    remove(slot: string): Promise<void>;
    export(): Promise<Blob>;
    import(file: Blob): Promise<void>;
  };

  /** App backgrounded → autosave + pause + mute. Android back = pause menu, never a silent quit. */
  lifecycle: {
    onPause(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
    onBackButton(cb: () => void): () => void;
  };

  /** Respects the Settings toggle; iOS ignores gracefully. */
  haptics: {
    tap(): void;
    impact(level: 'light' | 'medium' | 'heavy'): void;
  };

  display: {
    /** Notch / Dynamic Island / gesture bar, in CSS px. */
    safeArea(): Insets;
    lockLandscape(): Promise<void>;
    hideStatusBar(): void;
    /** The OS "reduce motion" setting (CLAUDE.md rule 12): collapse motion, never hide. */
    prefersReducedMotion(): boolean;
  };

  /** City Pulse bundle fetches check this first; offline = base city. */
  network: {
    isOnline(): boolean;
    onChange(cb: (online: boolean) => void): () => void;
  };

  /** City Moments postcards → WhatsApp/Instagram via the OS share sheet. */
  share: {
    image(dataUrl: string, text: string): Promise<void>;
  };

  /** Nothing plays before the first user tap (iOS/Android autoplay rules). */
  audio: {
    unlock(): Promise<void>;
  };
}
