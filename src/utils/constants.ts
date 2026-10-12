// Game-wide constants. Ported from the Bangalore Times v1.0 spec (docs/AI_CONTEXT.md,
// TECH_STACK.md) so this package and the reference repo agree on the numbers.

// --- Rendering -------------------------------------------------------------
// 16:9 at a 640×360 native resolution. Scales by whole integers to 720p (2×),
// 1080p (3×) and 1440p (4×), which is what keeps the pixel art crisp.
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;
export const TILE_SIZE = 32; // 20 tiles wide × 11.25 tall visible

// Character sprites are one tile wide and one and a half tall.
export const SPRITE_WIDTH = 32;
export const SPRITE_HEIGHT = 48;

// --- Movement --------------------------------------------------------------
export const PLAYER_SPEED = 120; // pixels/second
export const PLAYER_RUN_SPEED = 190; // pixels/second (SHIFT)

export const CAMERA_DEADZONE_X = 160;
export const CAMERA_DEADZONE_Y = 100;

// --- World -----------------------------------------------------------------
/** Where a new run begins. Every district must be reachable from here. */
export const START_DISTRICT = 'airport';
/** Area-transition fade (design system §7). */
export const FADE_MS = 400;
/** How long a transit card stays up before continuing on its own. */
export const TRANSIT_CARD_MS = 1800;
/** A point zone in Tiled becomes a square this many tiles across. */
export const ZONE_DEFAULT_TILES = 3;
/** Reach for E-to-interact, in px — about 1.75 tiles. */
export const INTERACT_RANGE_PX = 56;

// --- Whitefield sandbox (MVP 1) --------------------------------------------
// Sized in tiles so the world stays on the 32px grid.
export const WORLD_TILES_X = 50;
export const WORLD_TILES_Y = 38;
export const WORLD_WIDTH = WORLD_TILES_X * TILE_SIZE; // 1600
export const WORLD_HEIGHT = WORLD_TILES_Y * TILE_SIZE; // 1216

export const BOT_COUNT = 40;
export const BOT_SPEED_MIN = 30;
export const BOT_SPEED_MAX = 70;
export const BOT_TURN_INTERVAL_MIN = 1000; // ms
export const BOT_TURN_INTERVAL_MAX = 3000; // ms

// --- Stats and resources ---------------------------------------------------
export const MAX_ENERGY = 100;
export const MAX_STRESS = 100;
export const STARTING_MONEY = 5000; // ₹
export const STARTING_ENERGY = 70;
export const STARTING_STRESS = 20;

// --- Skill system ----------------------------------------------------------
export const SKILL_XP_THRESHOLDS = [0, 100, 300, 600, 1000]; // 5 tiers (0-indexed)

export const SKILL_TIER_NAMES = {
  technical: ['Basics', 'Intermediate', 'Proficient', 'Advanced', 'Expert'],
  soft_skills: ['Shy', 'Friendly', 'Charismatic', 'Influential', 'Leader'],
  city_survival: ['Tourist', 'Newcomer', 'Resident', 'Local', 'Namma Bengalurean'],
} as const;

// --- Reputation ------------------------------------------------------------
// The macro loop: an outsider becomes the person people call when nobody else
// can solve it. Reputation is the spine of that arc, so it climbs slower than
// skill XP — a tier should feel earned across several missions, not one.
export const REPUTATION_THRESHOLDS = [0, 50, 150, 400, 800];

export const REPUTATION_TIER_NAMES = [
  'Outsider',
  'Survivor',
  'Trusted Helper',
  'Fixer',
  'Important Player',
] as const;

// --- Quest taxonomy --------------------------------------------------------
// Ten reusable mission archetypes. Content multiplication comes from crossing
// these with districts, NPC archetypes and story contexts — not from writing a
// new system per mission.
export const QUEST_TYPES = [
  'search',
  'investigation',
  'escort',
  'delivery',
  'chase',
  'combat',
  'collection',
  'stealth',
  'rescue',
  'negotiation',
] as const;

// --- NPC tiers -------------------------------------------------------------
// 1 = ambient (atmosphere, no dialogue tree), 2 = interactive (side quests,
// info, trade), 3 = story (main narrative, relationships). Narrative effort
// belongs almost entirely in tier 3.
export const NPC_TIERS = [1, 2, 3] as const;

// --- Scene registry --------------------------------------------------------
// Scenes that exist today are wired up in PhaserGame; the rest are declared so
// transitions can be written against a stable key before the scene lands.
// Places are NOT scenes: every district renders through WORLD (ADR-15).
export const SCENE_KEYS = Object.freeze({
  BOOT: 'BootScene',
  TITLE: 'TitleScene',
  CHARACTER_SELECT: 'CharacterSelectScene',
  WORLD: 'WorldScene',
  TRANSIT: 'TransitScene',
});

// --- Depth layers ----------------------------------------------------------
export const DEPTH = {
  GROUND: 0,
  WALLS: 1,
  OBJECTS: 2,
  ENTITIES: 3,
  ABOVE_PLAYER: 10,
  EFFECTS: 11,
  FOREGROUND: 12,
  UI: 100,
  DIALOGUE: 200,
} as const;

/**
 * Draw depth per Tiled layer name in maps.manifest.json#layerOrder. WorldScene
 * never names a layer itself — it walks layerOrder and looks the depth up here.
 */
export const LAYER_DEPTH: Record<string, number> = {
  Ground: DEPTH.GROUND,
  Walls: DEPTH.WALLS,
  Objects: DEPTH.OBJECTS,
  Collision: DEPTH.OBJECTS, // hidden stencil; depth is irrelevant but must exist
  'Above Player': DEPTH.ABOVE_PLAYER,
  Effects: DEPTH.EFFECTS,
  Foreground: DEPTH.FOREGROUND,
};

// --- Defaults --------------------------------------------------------------
export const DEFAULT_PLAYER_NAME = 'You';
export const DEFAULT_DIRECTION = 'down';
/** Sheet used before character creation has run (= defaultProfile()). */
export const DEFAULT_PLAYER_SHEET = 'player_m_3a';

// Save format version, bumped when SaveData changes shape.
// 1.2.0: position is a district id + x/y, not a scene class name; appearance added.
// 1.3.0: player.profile replaces name/background/homeState (P2 character creation).
export const SAVE_VERSION = '1.3.0';

/**
 * Older formats that can be upgraded forward rather than discarded. Refusing a
 * save is correct when its shape is unknown; throwing away a player's run
 * because a field was added is not.
 */
export const MIGRATABLE_SAVE_VERSIONS = ['1.0.0', '1.1.0', '1.2.0'] as const;

/** Scene class names that pre-1.2.0 saves recorded, mapped to the district they meant. */
export const LEGACY_SCENE_DISTRICTS: Record<string, string> = {
  AirportScene: 'airport',
  WhitefieldScene: 'whitefield_street',
};
export const SAVE_KEY = 'bangalore-times:save';
