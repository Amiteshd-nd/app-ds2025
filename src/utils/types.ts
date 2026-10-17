import type { NPC_TIERS, QUEST_TYPES } from './constants';
import type { Degree, Gender, SkinTone } from './profile';
import type { IconName } from '../ui/kit/icons';

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
  /** Move a named NPC's relationship to a state — Ananya's number exchanged (ADR-123). */
  relationship?: { npc: string; state: RelationshipState };
  /** Fuel added to (or taken from) the scooter's tank, 0–100 (ADR-126). */
  fuel?: number;
  /** Box slots picked up (flat-pack, story 2.4, ADR-132); a choice past the carry limit is locked "Not enough space". */
  carry?: number;
  /** Put every box down (assembly at home). */
  carry_clear?: boolean;
  /** Game minutes that pass (an hour on a bench at 1 AM, ADR-133). */
  minutes?: number;
  /** A card sequence that plays when the conversation closes ("Tell me." → the corridor, ADR-138). */
  card?: string;
  /** An audio token played when the line shows (the glass tapping in Ward 4, ADR-140). */
  cue?: string;
}

// --- Relationships (game_components §8, ADR-123) ---------------------------
/** Five light states, no meters shown: met → warm → strained → resolved / lost. */
export type RelationshipState = 'met' | 'warm' | 'strained' | 'resolved' | 'lost';

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
  /** Locked (shown greyed with `lockedText`) once this flag is set — a box already in the trolley (ADR-132). */
  unlessFlag?: string;
  /** Locked until this flag is set — the tills need a box first. */
  requiresFlag?: string;
  /** Why it is locked; default "Done" / "Not yet". */
  lockedText?: string;
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
export type TransitKind = 'walk' | 'bus' | 'metro' | 'scooter' | 'cab' | 'auto';

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
  /** The NPC is here only once this flag is set — Sameer and Ravi at the gate after the workday (ADR-121). */
  requiresFlag?: string;
  /** Only by day or only by night (23:00–05:30) — the office crowd goes home (ADR-133). */
  onlyAt?: 'day' | 'night';
}

/** A placed object positioned by data rather than in Tiled. */
export interface DistrictObjectRef {
  /** ObjectDef id. */
  id: string;
  /** Spawn object name to place it at. */
  at: string;
  /** Item the player must hold for the object to exist — a delivered table, say. */
  requires?: string;
  /** Flag that must be set for the object to exist — the cot once bought (ADR-122). */
  requiresFlag?: string;
  /** The object is gone once this flag is set — the metro barricade on opening day (ADR-127). */
  unlessFlag?: string;
  /** Every one of these flags must be set — a bookshelf both bought and assembled (ADR-132). */
  requiresFlags?: string[];
  /** Placed at the spawn's exact pixel (not snapped to the tile grid) — over a bed drawn in the map (ADR-142). */
  exact?: boolean;
}

/** Ambient crowd: random-walk bots drawn from a pool of sprite sheets. */
export interface DistrictAmbient {
  base: string[];
  count: number;
  /** How many are still out between 23:00 and 05:30 (default none, ADR-133). */
  nightCount?: number;
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
  /** Toast shown when the destination is still locked ("Gate is locked…") or `requiresFlag` is not yet set. */
  lockedText?: string;
  /** The ride needs this flag (a fare agreed with a driver); boarding spends it, so the next ride is bargained again (ADR-121). */
  requiresFlag?: string;
  /** Game minutes the journey takes — the clock jumps on arrival (a 40-minute walk makes you late; ADR-121). */
  minutes?: number;
  /** ₹ more per box carried — the conductor's luggage ticket (story 2.4, ADR-132). */
  farePerBox?: number;
  /** Runs only by day or only by night (23:00–05:30) — the hill's night auto (ADR-133). Buses never run at night. */
  onlyAt?: 'day' | 'night';
}

