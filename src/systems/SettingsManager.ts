import { create } from 'zustand';
import defaults from '../data/settings.defaults.json';
import { platform } from '../platform';

/**
 * Settings (settings_and_saveload §1): atoms in data/settings.defaults.json,
 * the player's changes persisted immediately through platform.storage and
 * applied live — systems read `settings()` at the moment they need a value,
 * React reads `useSettings`. Settings are the device's, not the run's: they
 * are not part of a save slot.
 */
export type Settings = Omit<typeof defaults, '$comment'>;
export type Difficulty = 'relaxed' | 'normal';

const STORAGE_KEY = 'bangalore-times:settings';

const clone = (): Settings => {
  const { $comment: _c, ...rest } = structuredClone(defaults);
  return rest as Settings;
};

/** Merge stored values over defaults, section by section — new settings get their default. */
export function mergeSettings(stored: unknown): Settings {
  const base = clone();
  if (!stored || typeof stored !== 'object') return base;
  for (const [section, values] of Object.entries(stored as Record<string, unknown>)) {
    if (!(section in base) || !values || typeof values !== 'object') continue;
    const target = (base as unknown as Record<string, Record<string, unknown>>)[section];
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      if (k in target && typeof v === typeof target[k]) target[k] = v;
    }
  }
  return base;
}

interface SettingsState {
  settings: Settings;
  /** Change one value; persists immediately. */
  set<S extends keyof Settings, K extends keyof Settings[S]>(section: S, key: K, value: Settings[S][K]): void;
  /** Settings → Data → Reset settings. */
  reset(): void;
  /** Read the stored settings (BootScene). */
  load(): Promise<void>;
}

const persist = (settings: Settings) => {
  void platform.storage.set(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
};

export const useSettings = create<SettingsState>((set, get) => ({
  settings: clone(),
  set(section, key, value) {
    const settings = structuredClone(get().settings);
    (settings[section] as Record<string, unknown>)[key as string] = value;
    set({ settings });
    persist(settings);
  },
  reset() {
    const settings = clone();
    set({ settings });
    persist(settings);
  },
  async load() {
    try {
      const raw = await platform.storage.get(STORAGE_KEY);
      set({ settings: mergeSettings(raw ? JSON.parse(raw) : null) });
    } catch {
      set({ settings: clone() });
    }
  },
}));

/** Current settings, for systems outside React. */
export const settings = (): Settings => useSettings.getState().settings;

/** Relaxed halves survival ticks (ADR-16). */
export const survivalRate = (): number => (settings().gameplay.difficulty === 'relaxed' ? 0.5 : 1);
