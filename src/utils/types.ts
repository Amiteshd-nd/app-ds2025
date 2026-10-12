import type { NPC_TIERS, QUEST_TYPES } from './constants';
import type { Degree, Gender, SkinTone } from './profile';

// Direction for player movement and NPC facing.
export type Direction = 'down' | 'left' | 'right' | 'up';

/**
 * Core stats (player_profile_and_stats_v1 §2). Each names its loop step:
 * health = Feedback, wallet = Progress, social = Reward, stamina = Progress,
 * food = Challenge, stress = Feedback, battery = Challenge.
 */
export interface PlayerStats {
  health: number;  // 0-100
  wallet: number;  // ₹ — the single currency; never below 0 (ADR-17)
  social: number;  // named NPCs met; +1 on first conversation
  stamina: number; // 3-8 energy pips, grows via gym/sports milestones
  food: number;    // 0-100, drains while awake
  stress: number;  // 0-100
  battery: number; // 0-100, the phone
}

/** Stats that `adjust()` may move; wallet goes through spend()/earn(). */
export type AdjustableStat = Exclude<keyof PlayerStats, 'wallet' | 'social'>;

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

/**
 * Character creation output (profile doc §1). Gates flavour only — every
 * profile can play every scene (ADR-15). `skin` is identity, not cosmetics.
 */
export interface PlayerProfile {
  name: string;
  gender: Gender;
  age: number;
  hometown: { state: string; town: string };
  college: string;
  degree: Degree;
  skin: SkinTone;
}

export interface PlayerData {
  profile: PlayerProfile;
  appearance: PlayerAppearance;
  position: WorldPosition;
  direction: Direction;
}