/** A zone that announces itself on the bus (`zone:reached`) so quests can react. */
export interface DistrictTrigger {
  zone: string;
  /** Fire on first entry only (default true) — per visit; use unlessFlag for "ever". */
  once?: boolean;
  /** Never fires once this flag is set — a phone call that must not ring twice. */
  unlessFlag?: string;
  /** Fires only once this flag is set — the office door waits until Divya has been found (ADR-121). */
  requiresFlag?: string;
  /** Flags set on entry — a silent breadcrumb (the HIVR lanyard man). */
  setFlags?: string[];
  /** Dialogue opened on entry — a phone call in the room, a thought at a window. */
  dialogue?: string;
  /** Built-in action on entry. `sleep` = TimeManager.sleep() (bed zones); `workday` = TimeManager.workday() behind a fade (the office door); `rhythm` = the mini-game named by `minigame` (the flat's guitar, ADR-131); `card` = the card sequence named by `card` (the HIVR day and the ride home, ADR-136). */
  action?: 'sleep' | 'workday' | 'rhythm' | 'card';
  /** MINIGAMES id for `action: rhythm`. */
  minigame?: string;
  /** CARDS id for `action: card`. */
  card?: string;
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
  /** Maps offers METRO / RIDE here before the first visit once this flag is set — the shop's text named the stop (story 2.3, ADR-131). */
  knownIf?: string;
  /** "The first sleep here after `after`, set `set`" — the sleepEvents behaviour (ADR-132). */
  sleepEvents?: Array<{ after: string; set: string[]; clear?: string[]; toast?: string; icon?: IconName; /** Wake at this minute past midnight instead of the morning (ADR-133). */ wakeAt?: number; /** Fire on the n-th night after `after` (ADR-135). */ nights?: number; /** A card sequence played on waking — ACT 3 — FEVER (ADR-136). */ card?: string }>;
  /** Spawn object used when no spawn is named by the exit that led here. */
  defaultSpawn: string;
  /** Walk at this share of normal speed, and no running (a cast in the ward, story 3.2, ADR-137). */
  walkSpeed?: number;
  /** Play as someone else here: their sheet replaces yours (Ravi in the corridor, story 3.3, ADR-138). */
  playerSheet?: string;
  /** `minimal`: the HUD shows only the objective — no clock, wallet, meters, phone or map (it isn't your life; ADR-138). */
  hud?: 'minimal';
  /** The hotel's night plate as data (ADR-142): once `after` is set, the HUD shows `label · N nights` left (the `countdown` behaviour). */
  countdown?: { after: string; nights: number; label: string };
  /** Signal bars by flag, the last set one wins over `signal` (the ward's signal dies, ADR-142). */
  signalIf?: Array<{ flag: string; bars: number }>;
  /** This place's stability by flag, the last set one wins (default 100) — the ward thins night by night (ADR-142); Act 4's grade() later. */
  stabilityIf?: Array<{ flag: string; stability: number }>;
  /** A fixed night-blue shade (0–1) regardless of the clock — a lit lab at 01:52 (ADR-138); `nightLook` uses it. */
  nightTint?: number;
  /** Sounds that come from a spot (ADR-139): a looping token fades with distance; a one-shot repeats every `every` [min, max] seconds. `at` = a spawn/zone in the map. */
  audioSources?: Array<{ at: string; token: string; every?: [number, number]; radius?: number; /** `human` sources fall silent once the place turns (stability < 40, ADR-140)… */ kind?: 'human' | 'machine'; /** …and this token plays instead (ADR-29 uncanny reuse). */ uncanny?: string }>;
  fadeMs?: number;
  unlock?: DistrictUnlock;
  /** Phone signal bars inside these zones (the hill's three doors, ADR-122); elsewhere the district's `signal`. */
  signalZones?: Array<{ zone: string; bars: number; flag?: string }>;
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
  /**
   * Where it is in real Bengaluru (map_navigation §1–2): a pin for the phone's
   * Maps app. Interiors name their `parent` pocket instead of coordinates.
   */
  realworld?: { lat: number; lng: number; label?: string; area?: RealArea } | { parent: string };
  /** Phone signal bars here, 0–4 (default 4). The Ambedkar Nagar hill is weak (ADR-114 status bar). */
  signal?: number;
  /** Metro station (city.json id) this pocket sits on: makes it a fast-travel node once visited (ADR-115). */
  metroStation?: string;
  /** Buses that call at this pocket on a visible interval (story 1.5 F2, ADR-123) — run by `busSchedule`. */
  buses?: BusSchedule[];
  /** A ride that ends on its own: the bus interior (story 1.5 F3) — run by `busRide`. */
  ride?: RideDef;
  /** Where a photo is worth taking: standing inside the zone frames `photo` in the Camera app (City Moments, ADR-123). */
  photoSpots?: Array<{ zone: string; photo: string }>;
  /** An NPC who walks with the player while `whileFlag` is set and `untilFlag` is not (Ananya's loop, ADR-123) — run by `companion`. */
  companion?: CompanionDef;
  /** Zones where the fuel gauge shows (a petrol bunk's forecourt, ADR-126) — run by `fuelSpots`. */
  fuelSpots?: string[];
}

/**
 * A bus on an interval (ADR-123). Every `every` real seconds the bus slides in
 * from spawn `from` to spawn `stop`, waits `dwell` seconds with `flag` set (the
 * boarding exit on `zone` carries `requiresFlag: flag`), then leaves to `to`.
 */
