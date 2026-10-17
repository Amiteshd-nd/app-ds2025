import type { RhythmSet } from '../systems/rhythm';
import districtsJson from './districts.json';
import phoneApps from './phone/apps.json';
import settingsMenu from './menus/settings.json';
import reels from './phone/reels.json';
import photos from './phone/photos.json';
import contacts from './phone/contacts.json';
import notes from './phone/notes.json';
import jodi from './phone/jodi.json';
import cityMap from './map/city.json';
import tileIds from '../assets/tilesets/street.tiles.json';
import type {
  AreaData,
  CityMapData,
  DialogueFile,
  DistrictDef,
  ItemDef,
  NpcDef,
  ObjectDef,
  QuestFile,
  ChatThread,
  NegotiationDef,
  PhoneApp,
  SceneComponent,
  SettingsMenu,
  ReelClip,
  PhotoDef,
  ContactDef,
  NoteDef,
} from '../utils/types';

/**
 * Content registry.
 *
 * Dialogue, quests and items are authored as JSON and discovered by glob, so
 * writing content never means editing a scene. Adding a conversation is adding
 * `dialogue/<id>.json` — nothing here changes.
 *
 * TypeScript cannot check the *contents* of a JSON import, so these casts are a
 * promise, not a proof. `scripts/validate-content.ts` is what keeps the promise:
 * it runs before every build and checks the parts the type system cannot —
 * dangling node references, unreachable nodes, unknown item and quest ids,
 * prerequisite cycles.
 */

const load = <T>(modules: Record<string, unknown>): T[] => Object.values(modules) as T[];

const dialogueModules = import.meta.glob('./dialogue/*.json', { eager: true, import: 'default' });
const questModules = import.meta.glob('./quests/*.json', { eager: true, import: 'default' });
const itemModules = import.meta.glob('./items/*.json', { eager: true, import: 'default' });
const npcModules = import.meta.glob('./npcs/*.json', { eager: true, import: 'default' });
const objectModules = import.meta.glob('./objects/*.json', { eager: true, import: 'default' });
const sceneModules = import.meta.glob('./scenes/*.json', { eager: true, import: 'default' });
const negotiationModules = import.meta.glob('./negotiations/*.json', { eager: true, import: 'default' });
const chatModules = import.meta.glob('./phone/chats/*.json', { eager: true, import: 'default' });
const minigameModules = import.meta.glob('./minigames/*.json', { eager: true, import: 'default' });

const byId = <T extends { id: string }>(entries: T[], kind: string): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const entry of entries) {
    if (out[entry.id]) throw new Error(`Duplicate ${kind} id "${entry.id}"`);
    out[entry.id] = entry;
  }
  return out;
};

export const DIALOGUE: Record<string, DialogueFile> = byId(
  load<DialogueFile>(dialogueModules),
  'dialogue',
);

export const QUESTS: Record<string, QuestFile> = byId(load<QuestFile>(questModules), 'quest');

/** Mini-games by id — the guitar's rhythm lessons (story 2.3, ADR-131). */
export const MINIGAMES: Record<string, RhythmSet> = byId(load<RhythmSet>(minigameModules), 'minigame');

// Item files hold arrays, so they are flattened before indexing.
export const ITEMS: Record<string, ItemDef> = byId(
  load<ItemDef[]>(itemModules).flat(),
  'item',
);

// Districts are a flat list — the unit of world expansion.
export const DISTRICTS: Record<string, DistrictDef> = byId(
  districtsJson as DistrictDef[],
  'district',
);

/** NPC definitions, so populating a district is authoring rather than coding. */
export const NPCS: Record<string, NpcDef> = byId(load<NpcDef[]>(npcModules).flat(), 'npc');

/**
 * NPCs placed in one district, in placement order. The district references
 * NPC ids; the definitions live once in npcs/*.json (atomic rule: no inline copies).
 */
export const npcsInDistrict = (districtId: string): NpcDef[] =>
  (DISTRICTS[districtId]?.npcs ?? []).map((ref) => getNpc(ref.id));

/** Quests belonging to one district. */
export const questsInDistrict = (districtId: string): QuestFile[] =>
  Object.values(QUESTS).filter((quest) => quest.district === districtId);

/** Placeable world objects, keyed by id. */
export const OBJECTS: Record<string, ObjectDef> = byId(
  load<ObjectDef[]>(objectModules).flat(),
  'object',
);

