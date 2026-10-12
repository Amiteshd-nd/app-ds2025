import { useGameStore } from '../store';
import { defaultProfile, sheetForProfile } from '../utils/profile';
import {
  DEFAULT_DIRECTION,
  DEFAULT_PLAYER_NAME,
  LEGACY_SCENE_DISTRICTS,
  MIGRATABLE_SAVE_VERSIONS,
  SAVE_KEY,
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
 * SaveManager — localStorage serialization of the run.
 *
 * Writes the SaveData shape from the v1.0 spec, including `version`, so a later
 * format change can migrate rather than discard. Every call is guarded: a
 * private-mode or quota-full browser must not take the game down with it.
 */
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
   * Persist the run at a world position. The position is a district id plus
   * pixels — never a scene class name, so a save stays valid when the code
   * that renders a place changes (ADR-69).
   */
  save(position: WorldPosition = { districtId: START_DISTRICT, x: 0, y: 0 }): boolean {
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
      playtime_seconds: 0,
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      // Private browsing or quota exceeded — saving is best-effort.
      return false;
    }
  }

  load(): SaveData | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;

    try {
      const data = JSON.parse(raw) as SaveData;
      if (data.version === SAVE_VERSION) return data;

      // Upgrade a known older format forward. Anything unrecognised is still
      // refused — a half-applied save is worse than a fresh start.
      if ((MIGRATABLE_SAVE_VERSIONS as readonly string[]).includes(data.version)) {
        return SaveManager.migrate(data);
      }
      return null;
    } catch {
      return null;
    }
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

  /** Load and push into the store. Returns false when there was nothing to load. */
  restore(): boolean {
    const data = this.load();
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
    });
    return true;
  }

  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Nothing to do — the save was unreachable anyway.
    }
  }
}