export interface BusSchedule {
  id: string;
  /** "500-D" — what the HUD countdown and the toasts call it. */
  label: string;
  /** The boarding exit's zone (an exit of this district). */
  zone: string;
  /** Flag that is true only while the bus stands at the stop. */
  flag: string;
  /** Seconds between arrivals (real time, while the world runs). */
  every: number;
  /** Seconds the bus waits at the stop. */
  dwell: number;
  /** Spawn points (feet/centre) the bus sprite travels between. */
  from: string;
  stop: string;
  to: string;
  /** Prop image key (src/assets/props) drawn as the bus; a plain block when absent. */
  prop?: string;
}

/** A timed ride (ADR-123): after `seconds` of free play the flag is set and the exit on `exit` is taken. */
export interface RideDef {
  seconds: number;
  /** Exit zone of this district that the ride ends through. */
  exit: string;
  /** Flag the ride's end sets — the door exit carries `requiresFlag` on it, so you cannot leave a moving bus. */
  flag: string;
  /** "Cubbon Park" — the HUD countdown's label. */
  label: string;
}

export interface CompanionDef {
  npc: string;
  whileFlag: string;
  untilFlag?: string;
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
  /** Where the scene starts; `after` names the beats that happen before this entry (their flags are prerequisite state in the Playground). */
  entry?: { from: string; spawn: string; after?: string[] };
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
  /** Dialogue bleep voice (ADR-139): adult_m · adult_f · elder · kid. Narration (no speaker) ticks instead. */
  voice?: 'adult_m' | 'adult_f' | 'elder' | 'kid';
  /** A small repeating mannerism drawn by Populate — the jogger who coughs and waves it off (ADR-123). */
  tic?: 'cough';
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
  /** Named variants — orientations, on/off states. A simple item has `default`. Absent for sprite objects. */
  tiles?: Record<string, string[]>;
  /** A prop image (src/assets/props/<sprite>.png, from scripts/import-props.mjs) drawn instead of tiles — furniture (ADR-122). */
  sprite?: string;
}

// --- Quests ----------------------------------------------------------------
export interface QuestObjective {
  id: string;
  text: string;
  type: 'interact' | 'dialogue' | 'collect' | 'reach' | 'flag' | 'challenge';
  target: string; // entity, NPC, item or zone ID
  count?: number;
  optional?: boolean;
  /** District this objective happens in — the Maps destination pin while it is open. */
  destination?: string;
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
  /** UPI ledger (1.6.0). */
  transactions: Array<{ amount: number; label: string; reason: string; day: number; minute: number; balance: number }>;
  /** Chat messages delivered / read (1.6.0). */
  phone: { delivered: string[]; read: string[] };
  /** Named-NPC relationship states (1.7.0, ADR-123). */
  relationships: Record<string, RelationshipState>;
  playtime_seconds: number;
}

// --- Phone (P6, game_components §3) ----------------------------------------
export interface PhoneApp {
  id: string;
  name: string;
  /** Glyph from src/ui/kit/icons.ts (validated). */
  icon: string;
  order: number;
  /** In the home screen's dock (max 4) instead of the grid. */
  dock?: boolean;
  /** Flag that teaches it (ADR-39); greyed until set. */
  unlock?: string;
  /** Shown on the greyed icon. */
  hint?: string;
  /** Gone from the phone once this flag is set — Jodi uninstalls itself (ADR-134). */
  until?: string;
  /** A banner inside the app while a flag is set — UPI's "Server busy" (ADR-142). */
  noticeIf?: { flag: string; text: string };
}

export interface ChatMessage {
  id: string;
  from: 'them' | 'me';
  text: string;
  /** Delivered once this flag is set (and every earlier message in the thread). */
  after?: string;
  /** Buzzes even under Do Not Disturb (story-critical). */
  critical?: boolean;
  /** ₹ that arrive with the message through earn() — Ananya returning the sixty (ADR-123). */
  upi?: number;
  /** A branch the player may never take (the optional walk, the clip kept or sent): later messages do not wait for it (ADR-131). */
  optional?: boolean;
}

export interface ChatThread {
  id: string;
  contact: string;
  messages: ChatMessage[];
}

// ── City map (P6b, ADR-113/114/115) ─────────────────────────────────────────

export type LatLng = [lat: number, lng: number];

/** Glyph-field kinds; each draws with its own `tile_mapglyph_*` atom. */
export type MapRegionKind = 'park' | 'lake' | 'commercial' | 'it' | 'residential' | 'hill';

export interface MapRegion {
  id: string;
  kind: MapRegionKind;
  label: string;
  /** Simplified outline, real coordinates (traced by eye; never map tiles — map_navigation §5). */
  outline: LatLng[];
}

export interface MapPath {
  id: string;
  kind: 'road' | 'walk';
  label: string;
  points: LatLng[];
  /** The two map nodes this path carries a journey between (district exits use it). */
  connects?: [string, string];
}

export interface MetroStation {
  id: string;
  label: string;
  at: LatLng;
}

export interface MetroLine {
  id: string;
  label: string;
  /** UI token for the accent dash, e.g. "map.metro.purple". */
  colour: string;
  stations: MetroStation[];
}