/**
 * Scene components (SCENE_TEMPLATE): the story as data, one per scene. The
 * engine does not read these at runtime yet — they are the authored source
 * districts/quests/dialogue are built from, and the validator holds them to
 * the same references. Acts 2–4 ship as stubs (status "STUB").
 */
export const SCENES: Record<string, SceneComponent> = byId(load<SceneComponent>(sceneModules), 'scene');

/** Phone apps in home-screen order (P6). */
/** Reels clips (ADR-122): parody handles, gated by flags, validated. */
export const REELS: ReelClip[] = reels as ReelClip[];

/** City Moments photos (ADR-123): taken = flag `photo_<id>`. */
export const PHOTOS: PhotoDef[] = photos as PhotoDef[];
/** Phone contacts (ADR-123), flag-gated; `npc` links a relationship. */
export const CONTACTS: ContactDef[] = contacts as ContactDef[];
/** Notes app entries (ADR-123) — the wishlist. */
export const NOTES: NoteDef[] = notes as NoteDef[];

/** Settings menu sections (ADR-119): data, validated. */
export const SETTINGS_MENU: SettingsMenu = settingsMenu as SettingsMenu;

export const PHONE_APPS: PhoneApp[] = [...(phoneApps as PhoneApp[])].sort((a, b) => a.order - b.order);

/** Chat threads by id (data/phone/chats). */
export const CHATS: Record<string, ChatThread> = byId(load<ChatThread>(chatModules), 'chat thread');

/** Negotiations (ADR-95): one file per haggle, run by systems/NegotiationManager. */
export const NEGOTIATIONS: Record<string, NegotiationDef> = byId(
  load<NegotiationDef>(negotiationModules),
  'negotiation',
);

/** Tile name -> 0-based frame index in street.png, generated with the art. */
export const STREET_TILE_IDS: Record<string, number> = tileIds.ids;

/** Frame indices for one variant of an object, row-major. */
export const objectFrames = (def: ObjectDef, variant = 'default'): number[] => {
  if (!def.tiles) return [];
  const names = def.tiles[variant];
  if (!names) throw new Error(`Object "${def.id}" has no variant "${variant}"`);
  return names.map((name) => {
    const frame = STREET_TILE_IDS[name];
    if (frame === undefined) throw new Error(`Object "${def.id}" uses unknown tile "${name}"`);
    return frame;
  });
};

/** The node every dialogue tree starts from. */
export const DIALOGUE_ENTRY_NODE = 'start';

/** Lookup that fails loudly — a missing id is a content bug, not a soft state. */
export const getDialogue = (id: string): DialogueFile => {
  const file = DIALOGUE[id];
  if (!file) throw new Error(`Unknown dialogue "${id}" (have: ${Object.keys(DIALOGUE).join(', ')})`);
  return file;
};

export const getQuest = (id: string): QuestFile => {
  const quest = QUESTS[id];
  if (!quest) throw new Error(`Unknown quest "${id}" (have: ${Object.keys(QUESTS).join(', ')})`);
  return quest;
};

export const getItem = (id: string): ItemDef => {
  const item = ITEMS[id];
  if (!item) throw new Error(`Unknown item "${id}" (have: ${Object.keys(ITEMS).join(', ')})`);
  return item;
};

export const getDistrict = (id: string): DistrictDef => {
  const district = DISTRICTS[id];
  if (!district) {
    throw new Error(`Unknown district "${id}" (have: ${Object.keys(DISTRICTS).join(', ')})`);
  }
  return district;
};

export const getObject = (id: string): ObjectDef => {
  const def = OBJECTS[id];
  if (!def) throw new Error(`Unknown object "${id}" (have: ${Object.keys(OBJECTS).join(', ')})`);
  return def;
};

export const getNpc = (id: string): NpcDef => {
  const npc = NPCS[id];
  if (!npc) throw new Error(`Unknown NPC "${id}" (have: ${Object.keys(NPCS).join(', ')})`);
  return npc;
};

/** The city behind the fullscreen map (P6b): regions, roads, metro, teaser places, icons. */
export const CITY_MAP: CityMapData = cityMap as unknown as CityMapData;

const areaModules = import.meta.glob('./map/areas/*.json', { eager: true, import: 'default' }) as Record<string, AreaData>;
/** OpenStreetMap neighbourhoods by district id (ADR-117). */
export const AREAS: Record<string, AreaData> = Object.fromEntries(Object.values(areaModules).map((a) => [a.district, a]));

/** Jodi's profile cards, in order (story 2.6, ADR-134). */
export const JODI_PROFILES = (jodi as { profiles: import('../systems/jodi').JodiProfile[] }).profiles;
