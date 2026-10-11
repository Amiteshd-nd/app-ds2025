import type { NPC_TIERS, PlayerBackground, QUEST_TYPES } from './constants';

// Direction for player movement and NPC facing.
export type Direction = 'down' | 'left' | 'right' | 'up';

export interface PlayerStats {
  energy: number; // 0-100
  stress: number; // 0-100
  money: number; // ₹ — the single currency; no second currency until the
  // gameplay actually needs one.
}

/**
 * Standing in the city. `total` drives the macro-loop tier; `byDistrict` is
 * local trust, which is what gates access to an area's deeper missions.
 */
export interface ReputationState {
  total: number;
  byDistrict: Record<string, number>;
}

export interface SkillBranch {
  xp: number;
  level: number; // 0-4 (5 tiers total)
}

export interface PlayerSkills {
  technical: SkillBranch;
  soft_skills: SkillBranch;
  city_survival: SkillBranch;
}

export type SkillBranchName = keyof PlayerSkills;

/** How the player is drawn: a sprite-sheet key. P2 widens this to base × attire × skin. */
export interface PlayerAppearance {
  sheet: string;
}

/** Where the player is: a district id, never a scene class name (ADR-69). */
export interface WorldPosition {
  districtId: string;
  x: number;
  y: number;
}

export interface PlayerData {
  name: string;
  background: PlayerBackground;
  homeState: string;
  appearance: PlayerAppearance;
  position: WorldPosition;
  direction: Direction;
}

// --- Dialogue --------------------------------------------------------------
export interface StatEffect {
  energy?: number;
  stress?: number;
  money?: number;
  xp?: number;
  xp_branch?: SkillBranchName;
  item_add?: string;
  item_remove?: string;
}

export interface SkillRequirement {
  skill: SkillBranchName;
  level: number;
}

export interface DialogueChoice {
  text: string;
  next: string;
  effect?: StatEffect;
  requires?: SkillRequirement;
  quest_trigger?: string;
}

export interface DialogueNode {
  text: string;
  portrait_expression?: number; // 0=neutral, 1=angry, 2=happy, …
  choices?: DialogueChoice[];
  next?: string; // auto-advance when there are no choices
  effect?: StatEffect;
  quest_trigger?: string;
  requires?: SkillRequirement;
}

export interface DialogueFile {
  id: string;
  speaker: string;
  portrait: string; // spritesheet key
  nodes: Record<string, DialogueNode>;
}

// --- Districts -------------------------------------------------------------
export type TransitKind = 'walk' | 'bus' | 'metro' | 'scooter' | 'cab';

/** What must be true before the player may enter a district. */
export interface DistrictUnlock {
  /** Quest that must be completed. */
  quest?: string;
  /** Minimum total reputation. */
  reputation?: number;
  /** Flags that must all be set. */
  flags?: string[];
}

/** An NPC placed in a district: the definition is referenced by id, never copied. */
export interface DistrictNpcRef {
  id: string;
  /** Object name in the map's spawn layer. */
  spawn: string;
}

/** A placed object positioned by data rather than in Tiled. */
export interface DistrictObjectRef {
  /** ObjectDef id. */
  id: string;
  /** Spawn object name to place it at. */
  at: string;
  /** Item the player must hold for the object to exist — a delivered table, say. */
  requires?: string;
}

/** Ambient crowd: random-walk bots drawn from a pool of sprite sheets. */
export interface DistrictAmbient {
  base: string[];
  count: number;
  /** Rectangle object in the spawn layer that bounds the crowd; whole map when absent. */
  area?: string;
}

/** A zone that leads somewhere else. Always goes through TransitScene. */
export interface DistrictExit {
  /** Zone object name in the spawn layer. */
  zone: string;
  /** Destination district id. */
  to: string;
  /** Spawn object name in the destination map. */
  spawn: string;
  transit: TransitKind;
  /** Card text shown during the ride; defaults to "<transit> → <district name>". */
  card?: string;
}

/** A zone that announces itself on the bus (`zone:reached`) so quests can react. */
export interface DistrictTrigger {
  zone: string;
  /** Fire on first entry only (default true). */
  once?: boolean;
}

/**
 * A district is the unit of world expansion and the ONLY way a place exists:
 * one WorldScene reads an entry and builds the place from it. Adding a
 * district is adding an entry plus a map — no scene class, ever (ADR-15/60).
 */