/** A place on the map that is not (yet) a playable district: a teaser, shown locked. */
export interface MapPlace {
  id: string;
  label: string;
  at: LatLng;
  /** Set once the place becomes a district. */
  districtId?: string;
}

export type MapPoiKind = 'chai' | 'bus' | 'home' | 'uv' | 'skull' | 'rumour';

export interface MapPoi {
  kind: MapPoiKind;
  /** Map node id (district, station or place) it sits beside. */
  node: string;
  showIf?: string;
  hideIf?: string;
}

export interface CityMapData {
  /** Map-px per km at 1× zoom. */
  pxPerKm: number;
  /** North-west and south-east corners of the drawn city. */
  bounds: { north: number; west: number; south: number; east: number };
  regions: MapRegion[];
  paths: MapPath[];
  metro: MetroLine[];
  places: MapPlace[];
  pois: MapPoi[];
}

/**
 * A pocket's real neighbourhood (ADR-117): the streets within `radiusM` come
 * from OpenStreetMap (src/data/map/areas/<districtId>.json), and `pocket`
 * places the playable tilemap on them at true scale, so walking in the game
 * moves your dot along the real street.
 */
export interface RealArea {
  radiusM: number;
  pocket?: PocketPlacement;
}

export interface PocketPlacement {
  /** Real point that tile `anchorTile` stands on. */
  anchor: LatLng;
  /** Tile (x, y) in the district's tilemap, may be fractional. */
  anchorTile: [number, number];
  /** Compass bearing, degrees, of the map's +x (east-in-game) axis. +y is bearing + 90. */
  bearing: number;
  /** Real metres per 32px tile (characters are ~1.5 tiles tall ≈ 1.7 m → ~1.2). */
  metresPerTile: number;
  /** Tilemap size in tiles, for the outline drawn on the map. */
  tiles: [number, number];
  /** Real street names the pocket shows (for the label card). */
  streets?: string[];
}

/** OpenStreetMap extract for a pocket's neighbourhood (scripts/fetch-osm-area.mjs). */
export interface AreaData {
  district: string;
  centre: LatLng;
  radiusM: number;
  roads: Array<{ name: string | null; class: string; points: LatLng[] }>;
  parks: Array<{ name: string | null; outline: LatLng[] }>;
  water: Array<{ name: string | null; outline: LatLng[] }>;
}

// --- Settings menu (ADR-119) ----------------------------------------------
export type SettingsMenuRow =
  | { kind: 'note'; label: string }
  | { kind: 'toggle'; label: string; setting: string }
  | { kind: 'choice'; label: string; setting: string; options: Array<{ value: string; label: string }> }
  | { kind: 'slider'; label: string; setting: string; min: number; max: number; step: number }
  | { kind: 'action'; label: string; action: 'resetSettings' | 'deleteSave' | 'about' };

export interface SettingsMenuSection {
  id: string;
  title: string;
  rows: SettingsMenuRow[];
}

export interface SettingsMenu {
  sections: SettingsMenuSection[];
}

// --- Reels (ADR-122) -------------------------------------------------------
export interface ReelClip {
  id: string;
  /** Who posted it, parody handles only. */
  handle: string;
  title: string;
  caption: string;
  /** Shown once this flag is set; always when absent. */
  after?: string;
  /** A breadcrumb (the fever clip): watching it sets `reels_<id>_seen` and this is a story beat. */
  critical?: boolean;
}

// --- City Moments, Contacts, Notes (ADR-123) -------------------------------
/** A photo worth taking. Taken = flag `photo_<id>`; a whole set done = flag `<set>_photos_done`. */
export interface PhotoDef {
  id: string;
  title: string;
  caption: string;
  /** Collection name ("cubbon"); `null` for one-offs that arrive by story (Ananya's photo of you). */
  set: string | null;
}

/** A contact in the phone: shown once `after` is set (always when absent); `npc` links the relationship state. */
export interface ContactDef {
  id: string;
  name: string;
  npc?: string;
  after?: string;
  /** One line under the name ("Team lead", "Owner Aunty"). */
  note?: string;
  /** A different line once a flag is set — Ananya's after the bandstand (ADR-134). */
  noteIf?: { flag: string; note: string };
}

/** A headline in the News app (story 2.7, ADR-135): delivered once `after` is set; newest first. */
export interface NewsItem {
  id: string;
  date: string;
  source: string;
  headline: string;
  body: string;
  after?: string;
}

/** A note in the Notes app — the wishlist (story 1.6 F4). `price` draws "₹N to go" against the wallet. */
export interface NoteDef {
  id: string;
  text: string;
  after?: string;
  /** The note is gone once this flag is set — the wishlist line once the guitar is bought (ADR-131). */
  until?: string;
  price?: number;
}
