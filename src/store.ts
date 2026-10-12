import { create } from 'zustand';
import {
  SKILL_XP_THRESHOLDS,
  STARTING_BATTERY,
  STARTING_FOOD,
  STARTING_HEALTH,
  STARTING_STAMINA,
  STARTING_STRESS,
  STARTING_WALLET,
  STAT_BOUNDS,
  DEFAULT_PLAYER_NAME,
  DEFAULT_PLAYER_SHEET,
} from './utils/constants';
import type {
  AdjustableStat,
  PlayerAppearance,
  PlayerProfile,
  PlayerSkills,
  PlayerStats,
  ReputationState,
  SkillBranchName,
} from './utils/types';
import { defaultProfile, sheetForProfile } from './utils/profile';

// Central game state shared between Phaser scenes and the React HUD.
//
// The v1.0 architecture note calls for singleton managers (StatsManager,
// QuestManager, …). Here those managers live in src/systems and delegate to
// this store, so Phaser and React read one source of truth instead of two.
// Managers own the rules; the store owns the data.

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const emptySkills = (): PlayerSkills => ({
  technical: { xp: 0, level: 0 },
  soft_skills: { xp: 0, level: 0 },
  city_survival: { xp: 0, level: 0 },
});

// Highest tier whose XP threshold has been met.
const levelForXp = (xp: number): number => {
  let level = 0;
  for (let i = 0; i < SKILL_XP_THRESHOLDS.length; i++) {
    if (xp >= SKILL_XP_THRESHOLDS[i]) level = i;
  }
  return level;
};

export interface QuestState {
  /** quest id -> ids of completed objectives. */
  active: Record<string, string[]>;
  completed: string[];
}

export interface GameState {
  /**
   * Lifetime ₹ earned. The spendable balance is stats.money; this is the
   * cumulative figure a leaderboard would rank on.
   */
  totalEarned: number;
  /** Display name; kept in sync with profile.name. */
  playerName: string;
  profile: PlayerProfile;
  appearance: PlayerAppearance;
  botCount: number;
  /** Key of the scene currently on screen — drives what the React HUD shows. */
  activeScene: string | null;
  /** District WorldScene is rendering, or null outside the world. */
  activeDistrict: string | null;
  stats: PlayerStats;
  skills: PlayerSkills;
  reputation: ReputationState;
  /** Item ids; stackables appear once per unit, matching SaveData.inventory. */
  inventory: string[];
  quests: QuestState;
  flags: Record<string, boolean>;
  /** Named NPCs spoken to; drives `stats.social`. */
  met: string[];

  setBotCount: (botCount: number) => void;
  setPlayerName: (playerName: string) => void;
  /** Store the profile and derive the sprite from it (age + gender + skin). */
  setProfile: (profile: PlayerProfile) => void;
  setAppearance: (appearance: PlayerAppearance) => void;
  setActiveScene: (activeScene: string | null) => void;
  setActiveDistrict: (activeDistrict: string | null) => void;

  /** Move a bounded stat; clamped to STAT_BOUNDS. */
  adjustStat: (stat: AdjustableStat, delta: number) => void;
  /** Change the wallet; income accrues to totalEarned, balance never dips below 0. */
  adjustWallet: (delta: number) => void;
  /** Record a first conversation. Returns true when the NPC was new (social +1). */
  markMet: (npcId: string) => boolean;

  addXp: (branch: SkillBranchName, amount: number) => void;
  setFlag: (key: string, value: boolean) => void;

  /** Wholesale replacement — InventoryManager/QuestManager own the rules. */
  setInventory: (inventory: string[]) => void;
  setQuests: (quests: QuestState) => void;

  hydrate: (partial: Partial<GameState>) => void;
  reset: () => void;
}

const initialStats = (): PlayerStats => ({
  health: STARTING_HEALTH,
  wallet: STARTING_WALLET,
  social: 0,
  stamina: STARTING_STAMINA,
  food: STARTING_FOOD,
  stress: STARTING_STRESS,
  battery: STARTING_BATTERY,
});

const initialQuests = (): QuestState => ({ active: {}, completed: [] });

const initialReputation = (): ReputationState => ({ total: 0, byDistrict: {} });

const initialAppearance = (): PlayerAppearance => ({ sheet: DEFAULT_PLAYER_SHEET });

export const useGameStore = create<GameState>((set, get) => ({
  totalEarned: 0,
  playerName: DEFAULT_PLAYER_NAME,
  profile: defaultProfile(),
  appearance: initialAppearance(),
  botCount: 0,
  activeScene: null,
  activeDistrict: null,
  stats: initialStats(),
  skills: emptySkills(),
  reputation: initialReputation(),
  inventory: [],
  quests: initialQuests(),
  flags: {},
  met: [],

  setBotCount: (botCount) => set({ botCount }),
  setPlayerName: (playerName) => set({ playerName }),
  setProfile: (profile) =>
    set({
      profile,
      playerName: profile.name.trim() || DEFAULT_PLAYER_NAME,
      appearance: { sheet: sheetForProfile(profile) },
    }),
  setAppearance: (appearance) => set({ appearance }),
  setActiveScene: (activeScene) => set({ activeScene }),
  setActiveDistrict: (activeDistrict) => set({ activeDistrict }),

  adjustStat: (stat, delta) =>
    set((state) => {
      const [min, max] = STAT_BOUNDS[stat];
      return { stats: { ...state.stats, [stat]: clamp(state.stats[stat] + delta, min, max) } };
    }),

  adjustWallet: (delta) =>
    set((state) => ({
      stats: { ...state.stats, wallet: Math.max(0, state.stats.wallet + delta) },
      // Only income accumulates; spending must not inflate lifetime earnings.
      totalEarned: delta > 0 ? state.totalEarned + delta : state.totalEarned,
    })),

  markMet: (npcId) => {
    if (get().met.includes(npcId)) return false;
    set((state) => ({
      met: [...state.met, npcId],
      stats: { ...state.stats, social: state.stats.social + 1 },
    }));
    return true;
  },

  addXp: (branch, amount) =>
    set((state) => {
      const xp = state.skills[branch].xp + amount;
      return {
        skills: { ...state.skills, [branch]: { xp, level: levelForXp(xp) } },
      };
    }),

  setFlag: (key, value) =>
    set((state) => ({ flags: { ...state.flags, [key]: value } })),

  setInventory: (inventory) => set({ inventory }),
  setQuests: (quests) => set({ quests }),

  hydrate: (partial) => set(partial),

  reset: () =>
    set({
      totalEarned: 0,
      playerName: DEFAULT_PLAYER_NAME,
      profile: defaultProfile(),
      appearance: initialAppearance(),
      stats: initialStats(),
      skills: emptySkills(),
      reputation: initialReputation(),
      inventory: [],
      quests: initialQuests(),
      flags: {},
      met: [],
    }),
}));
