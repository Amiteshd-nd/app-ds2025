import { platform } from '../platform';
import { DISTRICTS } from '../data';
import { initialClock, useGameStore } from '../store';
import { defaultProfile, sheetForProfile } from '../utils/profile';
import {
  DEFAULT_DIRECTION,
  DEFAULT_PLAYER_NAME,
  LEGACY_SCENE_DISTRICTS,
  MIGRATABLE_SAVE_VERSIONS,
  SAVE_KEY,
  SAVE_SLOTS,
  SAVE_VERSION,
  START_DISTRICT,
  STARTING_BATTERY,
  STARTING_FOOD,
  STARTING_HEALTH,
  STARTING_STAMINA,
  STARTING_STRESS,
  STARTING_WALLET,
} from '../utils/constants';
import type { PlayerStats, SaveData, WorldPosition } from '../utils/types';

/**
 * SaveManager — the run on disk (settings_and_saveload §2, T-011).
 *
 * Slots: `autosave` (area transitions, sleep, purchases, quest steps) and
 * three manual slots. Storage goes through `platform.saves` — files on a
 * phone, browser storage on the web — never a direct device API (ADR-64).
 * Disk is asynchronous, the game is not: `init()` reads every slot once at
 * boot into a cache; `load()` answers from the cache and `save()` updates it
 * and writes through in the background. Every disk call is guarded: a full
 * quota or private mode must never take the game down.
 */
export type SlotId = (typeof SAVE_SLOTS)[number];

/** What the Load menu shows per slot (thumbnail arrives with the menu art). */
export interface SlotSummary {
  slot: SlotId;
  empty: boolean;
  name?: string;
  place?: string;
  day?: number;
  wallet?: number;
  playtimeSeconds?: number;
  timestamp?: number;
}

/** Where slots live. `platform.saves` in the game; an in-memory map in tests. */
export interface SaveBackend {
  read(slot: string): Promise<Record<string, unknown> | null>;
  write(slot: string, payload: Record<string, unknown>): Promise<void>;
  remove(slot: string): Promise<void>;
  /** Pre-slot saves lived under one key; read once to migrate. */
  legacy?(): Promise<string | null>;
  clearLegacy?(): Promise<void>;
}

const platformBackend = (): SaveBackend => ({
  read: (slot) => platform.saves.read(slot),
  write: (slot, payload) => platform.saves.write(slot, payload),
  remove: (slot) => platform.saves.remove(slot),
  legacy: () => platform.storage.get(SAVE_KEY),
  clearLegacy: () => platform.storage.remove(SAVE_KEY),
});

export class SaveManager {
  private static instance: SaveManager | null = null;

  static getInstance(): SaveManager {
    if (!SaveManager.instance) SaveManager.instance = new SaveManager();
    return SaveManager.instance;
  }

  static resetInstance(): void {
    SaveManager.instance = null;
  }

  /**
   * Save namespace. The Test Playground (dev only) switches to its own so its
   * autosaves never touch the player's real slots; the game never calls this.
   */
  private static namespace = '';

  static useNamespace(namespace: string): void {
    SaveManager.namespace = namespace;
  }

  private backend: SaveBackend;
  private cache = new Map<SlotId, unknown>();
  private ready = false;
  /** Real seconds played, carried from the loaded run plus this session. */
  private playtimeMs = 0;

  constructor(backend: SaveBackend = platformBackend()) {
    this.backend = backend;
  }

  /** Swap the storage (tests). */
  useBackend(backend: SaveBackend): void {
    this.backend = backend;
    this.cache.clear();
    this.ready = false;
  }

  private key(slot: SlotId): string {
    return SaveManager.namespace ? `${SaveManager.namespace}:${slot}` : slot;
  }

  /** Read every slot once (BootScene). A pre-slot save becomes the autosave. */
  async init(): Promise<void> {
    for (const slot of SAVE_SLOTS) {
      try {
        this.cache.set(slot, await this.backend.read(this.key(slot)));
      } catch {
        this.cache.set(slot, null);
      }
    }
    if (!SaveManager.namespace && !this.cache.get('autosave') && this.backend.legacy) {
      try {
        const raw = await this.backend.legacy();
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          this.cache.set('autosave', parsed);
          await this.backend.write(this.key('autosave'), parsed);
          await this.backend.clearLegacy?.();
        }
      } catch {
        // A corrupt legacy save is left where it is; nothing to migrate.
      }
    }
    this.ready = true;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** A fresh run starts its play clock at zero (Title → New Game). */
  startNewRun(): void {
    this.playtimeMs = 0;
  }

  /** Add real play time (WorldScene feeds it while the world runs). */
  tick(deltaMs: number): void {
    this.playtimeMs += deltaMs;
  }

  /**
   * Persist the run at a world position. The position is a district id plus
   * pixels — never a scene class name, so a save stays valid when the code
   * that renders a place changes (ADR-69). Returns false if it could not be
   * written; the cache is updated either way, so play continues.
   */
  save(position: WorldPosition = { districtId: START_DISTRICT, x: 0, y: 0 }, slot: SlotId = 'autosave'): boolean {
    const state = useGameStore.getState();

    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      player: {
        profile: state.profile,
        appearance: state.appearance,
        position,
        direction: DEFAULT_DIRECTION,
      },
      stats: state.stats,
      skills: state.skills,
      reputation: state.reputation,
      inventory: state.inventory,
      quests: state.quests,
      flags: state.flags,
      met: state.met,
      clock: state.clock,
      counters: state.counters,
      transactions: state.transactions,
      phone: state.phone,
      playtime_seconds: Math.floor(this.playtimeMs / 1000),
    };