// --- Dialogue --------------------------------------------------------------
export interface StatEffect {
  health?: number;
  food?: number;
  stress?: number;
  stamina?: number;
  battery?: number;
  /** Negative = a purchase: applied only through spend(), so it can be refused. */
  wallet?: number;
  xp?: number;
  xp_branch?: SkillBranchName;
  item_add?: string;
  item_remove?: string;
  /** Flags to set (true) or clear (false) — e.g. hotel_checked_in on the receptionist's line. */
  flags?: Record<string, boolean>;
  /** Reputation earned here, credited to the current district and the total (refusing the token scam). */
  reputation?: number;
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

/**
 * A node that hands the conversation to the negotiation mini-system (ADR-22,
 * ADR-95). The node's text is the opening line; the haggle runs inside the
 * same dialogue box and lands on `deal` or `walk` when it resolves.
 */
export interface DialogueNegotiate {
  /** Negotiation id (src/data/negotiations). */
  id: string;
  /** Node to continue at once the deal is paid. */
  deal: string;
  /** Node to continue at when the player walks away. */
  walk: string;
}

export interface DialogueNode {
  text: string;
  negotiate?: DialogueNegotiate;
  portrait_expression?: number; // 0=neutral, 1=angry, 2=happy, …
  choices?: DialogueChoice[];
  next?: string; // auto-advance when there are no choices
  effect?: StatEffect;
  quest_trigger?: string;
  requires?: SkillRequirement;
}

/** Where a conversation opens when a flag is set — NPCs remember (ADR-96). */
export interface DialogueEntryBranch {
  flag: string;
  node: string;
}

export interface DialogueFile {
  id: string;
  speaker: string;
  portrait: string; // spritesheet key
  /** Checked in order before `start`; the first set flag picks the entry node. */
  enter?: DialogueEntryBranch[];
  nodes: Record<string, DialogueNode>;
}

// --- Negotiation (ADR-22, ADR-95) ------------------------------------------
/** How an NPC haggles. One table in constants.ts drives all three. */
export type Temperament = 'warm' | 'firm' | 'slick';
/** What kind of argument a counter-offer makes. */
export type Tactic = 'reason' | 'compare' | 'lowball';

export interface NegotiationTerm {
  id: string;
  /** "Deposit", "Rent (first month)". */
  label: string;
  /** Opening price, ₹. */
  ask: number;
  /** The lowest the NPC will ever go, ₹. Never shown to the player. */
  floor: number;
}

export interface NegotiationCounter {
  id: string;
  /** What the player says, amount included ("Deposit ₹5,000? I join Monday…"). */
  text: string;
  /** Term it argues about. */
  term: string;
  /** Price the player proposes for that term, ₹. */
  offer: number;
  tactic: Tactic;
  /** Only offered once this flag is set — knowledge the player earned elsewhere. */
  requiresFlag?: string;
}

/**
 * NPC lines. Placeholders: {term} label, {amount} new price of the term,
 * {total} the whole bill — all formatted as ₹ with Indian grouping.
 */
export interface NegotiationLines {
  /** Price came down. */
  concede: string;
  /** Already at their floor, or the argument did not move them. */
  hold: string;
  /** A lowball to a temperament that takes offence. */
  offended: string;
  /** Patience is out: take it or leave it. */
  final: string;
  /** Firm/slick NPCs call you back once when you walk. */
  callback?: string;
}

export interface NegotiationDef {
  id: string;
  /** NPC who haggles — for the validator and analytics. */
  npc: string;
  temperament: Temperament;
  /** Counter-offers allowed per visit before the final offer. */
  patience: number;
  terms: NegotiationTerm[];
  counters: NegotiationCounter[];
  lines: NegotiationLines;
  /** Text of the accept choice; {total} is filled in. Default "Agree — pay {total}". */
  acceptText?: string;
  /** Text of the walk-away choice. Default "Walk away". */
  walkText?: string;
  /** spend() reason, e.g. "pg_deposit". */
  reason?: string;
  on_deal?: {
    flags?: string[];
    /** Store counters to set from agreed term prices: counter name → term id. */
    counters?: Record<string, string>;
  };
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
  /** The NPC is gone once this flag is set — the owner who took your token (ADR-96). */
  unlessFlag?: string;
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
  /** ₹ taken by spend() on boarding; the exit refuses if the wallet is short. */
  fare?: number;
  /** Card text shown during the ride; defaults to "<transit> → <district name>". */
  card?: string;
  /** Toast shown when the destination is still locked ("Gate is locked…"). */
  lockedText?: string;
}

/** A zone that announces itself on the bus (`zone:reached`) so quests can react. */
export interface DistrictTrigger {
  zone: string;
  /** Fire on first entry only (default true) — per visit; use unlessFlag for "ever". */
  once?: boolean;
  /** Never fires once this flag is set — a phone call that must not ring twice. */
  unlessFlag?: string;
  /** Flags set on entry — a silent breadcrumb (the HIVR lanyard man). */
  setFlags?: string[];
  /** Dialogue opened on entry — a phone call in the room, a thought at a window. */
  dialogue?: string;
  /** Built-in action on entry. `sleep` = TimeManager.sleep() (bed zones). */
  action?: 'sleep';
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
  /** City Pulse slot names this district offers; each is an object in the map's pulse layer. */
  pulse_slots?: string[];
}

// --- Scene components (SCENE_TEMPLATE §B) ----------------------------------
export interface SceneBeat {
  id: string;
  pacing: string;
  what: string;
  interact?: string;
  reward?: string;
  flag?: string;
  economy?: string;
  reroute?: string;
}

export interface SceneComponent {
  id: string;
  district: string;
  act: number;
  /** Story order, "act.scene" ("0.2") — the playground's prerequisite builder walks it (ADR-105). */
  seq?: string;
  /** Optional arc grouping; the playground tree shows an Arc level once scenes carry one. */
  arc?: string;
  title: string;
  /** "STUB" for Acts 2–4 until co-authored; anything else is a worked scene. */
  status?: string;
  time?: string;
  player_goal: string;
  design_goal: string;
  pacing: string[];
  entry?: { from: string; spawn: string };
  cast: Array<{ npc: string; tier: number; spawn?: string; schedule?: string; role?: string }>;
  objects?: Array<{ id: string; at: string; requires?: string | null }>;
  quests: string[];
  beats: SceneBeat[] | string[];
  economy?: Array<{ trigger: string; spend: number | string; canAfford?: boolean }>;
  conditions?: string[];
  pulse_slots?: string[];
  exits?: DistrictExit[] | string[];
  save_flags?: string[];
  assets_needed?: string[];
  acceptance?: string[];
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
  /** Idle breathing (beh_breathing); default true. False for sleepers, statues, special poses. */
  breathing?: boolean;
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
  type: 'interact' | 'dialogue' | 'collect' | 'reach' | 'flag' | 'challenge';
  target: string; // entity, NPC, item or zone ID
  count?: number;
  optional?: boolean;
}

export interface QuestRewards {
  xp: number;
  xp_branch?: SkillBranchName;
  wallet?: number;
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
  /** Named NPC ids the player has spoken to — the social stat's ledger. */
  met: string[];
  clock: { day: number; minute: number };
  counters: Record<string, number>;
  playtime_seconds: number;
}