export interface DistrictDef {
  id: string;
  name: string;
  /** Key in maps.manifest.json. */
  map: string;
  /** Spawn object used when no spawn is named by the exit that led here. */
  defaultSpawn: string;
  fadeMs?: number;
  unlock?: DistrictUnlock;
  /** Quests started on entry; QuestManager.start is idempotent. */
  quests?: string[];
  npcs?: DistrictNpcRef[];
  objects?: DistrictObjectRef[];
  ambient?: DistrictAmbient;
  exits?: DistrictExit[];
  triggers?: DistrictTrigger[];
  /** Behaviour molecules by name — see src/world/behaviours. */
  behaviours?: string[];
}

// --- NPCs ------------------------------------------------------------------
export type NpcTier = (typeof NPC_TIERS)[number];

/**
 * NPC definitions live in data so populating a district is authoring, not
 * coding. Tier decides how much the NPC is expected to carry narratively.
 */
export interface NpcDef {
  id: string;
  name: string;
  tier: NpcTier;
  /** Dialogue id. Required for tier 2 and 3; ambient NPCs have none. */
  dialogue?: string;
  /** Sprite-sheet key. Falls back to the placeholder silhouette until art lands. */
  sheet?: string;
  /** Placeholder tint until real portraits and sprites land. */
  tint?: number;
}

// --- Placeable objects -----------------------------------------------------
/**
 * A placeable world object, described flatly enough that a script — or a
 * vision model captioning a bought tileset — can generate one correctly.
 *
 * `tiles` lists tile names row-major, top-left to bottom-right, with exactly
 * `tilesWide * tilesTall` entries. Names resolve against the tileset's
 * generated id map, so a manifest never hard-codes a bare tile index.
 */
export interface ObjectDef {
  id: string;
  label: string;
  category: string;
  /** Image footprint in grid cells. */
  tilesWide: number;
  tilesTall: number;
  /**
   * Rows at the TOP of the image that are purely visual — a tree's canopy, a
   * bookcase's upper shelves. The remaining bottom rows are the footprint that
   * blocks movement. See src/core/depth.ts for why this reading was chosen.
   */
  backgroundTiles: number;
  /** Whether the footprint blocks movement. */
  solid: boolean;
  /** Whether a runtime hue shift is offered for this object. */
  colorEditable: boolean;
  /** Named variants — orientations, on/off states. A simple item has `default`. */
  tiles: Record<string, string[]>;
}

// --- Quests ----------------------------------------------------------------
export interface QuestObjective {
  id: string;
  text: string;
  type: 'interact' | 'dialogue' | 'collect' | 'reach' | 'challenge';
  target: string; // entity, NPC, item or zone ID
  count?: number;
  optional?: boolean;
}

export interface QuestRewards {
  xp: number;
  xp_branch?: SkillBranchName;
  money?: number;
  /** Reputation gained — credited globally and to the quest's district. */
  reputation?: number;
  items?: string[];
  skill_unlock?: string;
  unlocks?: string[]; // scene keys or quest IDs
}

/** One of the ten reusable mission archetypes. */
export type QuestType = (typeof QUEST_TYPES)[number];

export interface QuestFile {
  id: string;
  title: string;
  description: string;
  chapter: number;
  /** Which district this mission belongs to. */
  district: string;
  /** Which archetype drives it — the same system runs all ten. */
  type: QuestType;
  prerequisite_quests?: string[];
  /** Minimum total reputation before this mission is offered. */
  reputation_required?: number;
  objectives: QuestObjective[];
  rewards: QuestRewards;
  on_complete?: {
    /** Flags to set — districts and dialogue gate on these. */
    set_flags?: string[];
    trigger_dialogue?: string;
    trigger_cutscene?: string;
  };
}

// --- Items -----------------------------------------------------------------
export type ItemType = 'consumable' | 'key_item' | 'gift' | 'equipment';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  icon: string; // spritesheet key
  type: ItemType;
  effect?: StatEffect;
  stackable: boolean;
  max_stack?: number;
}

// --- Save ------------------------------------------------------------------
export interface SaveData {
  version: string; // SAVE_VERSION, for migration support
  timestamp: number;
  player: PlayerData;
  stats: PlayerStats;
  skills: PlayerSkills;
  reputation: ReputationState;
  inventory: string[]; // item IDs
  quests: {
    active: Record<string, string[]>; // quest_id -> completed objective IDs
    completed: string[];
  };
  flags: Record<string, boolean>; // generic flags for branching
  playtime_seconds: number;
}
