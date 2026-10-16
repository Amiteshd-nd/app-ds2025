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
/** Reach for E-to-interact, in px — 2.25 tiles, enough to talk across a counter. */
export const INTERACT_RANGE_PX = 72;

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

// --- Stats and resources (profile doc §2, ADR-17) --------------------------
export const STARTING_WALLET = 35_000; // ₹
export const STARTING_HEALTH = 100;
export const STARTING_FOOD = 100;
export const STARTING_STRESS = 0;
export const STARTING_BATTERY = 100;
export const STARTING_STAMINA = 3;
export const STAMINA_MAX = 8;
/** Inclusive bounds every adjustable stat is clamped to. */
export const STAT_BOUNDS = {
  health: [0, 100],
  food: [0, 100],
  stress: [0, 100],
  battery: [0, 100],
  stamina: [STARTING_STAMINA, STAMINA_MAX],
} as const;

// --- Time (game_components §11, profile doc §3) ---------------------------
/** Real ms per in-game minute while walking around: an hour passes in 2 real minutes. */
export const GAME_MINUTE_MS = 2000;
export const MINUTES_PER_DAY = 24 * 60;
/** Mornings start here after a sleep. */
export const WAKE_MINUTE = 7 * 60;
/** Sleep: +30 health, food back up to 70 (Acts 1–3 table). */
export const SLEEP_HEALTH = 30;
export const SLEEP_FOOD_RESET = 70;
/** The company pays for this many hotel nights (story 0.2). */
export const HOTEL_NIGHTS = 3;
/** After the company's nights, the receptionist's rate (dlg_hotel_reception). */
export const HOTEL_EXTRA_NIGHT = 1800;

// --- Office (story 1.1 / 1.3; ADR-120) --------------------------------------
/** Divya said 9:30. Clock in later than this on the first day and it is noticed. */
export const OFFICE_START_MINUTE = 9 * 60 + 30;
/** The workday skip lands here, same day. */
export const OFFICE_END_MINUTE = 18 * 60;
/** A workday costs this much food (canteen lunch implied) instead of the awake drain. */
export const WORKDAY_FOOD_COST = 20;
/** First day nerves. */
export const FIRST_DAY_STRESS = 5;
/** Walking in late on day one. */
export const LATE_STRESS = 10;
/** Shanthamma's notice period, in nights (story 1.3). */
export const PG_NOTICE_DAYS = 7;
/** Folding table + chair from the lane shop (story 1.3). */
export const FURNITURE_PRICE = 1800;
/** What the meter would read Whitefield lane → office (story 1.1 autos). */
export const AUTO_METER_FARE = 80;

// --- Hill flat (story 1.4; ADR-122) -----------------------------------------
/** Days from signing the flat to the first salary ping (story 1.4 F3). */
export const SALARY_DAYS = 12;
/** First month in hand, ₹ — a fresher's Bengaluru salary (my call, ADR-122; the user may retune). */
export const SALARY = 42_000;
/** Steel cot with mattress at the hill furniture shop. */
export const COT_PRICE = 4_500;
/** Induction stove at the hill furniture shop. */
export const STOVE_PRICE = 2_200;

// --- Food (profile doc §2, components §7; ADR-97) --------------------------
/**
 * Game minutes per food point while awake. 6 → a full meter lasts ten game
 * hours (~20 real minutes): two or three meals a day, like Stardew. The
 * profile doc's "−1 per game-minute" would empty it in 3 real minutes at
 * ADR-91's clock — see ADR-97.
 */
export const FOOD_MINUTES_PER_POINT = 6;
/** Below this the player is hungry: a toast once, and walking slows. */
export const HUNGRY_AT = 25;
/** Walk/run speed multiplier while hungry ("low food = slower walk"). */
export const HUNGRY_SPEED = 0.8;

// --- Negotiation (ADR-22, ADR-95) ------------------------------------------
/**
 * How each temperament answers each kind of argument: the share of the gap
 * between their price and your offer that they give up, and how much
 * patience the argument costs. `walk` is what happens when you get up to
 * leave. One table, every haggle in the game.
 *
 * - warm (Shanthamma): moved by a real reason, insulted by a lowball, lets you go.
 * - firm (the gate owner, autos later): moves on comparisons, calls you back once.
 * - slick (sales desks): starts high, drops fast, drops to the floor when you leave.
 */
export const TEMPERAMENTS = {
  warm: { give: { reason: 0.6, compare: 0.3, lowball: 0 }, cost: { reason: 1, compare: 1, lowball: 2 }, walk: 'stay' },
  firm: { give: { reason: 0.25, compare: 0.5, lowball: 0.15 }, cost: { reason: 1, compare: 1, lowball: 1 }, walk: 'callback' },
  slick: { give: { reason: 0.15, compare: 0.4, lowball: 0.5 }, cost: { reason: 1, compare: 1, lowball: 1 }, walk: 'drop' },
} as const;
/** Local standing (reputation in the NPC's district) adds this much give per point… */
export const NEGOTIATION_REP_GIVE = 0.015;
/** …up to this cap. */
export const NEGOTIATION_REP_CAP = 0.15;
/** Prices move in steps of ₹100 — nobody says ₹6,437. */
export const NEGOTIATION_STEP = 100;

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
  /** Runs above WorldScene: the closed phone button, and the phone overlay (ADR-114). */
  PHONE: 'PhoneScene',
  /** The fullscreen map (ADR-113): M, the phone's Maps app, Pause → Map. */
  MAP: 'MapScene',
  /** The in-canvas HUD (P6c, ADR-118): plates, prompt bubble, toasts, dialogue box, touch controls. Launched by WorldScene. */
  HUD: 'HudScene',
  /** Pause / Settings / Save / Load / About (P6d, ADR-119). Started by Boot, never stopped; opens over the world or the title. */
  MENU: 'MenuScene',
  /** The workday skyline time-lapse (story 1.1 F4, ADR-121), shown inside the office door's fade. */
  WORKDAY: 'WorkdayScene',
  /** "Rotate your phone" over everything while a touch device is held in portrait (mobile foundation rule 4). */
  ORIENTATION: 'OrientationScene',
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
export const DEFAULT_PLAYER_SHEET = 'player_m_3';

// Save format version, bumped when SaveData changes shape.
// 1.2.0: position is a district id + x/y, not a scene class name; appearance added.
// 1.3.0: player.profile replaces name/background/homeState (P2 character creation).
// 1.4.0: stats are health/wallet/social/stamina/food/stress/battery; `met` ledger added.
// 1.5.0: clock + counters (TimeSystem, behaviours).
// 1.6.0: UPI ledger (transactions), phone delivered/read, real playtime; slots via platform.saves.
export const SAVE_VERSION = '1.6.0';

/**
 * Older formats that can be upgraded forward rather than discarded. Refusing a
 * save is correct when its shape is unknown; throwing away a player's run
 * because a field was added is not.
 */
export const MIGRATABLE_SAVE_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0'] as const;

/** Scene class names that pre-1.2.0 saves recorded, mapped to the district they meant. */
export const LEGACY_SCENE_DISTRICTS: Record<string, string> = {
  AirportScene: 'airport',
  WhitefieldScene: 'whitefield_street',
};
export const SAVE_KEY = 'bangalore-times:save';
/** Save slots (settings_and_saveload §2): one autosave + three manual. */
export const SAVE_SLOTS = ['autosave', 'slot1', 'slot2', 'slot3'] as const;