    this.cache.set(slot, data);
    try {
      void this.backend.write(this.key(slot), data as unknown as Record<string, unknown>).catch((err) => {
        console.warn(`[SaveManager] could not write ${slot}:`, err);
      });
      return true;
    } catch {
      // A synchronous throw from storage (quota, private mode) — best effort.
      return false;
    }
  }

  /** The run in a slot (default: the autosave, which Continue loads), migrated forward. */
  load(slot: SlotId = 'autosave'): SaveData | null {
    const raw = this.cache.get(slot);
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as SaveData;
    if (data.version === SAVE_VERSION) return data;
    // Upgrade a known older format forward. Anything unrecognised is still
    // refused — a half-applied save is worse than a fresh start.
    if ((MIGRATABLE_SAVE_VERSIONS as readonly string[]).includes(data.version)) {
      try {
        return SaveManager.migrate(data);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** One line per slot for the Load / Save menus. */
  summaries(): SlotSummary[] {
    return SAVE_SLOTS.map((slot) => {
      const data = this.load(slot);
      if (!data) return { slot, empty: true };
      return {
        slot,
        empty: false,
        name: data.player.profile.name || DEFAULT_PLAYER_NAME,
        place: DISTRICTS[data.player.position.districtId]?.name ?? data.player.position.districtId,
        day: data.clock.day,
        wallet: data.stats.wallet,
        playtimeSeconds: data.playtime_seconds,
        timestamp: data.timestamp,
      };
    });
  }

  /** Fill in fields added since an older format and stamp the new version. */
  private static migrate(data: SaveData): SaveData {
    // Pre-1.2.0 saves recorded the scene class that was on screen. Map it to
    // the district that scene rendered; anything unrecognised restarts at the
    // airport rather than refusing the whole run.
    const legacy = data.player.position as unknown as { scene?: string; x?: number; y?: number };
    const districtId =
      data.player.position.districtId ??
      (legacy.scene ? LEGACY_SCENE_DISTRICTS[legacy.scene] : undefined) ??
      START_DISTRICT;

    // Pre-1.3.0 saves had a name and an educational background instead of a
    // profile. Keep the name; everything else takes the default profile, and
    // the sprite is re-derived so an old run gets a real sheet, not 'player'.
    const old = data.player as unknown as { name?: string; homeState?: string };
    const profile = data.player.profile ?? {
      ...defaultProfile(),
      name: old.name ?? '',
      hometown: { state: old.homeState && old.homeState !== 'Other' ? old.homeState : 'Karnataka', town: '' },
    };

    // Pre-1.4.0 stats were {energy, stress, money}: energy was the old name for
    // food, money for the wallet; the new stats start at their defaults.
    const oldStats = data.stats as unknown as Partial<PlayerStats> & { energy?: number; money?: number };
    const stats: PlayerStats = {
      health: oldStats.health ?? STARTING_HEALTH,
      wallet: Math.max(0, oldStats.wallet ?? oldStats.money ?? STARTING_WALLET),
      social: oldStats.social ?? 0,
      stamina: oldStats.stamina ?? STARTING_STAMINA,
      food: oldStats.food ?? oldStats.energy ?? STARTING_FOOD,
      stress: oldStats.stress ?? STARTING_STRESS,
      battery: oldStats.battery ?? STARTING_BATTERY,
    };

    return {
      ...data,
      version: SAVE_VERSION,
      stats,
      met: data.met ?? [],
      clock: data.clock ?? initialClock(),
      counters: data.counters ?? {},
      transactions: data.transactions ?? [],
      phone: data.phone ?? { delivered: [], read: [] },
      playtime_seconds: data.playtime_seconds ?? 0,
      player: {
        profile,
        appearance: data.player.profile ? data.player.appearance : { sheet: sheetForProfile(profile) },
        position: { districtId, x: legacy.x ?? 0, y: legacy.y ?? 0 },
        direction: data.player.direction ?? DEFAULT_DIRECTION,
      },
      reputation: data.reputation ?? { total: 0, byDistrict: {} },
      inventory: data.inventory ?? [],
      quests: data.quests ?? { active: {}, completed: [] },
      flags: data.flags ?? {},
    };
  }

  /** Load a slot and push it into the store. Returns false when there was nothing to load. */
  restore(slot: SlotId = 'autosave'): boolean {
    const data = this.load(slot);
    if (!data) return false;

    useGameStore.getState().hydrate({
      playerName: data.player.profile.name.trim() || DEFAULT_PLAYER_NAME,
      profile: data.player.profile,
      appearance: data.player.appearance,
      stats: data.stats,
      skills: data.skills,
      reputation: data.reputation,
      inventory: data.inventory,
      quests: data.quests,
      flags: data.flags,
      met: data.met,
      clock: data.clock,
      counters: data.counters,
      transactions: data.transactions,
      phone: data.phone,
    });
    this.playtimeMs = (data.playtime_seconds ?? 0) * 1000;
    return true;
  }

  /** Delete a slot (Settings → Data → Delete save). */
  clear(slot: SlotId = 'autosave'): void {
    this.cache.set(slot, null);
    void this.backend.remove(this.key(slot)).catch(() => {});
  }
}
