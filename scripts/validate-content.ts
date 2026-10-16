/**
 * Validates authored content in src/data/ against the schemas in utils/types.ts
 * and against itself.
 *
 * TypeScript cannot check the contents of a JSON import, so a dialogue tree
 * whose `next` points at a node that no longer exists type-checks perfectly and
 * soft-locks the conversation at runtime. Everything here is the class of bug
 * the compiler cannot see: dangling references, unreachable nodes, unknown item
 * and quest ids, prerequisite cycles, a district whose exit leads nowhere.
 *
 * Node runs this .ts file directly (24+ strips types), so shared lists are
 * imported from src rather than duplicated here.
 *
 * Exit 0 = content is sound. 1 = at least one problem.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPC_TIERS, QUEST_TYPES, SKILL_TIER_NAMES, START_DISTRICT, TEMPERAMENTS } from '../src/utils/constants.ts';
import { BEHAVIOUR_NAMES } from '../src/world/behaviours/names.ts';
import { ICON_NAMES } from '../src/ui/kit/icons.ts';
import { bfs, buildGrid, cellAt, FEET_DY, overlapsZone, rectsFromTmj, zoneOf } from '../src/playground/movie/walkgrid.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../src/data');

const ENTRY_NODE = 'start';
const ITEM_TYPES = ['consumable', 'key_item', 'gift', 'equipment'];
/** Keys a StatEffect may carry (utils/types.ts). `money`/`energy` are the retired names. */
const EFFECT_KEYS = ['health', 'food', 'stress', 'stamina', 'battery', 'wallet', 'xp', 'xp_branch', 'item_add', 'item_remove', 'flags', 'reputation', 'relationship', 'fuel'];
const RELATIONSHIP_STATES = ['met', 'warm', 'strained', 'resolved', 'lost'];
const NPC_TICS = ['cough'];
const TRANSIT_KINDS = ['walk', 'bus', 'metro', 'scooter', 'cab', 'auto'];
const SKILL_BRANCHES = Object.keys(SKILL_TIER_NAMES);
const QUEST_TYPE_LIST: string[] = [...QUEST_TYPES];
const NPC_TIER_LIST: number[] = [...NPC_TIERS];
const TEMPERAMENT_LIST = Object.keys(TEMPERAMENTS);
const TACTICS = ['reason', 'compare', 'lowball'];
const NEGOTIATION_LINES = ['concede', 'hold', 'offended', 'final'];

type Json = Record<string, any>;
type JsonFile = { file: string; basename: string; json: Json };

const readJsonDir = (dir: string): JsonFile[] => {
  const path = join(dataDir, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({
      file: `${dir}/${file}`,
      basename: file.replace(/\.json$/, ''),
      json: JSON.parse(readFileSync(join(path, file), 'utf8')),
    }));
};

export function validateContent(
  dialogueFiles: JsonFile[],
  questFiles: JsonFile[],
  itemFiles: JsonFile[],
  districts: Json[] = [],
  npcFiles: JsonFile[] = [],
  objectFiles: JsonFile[] = [],
  tileIds: Record<string, number> = {},
  sceneFiles: JsonFile[] = [],
  negotiationFiles: JsonFile[] = [],
  phone: { apps?: Json[]; chats?: JsonFile[]; reels?: Json[]; photos?: Json[]; contacts?: Json[]; notes?: Json[] } = {},
  /** Characters the UI bitmap font can draw (src/assets/fonts/metrics.json). Omitted = not checked. */
  glyphs?: Set<string>,
): string[] {
  const problems: string[] = [];
  const add = (file: string, msg: string) => problems.push(`${file}: ${msg}`);
  /** Player-visible text must be drawable by the bitmap font (ADR-114); '?' would show instead. */
  const drawable = (file: string, where: string, text: unknown) => {
    if (!glyphs || typeof text !== 'string') return;
    const missing = [...new Set([...text].filter((ch) => ch !== '\n' && !glyphs.has(ch)))];
    if (missing.length) add(file, `${where}: the UI font cannot draw ${missing.map((c) => `"${c}"`).join(' ')} — rephrase, or add the glyph in scripts/import-font.mjs`);
  };

  // ── Items ────────────────────────────────────────────────────────────────
  const itemIds = new Set<string>();
  for (const { file, json } of itemFiles) {
    if (!Array.isArray(json)) {
      add(file, 'expected an array of items');
      continue;
    }
    for (const item of json) {
      if (!item.id) { add(file, 'an item has no id'); continue; }
      if (itemIds.has(item.id)) add(file, `duplicate item id "${item.id}"`);
      itemIds.add(item.id);

      if (!ITEM_TYPES.includes(item.type)) {
        add(file, `item "${item.id}" has type "${item.type}", expected one of ${ITEM_TYPES.join(', ')}`);
      }
      if (item.max_stack !== undefined && !item.stackable) {
        add(file, `item "${item.id}" sets max_stack but is not stackable`);
      }
      if (item.stackable && item.max_stack === undefined) {
        add(file, `item "${item.id}" is stackable but has no max_stack`);
      }
      if (item.effect) problems.push(...validateEffect(file, `item "${item.id}"`, item.effect, itemIds, true));
    }
  }

  const questIds = new Set(questFiles.map((q) => q.json.id).filter(Boolean));
  const dialogueIds = new Set(dialogueFiles.map((d) => d.json.id).filter(Boolean));

  // ── NPCs ─────────────────────────────────────────────────────────────────
  const npcIds = new Set<string>();
  for (const { file, json } of npcFiles) {
    if (!Array.isArray(json)) { add(file, 'expected an array of NPCs'); continue; }

    for (const npc of json) {
      if (!npc.id) { add(file, 'an NPC has no id'); continue; }
      if (npcIds.has(npc.id)) add(file, `duplicate NPC id "${npc.id}"`);
      npcIds.add(npc.id);

      if (!NPC_TIER_LIST.includes(npc.tier)) {
        add(file, `NPC "${npc.id}" has tier ${npc.tier}, expected one of ${NPC_TIER_LIST.join(', ')}`);
      }
      if (npc.dialogue && !dialogueIds.has(npc.dialogue)) {
        add(file, `NPC "${npc.id}" points at dialogue "${npc.dialogue}", which does not exist`);
      }
      // Tier 1 is atmosphere; tiers 2 and 3 exist to be talked to.
      if (npc.tic !== undefined && !NPC_TICS.includes(npc.tic)) add(file, `NPC "${npc.id}" tic "${npc.tic}" is not one of ${NPC_TICS.join(', ')}`);
      if (npc.breathing !== undefined && typeof npc.breathing !== 'boolean') {
        add(file, `NPC "${npc.id}" breathing must be true or false`);
      }
      if (npc.tier !== 1 && !npc.dialogue) {
        add(file, `NPC "${npc.id}" is tier ${npc.tier} but has no dialogue`);
      }
    }
  }

  // ── Districts ────────────────────────────────────────────────────────────
  // The unit of world expansion. Every reference a district makes — NPC, quest,
  // exit target, behaviour — must resolve, because WorldScene builds the place
  // from this entry and nothing else.
  const districtIds = new Set<string>(districts.map((d) => d.id).filter(Boolean));
  for (const district of districts) {
    const where = 'districts.json';
    if (!district.id) { add(where, 'a district has no id'); continue; }
    const d = `district "${district.id}"`;
    if (districts.filter((other) => other.id === district.id).length > 1) {
      add(where, `duplicate district id "${district.id}"`);
    }
    if (typeof district.name !== 'string' || !district.name) add(where, `${d} has no name`);
    if (typeof district.map !== 'string' || !district.map) add(where, `${d} has no map key`);
    if (typeof district.defaultSpawn !== 'string' || !district.defaultSpawn) {
      add(where, `${d} has no defaultSpawn`);
    }

    const unlock = district.unlock ?? {};
    if (unlock.quest && !questIds.has(unlock.quest)) {
      add(where, `${d} is unlocked by quest "${unlock.quest}", which does not exist`);
    }
    if (unlock.reputation !== undefined && typeof unlock.reputation !== 'number') {
      add(where, `${d} unlock.reputation must be a number`);
    }
    if (unlock.flags !== undefined && !Array.isArray(unlock.flags)) {
      add(where, `${d} unlock.flags must be an array`);
    }

    for (const questId of district.quests ?? []) {
      if (!questIds.has(questId)) add(where, `${d} starts quest "${questId}", which does not exist`);
    }

    // Two NPCs on one spawn point means one of them silently never appears.
    const claimed = new Map<string, string>();
    for (const ref of district.npcs ?? []) {
      if (!ref.id || !ref.spawn) {
        add(where, `${d} has an NPC entry without id or spawn`);
        continue;
      }
      if (!npcIds.has(ref.id)) add(where, `${d} places NPC "${ref.id}", which does not exist`);
      if (ref.unlessFlag !== undefined && (typeof ref.unlessFlag !== 'string' || !ref.unlessFlag)) {
        add(where, `${d} NPC "${ref.id}" unlessFlag must be a flag name`);
      }
      if (ref.requiresFlag !== undefined && (typeof ref.requiresFlag !== 'string' || !ref.requiresFlag)) {
        add(where, `${d} NPC "${ref.id}" requiresFlag must be a flag name`);
      }
      const other = claimed.get(ref.spawn);
      if (other) add(where, `${d}: NPC "${ref.id}" and "${other}" both claim spawn "${ref.spawn}"`);
      else claimed.set(ref.spawn, ref.id);
    }

    for (const ref of district.objects ?? []) {
      if (!ref.id || !ref.at) add(where, `${d} has an object entry without id or at`);
      if (ref.requiresFlag !== undefined && (typeof ref.requiresFlag !== 'string' || !ref.requiresFlag)) add(where, `${d} object "${ref.id}" requiresFlag must be a flag name`);
      if (ref.unlessFlag !== undefined && (typeof ref.unlessFlag !== 'string' || !ref.unlessFlag)) add(where, `${d} object "${ref.id}" unlessFlag must be a flag name`);
      if (ref.requires && !itemIds.has(ref.requires)) {
        add(where, `${d} object "${ref.id}" requires unknown item "${ref.requires}"`);
      }
    }

    if (district.ambient) {
      const { base, count } = district.ambient;
      if (!Array.isArray(base) || base.length === 0) add(where, `${d} ambient.base must list at least one sheet`);
      if (!Number.isInteger(count) || count < 0) add(where, `${d} ambient.count must be a non-negative integer`);
    }

    for (const exit of district.exits ?? []) {
      if (!exit.zone || !exit.to || !exit.spawn) {
        add(where, `${d} has an exit without zone, to or spawn`);
        continue;
      }
      if (!districtIds.has(exit.to)) {
        add(where, `${d} exits to "${exit.to}", which is not a district — a dead end`);
      }
      if (!TRANSIT_KINDS.includes(exit.transit)) {
        add(where, `${d} exit "${exit.zone}" has transit "${exit.transit}", expected one of ${TRANSIT_KINDS.join(', ')}`);
      }
      if (exit.fare !== undefined && (!Number.isInteger(exit.fare) || exit.fare < 0)) {
        add(where, `${d} exit "${exit.zone}" fare must be a non-negative integer`);
      }
      if (exit.minutes !== undefined && (!Number.isInteger(exit.minutes) || exit.minutes < 0 || exit.minutes > 600)) {
        add(where, `${d} exit "${exit.zone}" minutes must be a whole number of game minutes, 0–600`);
      }
      if (exit.requiresFlag !== undefined && (typeof exit.requiresFlag !== 'string' || !exit.requiresFlag)) {
        add(where, `${d} exit "${exit.zone}" requiresFlag must be a flag name`);
      }
      if (exit.lockedText !== undefined && typeof exit.lockedText !== 'string') {
        add(where, `${d} exit "${exit.zone}" lockedText must be a string`);
      } else if (exit.lockedText) {
        drawable(where, `${d} exit "${exit.zone}" lockedText`, exit.lockedText);
      }
    }

    for (const trigger of district.triggers ?? []) {
      if (!trigger.zone) add(where, `${d} has a trigger without a zone`);
      if (trigger.action !== undefined && !['sleep', 'workday'].includes(trigger.action)) add(where, `${d} trigger "${trigger.zone}" has unknown action "${trigger.action}" (sleep | workday)`);
      if (trigger.unlessFlag !== undefined && (typeof trigger.unlessFlag !== 'string' || !trigger.unlessFlag)) {
        add(where, `${d} trigger "${trigger.zone}" unlessFlag must be a flag name`);
      }
      if (trigger.requiresFlag !== undefined && (typeof trigger.requiresFlag !== 'string' || !trigger.requiresFlag)) {
        add(where, `${d} trigger "${trigger.zone}" requiresFlag must be a flag name`);
      }
      if (trigger.setFlags !== undefined && !Array.isArray(trigger.setFlags)) {
        add(where, `${d} trigger "${trigger.zone}" setFlags must be an array`);
      }
    }

    for (const z of district.signalZones ?? []) {
      if (!z.zone || typeof z.zone !== 'string') add(where, `${d} has a signalZone without a zone name`);
      if (!(Number.isInteger(z.bars) && z.bars >= 0 && z.bars <= 4)) add(where, `${d} signalZone "${z.zone}" bars must be 0–4`);
      if (z.flag !== undefined && (typeof z.flag !== 'string' || !z.flag)) add(where, `${d} signalZone "${z.zone}" flag must be a flag name`);
    }
    if (district.signal !== undefined && !(Number.isInteger(district.signal) && district.signal >= 0 && district.signal <= 4)) {
      add(where, `${d} signal must be a whole number of bars, 0–4`);
    }
    if (district.realworld !== undefined) {
      const rw = district.realworld;
      const coords = typeof rw.lat === 'number' && typeof rw.lng === 'number' && Math.abs(rw.lat) <= 90 && Math.abs(rw.lng) <= 180;
      const parent = typeof rw.parent === 'string' && districtIds.has(rw.parent) && rw.parent !== district.id;
      if (!coords && !parent) add(where, `${d} realworld needs lat/lng or a parent district`);
    }

    // Buses on an interval (ADR-123): the boarding exit must gate on the bus's flag.
    const exitByZone = new Map<string, Json>((district.exits ?? []).map((e: Json) => [e.zone, e]));
    for (const bus of district.buses ?? []) {
      const b = `${d} bus "${bus.id ?? '?'}"`;
      for (const k of ['id', 'label', 'zone', 'flag', 'from', 'stop', 'to']) if (typeof bus[k] !== 'string' || !bus[k]) add(where, `${b} needs a string ${k}`);
      if (!(Number.isInteger(bus.every) && bus.every >= 10 && bus.every <= 600)) add(where, `${b} every must be 10–600 seconds`);
      if (!(Number.isInteger(bus.dwell) && bus.dwell >= 3 && bus.dwell < (bus.every ?? 0))) add(where, `${b} dwell must be at least 3 seconds and shorter than every`);
      const exit = exitByZone.get(bus.zone);
      if (!exit) add(where, `${b} zone "${bus.zone}" is not one of the district's exits`);
      else if (exit.requiresFlag !== bus.flag) add(where, `${b}: exit "${bus.zone}" must carry requiresFlag "${bus.flag}" so nobody boards without a bus`);
      if (bus.label) drawable(where, `${b} label`, bus.label);
      if (!(district.behaviours ?? []).includes('busSchedule')) add(where, `${d} lists buses but not the "busSchedule" behaviour`);
    }
    if (district.ride !== undefined) {
      const r = district.ride;
      if (!(Number.isInteger(r.seconds) && r.seconds >= 5 && r.seconds <= 180)) add(where, `${d} ride.seconds must be 5–180`);
      for (const k of ['exit', 'flag', 'label']) if (typeof r[k] !== 'string' || !r[k]) add(where, `${d} ride needs a string ${k}`);
      const exit = exitByZone.get(r.exit);
      if (!exit) add(where, `${d} ride.exit "${r.exit}" is not one of the district's exits`);
      else if (exit.requiresFlag !== r.flag) add(where, `${d} ride: exit "${r.exit}" must carry requiresFlag "${r.flag}" — you cannot leave a moving bus`);
      if (r.label) drawable(where, `${d} ride.label`, r.label);
      if (!(district.behaviours ?? []).includes('busRide')) add(where, `${d} has a ride but not the "busRide" behaviour`);
    }
    const photoIds = new Set((phone.photos ?? []).map((p: Json) => p.id));
    for (const spot of district.photoSpots ?? []) {
      if (!spot.zone || typeof spot.zone !== 'string') add(where, `${d} has a photoSpot without a zone name`);
      if (!spot.photo || (phone.photos && !photoIds.has(spot.photo))) add(where, `${d} photoSpot "${spot.zone}" frames unknown photo "${spot.photo}" (phone/photos.json)`);
    }
    if ((district.photoSpots?.length ?? 0) > 0 && !(district.behaviours ?? []).includes('photoSpots')) add(where, `${d} lists photoSpots but not the "photoSpots" behaviour`);
    if ((district.fuelSpots?.length ?? 0) > 0 && !(district.behaviours ?? []).includes('fuelSpots')) add(where, `${d} lists fuelSpots but not the "fuelSpots" behaviour`);
    if (district.companion !== undefined) {
      const c = district.companion;
      if (!(district.npcs ?? []).some((ref: Json) => ref.id === c.npc)) add(where, `${d} companion "${c.npc}" is not an NPC placed in this district`);
      if (typeof c.whileFlag !== 'string' || !c.whileFlag) add(where, `${d} companion needs a whileFlag`);
      if (c.untilFlag !== undefined && (typeof c.untilFlag !== 'string' || !c.untilFlag)) add(where, `${d} companion untilFlag must be a flag name`);
      if (!(district.behaviours ?? []).includes('companion')) add(where, `${d} has a companion but not the "companion" behaviour`);
    }

    for (const name of district.behaviours ?? []) {
      if (!BEHAVIOUR_NAMES.includes(name)) {
        add(where, `${d} lists behaviour "${name}", which is not registered (${BEHAVIOUR_NAMES.join(', ') || 'none yet'})`);
      }
    }
  }

  // ── Quests ───────────────────────────────────────────────────────────────
  for (const { file, basename, json } of questFiles) {
    if (json.id !== basename) add(file, `id "${json.id}" does not match filename "${basename}"`);

    if (!QUEST_TYPE_LIST.includes(json.type)) {
      add(file, `type "${json.type}" is not one of ${QUEST_TYPE_LIST.join(', ')}`);
    }
    if (districts.length && !districtIds.has(json.district)) {
      add(file, `district "${json.district}" is not in districts.json`);
    }

    const objectiveIds = new Set<string>();
    for (const obj of json.objectives ?? []) {
      if (objectiveIds.has(obj.id)) add(file, `duplicate objective id "${obj.id}"`);
      drawable(file, `objective "${obj.id}"`, obj.text);
      objectiveIds.add(obj.id);
      if (obj.destination !== undefined && districts.length && !districtIds.has(obj.destination)) {
        add(file, `objective "${obj.id}" destination "${obj.destination}" is not a district`);
      }
    }
    if (!json.objectives?.length) add(file, 'has no objectives');

    for (const prereq of json.prerequisite_quests ?? []) {
      if (!questIds.has(prereq)) add(file, `unknown prerequisite quest "${prereq}"`);
    }

    const rewards = json.rewards ?? {};
    if (rewards.reputation !== undefined && typeof rewards.reputation !== 'number') {
      add(file, 'rewards.reputation must be a number');
    }
    if (rewards.money !== undefined) add(file, 'rewards.money is now rewards.wallet');
    if (rewards.xp_branch && !SKILL_BRANCHES.includes(rewards.xp_branch)) {
      add(file, `rewards.xp_branch "${rewards.xp_branch}" is not a skill branch`);
    }
    for (const item of rewards.items ?? []) {
      if (!itemIds.has(item)) add(file, `reward item "${item}" does not exist`);
    }

    const onComplete = json.on_complete ?? {};
    if (onComplete.unlock_scene) {
      add(file, 'on_complete.unlock_scene is gone — places are districts; gate them with unlock.quest or set_flags');
    }
    if (onComplete.set_flags !== undefined && !Array.isArray(onComplete.set_flags)) {
      add(file, 'on_complete.set_flags must be an array of flag names');
    }
    if (onComplete.trigger_dialogue && !dialogueIds.has(onComplete.trigger_dialogue)) {
      add(file, `on_complete.trigger_dialogue "${onComplete.trigger_dialogue}" does not exist`);
    }
  }

  // ── Placeable objects ────────────────────────────────────────────────────
  const objectIds = new Set<string>();
  const knownTiles = Object.keys(tileIds);
  for (const { file, json } of objectFiles) {
    if (!Array.isArray(json)) { add(file, 'expected an array of objects'); continue; }

    for (const obj of json) {
      if (!obj.id) { add(file, 'an object has no id'); continue; }
      if (objectIds.has(obj.id)) add(file, `duplicate object id "${obj.id}"`);
      objectIds.add(obj.id);

      const wide = obj.tilesWide;
      const tall = obj.tilesTall;
      if (!Number.isInteger(wide) || wide < 1) add(file, `object "${obj.id}" has invalid tilesWide`);
      if (!Number.isInteger(tall) || tall < 1) add(file, `object "${obj.id}" has invalid tilesTall`);

      const bg = obj.backgroundTiles;
      if (!Number.isInteger(bg) || bg < 0) {
        add(file, `object "${obj.id}" has invalid backgroundTiles`);
      } else if (Number.isInteger(tall) && bg >= tall && obj.solid) {
        // Every row visual leaves no footprint, so a solid object blocks nothing.
        add(file, `object "${obj.id}" is solid but all ${tall} rows are backgroundTiles — it would block nothing`);
      }

      if (typeof obj.solid !== 'boolean') add(file, `object "${obj.id}" has no boolean solid`);
      if (typeof obj.colorEditable !== 'boolean') {
        add(file, `object "${obj.id}" has no boolean colorEditable`);
      }

      if (obj.sprite !== undefined) {
        if (typeof obj.sprite !== 'string' || !obj.sprite) add(file, `object "${obj.id}" sprite must name a prop (src/assets/props/<name>.png)`);
        else if (!existsSync(join(here, '../src/assets/props', `${obj.sprite}.png`))) add(file, `object "${obj.id}" sprite "${obj.sprite}" has no src/assets/props/${obj.sprite}.png — add it to a prop sheet and run pnpm art`);
        continue; // a sprite object has no tiles
      }
      const variants = obj.tiles ?? {};
      if (!variants.default) add(file, `object "${obj.id}" has no "default" tile variant`);

      for (const [variant, names] of Object.entries(variants)) {
        if (!Array.isArray(names)) {
          add(file, `object "${obj.id}" variant "${variant}" is not an array`);
          continue;
        }
        const expected = (wide ?? 0) * (tall ?? 0);
        if (names.length !== expected) {
          add(file, `object "${obj.id}" variant "${variant}" lists ${names.length} tiles but declares ${wide}x${tall} = ${expected}`);
        }
        if (knownTiles.length) {
          for (const name of names as string[]) {
            if (!(name in tileIds)) {
              add(file, `object "${obj.id}" variant "${variant}" uses unknown tile "${name}"`);
            }
          }
        }
      }
    }
  }

  // District-placed objects can only be checked once object ids are known.
  if (objectFiles.length) {
    for (const district of districts) {
      for (const ref of district.objects ?? []) {
        if (ref.id && !objectIds.has(ref.id)) {
          add('districts.json', `district "${district.id}" places object "${ref.id}", which has no manifest`);
        }
      }
    }
  }

  // ── Scene components (SCENE_TEMPLATE §B) ─────────────────────────────────
  // A worked scene must resolve every reference; a STUB only needs an id,
  // district, act and title — its TODOs are the point.
  const PACING = ['Calm', 'Curious', 'Engaged', 'Tense', 'Reward'];
  const seqSeen = new Map<string, string>();
  for (const { file, basename, json } of sceneFiles) {
    if (json.id !== basename) add(file, `id "${json.id}" does not match filename "${basename}"`);
    const stub = json.status === 'STUB';
    if (!Number.isInteger(json.act) || json.act < 0 || json.act > 4) add(file, `act must be 0–4, got ${json.act}`);
    if (!json.title) add(file, 'has no title');
    if (!stub && districts.length && !districtIds.has(json.district)) {
      add(file, `district "${json.district}" is not in districts.json`);
    }
    if (stub) continue;

    if (!json.player_goal) add(file, 'has no player_goal');
    if (!json.design_goal) add(file, 'has no design_goal');
    for (const tag of json.pacing ?? []) {
      if (!PACING.includes(tag)) add(file, `pacing tag "${tag}" is not one of ${PACING.join(', ')}`);
    }
    for (const q of json.quests ?? []) if (!questIds.has(q)) add(file, `quest "${q}" does not exist`);
    const district = districts.find((d) => d.id === json.district);
    const placed = new Set((district?.npcs ?? []).map((n: Json) => n.id));
    for (const member of json.cast ?? []) {
      if (!member.npc) { add(file, 'a cast entry has no npc'); continue; }
      if (!npcIds.has(member.npc)) add(file, `cast member "${member.npc}" is not an NPC`);
      else if (district && !placed.has(member.npc)) {
        add(file, `cast member "${member.npc}" is not placed in district "${json.district}" — add it to districts.json npcs`);
      }
    }
    for (const beat of json.beats ?? []) {
      if (typeof beat !== 'object') continue;
      if (!beat.id || !beat.what) add(file, `beat ${beat.id ?? '?'} needs id and what`);
      if (beat.pacing && !PACING.includes(beat.pacing)) add(file, `beat ${beat.id} pacing "${beat.pacing}" is not one of ${PACING.join(', ')}`);
    }
    // Two Tense beats in a row without a Calm is the fatigue ADR-24 forbids.
    const pacingSeq = (json.beats ?? []).map((b: Json) => (typeof b === 'object' ? b.pacing : undefined)).filter(Boolean);
    for (let i = 1; i < pacingSeq.length; i++) {
      if (pacingSeq[i] === 'Tense' && pacingSeq[i - 1] === 'Tense') add(file, `beats run Tense → Tense without a Calm between (ADR-24)`);
    }
    for (const exit of json.exits ?? []) {
      if (typeof exit === 'object' && exit.to && !districtIds.has(exit.to)) add(file, `exit to "${exit.to}" is not a district`);
    }
    if (!json.acceptance?.length) add(file, 'has no acceptance list — the audit gate needs one');
    if (json.entry?.after !== undefined) {
      const beatIds = new Set(((json.beats ?? []) as Json[]).filter((b) => typeof b === 'object').map((b) => b.id));
      if (!Array.isArray(json.entry.after)) add(file, 'entry.after must be an array of beat ids');
      else for (const id of json.entry.after) if (!beatIds.has(id)) add(file, `entry.after names beat "${id}", which the scene does not have`);
    }
    if (json.seq !== undefined) {
      if (typeof json.seq !== 'string' || !/^\d+\.\d+[a-z]?$/.test(json.seq)) add(file, `seq "${json.seq}" must look like "0.2" (act.scene) or "2.2b" (a beat's second half)`);
      else if (seqSeen.has(json.seq)) add(file, `seq "${json.seq}" is also used by ${seqSeen.get(json.seq)} — story order must be unique`);
      else seqSeen.set(json.seq, file);
    }
  }

  problems.push(...detectPrerequisiteCycles(questFiles));

  // ── Negotiations (ADR-95) ────────────────────────────────────────────────
  const negotiationIds = new Set<string>();
  for (const { file, basename, json } of negotiationFiles) {
    const n = json;
    if (n.id !== basename) add(file, `id "${n.id}" does not match filename "${basename}"`);
    negotiationIds.add(n.id);
    if (!npcIds.has(n.npc)) add(file, `npc "${n.npc}" does not exist`);
    if (!TEMPERAMENT_LIST.includes(n.temperament)) {
      add(file, `temperament "${n.temperament}" is not one of ${TEMPERAMENT_LIST.join(', ')}`);
    }
    if (!Number.isInteger(n.patience) || n.patience < 1) add(file, 'patience must be a positive integer');
    const termIds = new Set<string>();
    if (!Array.isArray(n.terms) || n.terms.length === 0) add(file, 'needs at least one term');
    for (const t of n.terms ?? []) {
      if (!t.id || !t.label) add(file, 'every term needs id and label');
      if (termIds.has(t.id)) add(file, `duplicate term "${t.id}"`);
      termIds.add(t.id);
      if (!Number.isInteger(t.ask) || !Number.isInteger(t.floor) || t.ask <= 0 || t.floor < 0 || t.floor > t.ask) {
        add(file, `term "${t.id}" needs integers ask > 0 and 0 ≤ floor ≤ ask (a fee can be waived)`);
      }
    }
    const counterIds = new Set<string>();
    for (const c of n.counters ?? []) {
      if (!c.id || !c.text) add(file, 'every counter needs id and text');
      if (counterIds.has(c.id)) add(file, `duplicate counter "${c.id}"`);
      counterIds.add(c.id);
      if (!termIds.has(c.term)) add(file, `counter "${c.id}" argues about unknown term "${c.term}"`);
      if (!TACTICS.includes(c.tactic)) add(file, `counter "${c.id}" tactic "${c.tactic}" is not one of ${TACTICS.join(', ')}`);
      if (!Number.isInteger(c.offer) || c.offer < 0) add(file, `counter "${c.id}" offer must be a non-negative integer`);
    }
    for (const key of NEGOTIATION_LINES) {
      if (typeof n.lines?.[key] !== 'string' || !n.lines[key]) add(file, `lines.${key} is required`);
    }
    if (TEMPERAMENTS[n.temperament as keyof typeof TEMPERAMENTS]?.walk !== 'stay' && !n.lines?.callback) {
      add(file, `a ${n.temperament} NPC calls the player back on walk — lines.callback is required`);
    }
    for (const termId of Object.values(n.on_deal?.counters ?? {})) {
      if (!termIds.has(termId as string)) add(file, `on_deal.counters names unknown term "${termId}"`);
    }
    if (n.on_deal?.flags !== undefined && !Array.isArray(n.on_deal.flags)) add(file, 'on_deal.flags must be an array');
  }

  // ── Phone (P6) ───────────────────────────────────────────────────────────
  const appIds = new Set<string>();
  for (const app of phone.apps ?? []) {
    if (!app.id || !app.name || !Number.isInteger(app.order)) add('phone/apps.json', `every app needs id, name and an integer order`);
    if (appIds.has(app.id)) add('phone/apps.json', `duplicate app "${app.id}"`);
    appIds.add(app.id);
    if (app.unlock !== undefined && (typeof app.unlock !== 'string' || !app.unlock)) add('phone/apps.json', `app "${app.id}" unlock must be a flag name`);
    if (!ICON_NAMES.includes(app.icon)) add('phone/apps.json', `app "${app.id}" icon "${app.icon}" is not in src/ui/kit/icons.ts (${ICON_NAMES.join(', ')})`);
    if (app.dock !== undefined && typeof app.dock !== 'boolean') add('phone/apps.json', `app "${app.id}" dock must be true or false`);
    drawable('phone/apps.json', `app "${app.id}" name`, app.name);
    drawable('phone/apps.json', `app "${app.id}" hint`, app.hint);
  }
  // Home screen: 4 dock slots, a 4×3 grid (ADR-114).
  const docked = (phone.apps ?? []).filter((a) => a.dock).length;
  if (docked > 4) add('phone/apps.json', `${docked} apps in the dock — it holds 4`);
  if ((phone.apps ?? []).length - docked > 12) add('phone/apps.json', `${(phone.apps ?? []).length - docked} apps in the grid — it holds 12 (4×3)`);
  const messageIds = new Set<string>();
  for (const { file, basename, json } of phone.chats ?? []) {
    if (json.id !== basename) add(file, `id "${json.id}" does not match filename "${basename}"`);
    if (!json.contact) add(file, 'needs a contact name');
    if (!Array.isArray(json.messages) || !json.messages.length) add(file, 'needs at least one message');
    for (const m of json.messages ?? []) {
      if (!m.id || !m.text) add(file, 'every message needs id and text');
      drawable(file, `message "${m.id}"`, m.text);
      if (messageIds.has(m.id)) add(file, `message id "${m.id}" is used twice — ids are global (they are saved)`);
      messageIds.add(m.id);
      if (m.from !== 'them' && m.from !== 'me') add(file, `message "${m.id}" from must be "them" or "me"`);
      if (m.after !== undefined && (typeof m.after !== 'string' || !m.after)) add(file, `message "${m.id}" after must be a flag name`);
      if (m.upi !== undefined && (!Number.isInteger(m.upi) || m.upi <= 0 || m.from !== 'them')) add(file, `message "${m.id}" upi must be a positive integer on a message from them`);
    }
  }

  // ── City Moments, Contacts, Notes (ADR-123) ──────────────────────────────
  const seenPhotos = new Set<string>();
  for (const photo of phone.photos ?? []) {
    const pw = `photo "${photo.id ?? '?'}"`;
    if (!photo.id) { add('phone/photos.json', 'a photo has no id'); continue; }
    if (seenPhotos.has(photo.id)) add('phone/photos.json', `${pw} is listed twice`);
    seenPhotos.add(photo.id);
    for (const k of ['title', 'caption']) {
      if (typeof photo[k] !== 'string' || !photo[k]) add('phone/photos.json', `${pw} needs a ${k}`);
      else drawable('phone/photos.json', `${pw} ${k}`, photo[k]);
    }
    if (photo.set !== null && (typeof photo.set !== 'string' || !photo.set)) add('phone/photos.json', `${pw} set must be a name or null`);
  }
  const seenContacts = new Set<string>();
  for (const c of phone.contacts ?? []) {
    const cw = `contact "${c.id ?? '?'}"`;
    if (!c.id || !c.name) { add('phone/contacts.json', 'every contact needs id and name'); continue; }
    if (seenContacts.has(c.id)) add('phone/contacts.json', `${cw} is listed twice`);
    seenContacts.add(c.id);
    drawable('phone/contacts.json', `${cw} name`, c.name);
    drawable('phone/contacts.json', `${cw} note`, c.note);
    if (c.npc !== undefined && !npcIds.has(c.npc)) add('phone/contacts.json', `${cw} links unknown NPC "${c.npc}"`);
    if (c.after !== undefined && (typeof c.after !== 'string' || !c.after)) add('phone/contacts.json', `${cw} after must be a flag name`);
  }
  const seenNotes = new Set<string>();
  for (const n of phone.notes ?? []) {
    const nw = `note "${n.id ?? '?'}"`;
    if (!n.id || typeof n.text !== 'string' || !n.text) { add('phone/notes.json', 'every note needs id and text'); continue; }
    if (seenNotes.has(n.id)) add('phone/notes.json', `${nw} is listed twice`);
    seenNotes.add(n.id);
    drawable('phone/notes.json', `${nw} text`, n.text);
    if (n.price !== undefined && (!Number.isInteger(n.price) || n.price <= 0)) add('phone/notes.json', `${nw} price must be a positive integer`);
    if (n.after !== undefined && (typeof n.after !== 'string' || !n.after)) add('phone/notes.json', `${nw} after must be a flag name`);
  }

  // ── Reels (ADR-122) ──────────────────────────────────────────────────────
  const reelIds = new Set<string>();
  for (const clip of phone.reels ?? []) {
    const rw = `reel "${clip.id}"`;
    if (!clip.id) { add('phone/reels.json', 'a clip has no id'); continue; }
    if (reelIds.has(clip.id)) add('phone/reels.json', `${rw} is listed twice`);
    reelIds.add(clip.id);
    for (const k of ['handle', 'title', 'caption'] as const) {
      if (typeof clip[k] !== 'string' || !clip[k]) add('phone/reels.json', `${rw} needs a ${k}`);
      else drawable('phone/reels.json', `${rw} ${k}`, clip[k]);
    }
    if (typeof clip.handle === 'string' && !clip.handle.startsWith('@')) add('phone/reels.json', `${rw} handle should start with @`);
    if (clip.after !== undefined && (typeof clip.after !== 'string' || !clip.after)) add('phone/reels.json', `${rw} after must be a flag name`);
  }

  // ── Dialogue ─────────────────────────────────────────────────────────────
  for (const { file, basename, json } of dialogueFiles) {
    if (json.id !== basename) add(file, `id "${json.id}" does not match filename "${basename}"`);

    const nodes: Record<string, Json> = json.nodes ?? {};
    const nodeIds = Object.keys(nodes);

    if (!nodeIds.includes(ENTRY_NODE)) {
      add(file, `has no "${ENTRY_NODE}" node — every tree needs an entry point`);
      continue;
    }

    for (const [nodeId, node] of Object.entries(nodes)) {
      if (!node.text) add(file, `node "${nodeId}" has no text`);
      drawable(file, `node "${nodeId}"`, node.text);

      if (node.next && !nodes[node.next]) {
        add(file, `node "${nodeId}" advances to "${node.next}", which does not exist — this soft-locks the conversation`);
      }
      if (node.next && node.choices?.length) {
        add(file, `node "${nodeId}" has both choices and next; next would be unreachable`);
      }
      if (node.negotiate) {
        const neg = node.negotiate;
        if (!negotiationIds.has(neg.id)) add(file, `node "${nodeId}" negotiates "${neg.id}", which does not exist`);
        for (const key of ['deal', 'walk']) {
          if (!neg[key] || !nodes[neg[key]]) add(file, `node "${nodeId}" negotiate.${key} "${neg[key]}" is not a node — this soft-locks the conversation`);
        }
        if (node.next || node.choices?.length) add(file, `node "${nodeId}" negotiates — it cannot also have next or choices`);
      }

      node.choices?.forEach((choice: Json, i: number) => {
        if (!choice.text) add(file, `node "${nodeId}" choice ${i} has no text`);
        drawable(file, `node "${nodeId}" choice ${i}`, choice.text);
        if (!choice.next) {
          add(file, `node "${nodeId}" choice ${i} has no next`);
        } else if (!nodes[choice.next]) {
          add(file, `node "${nodeId}" choice ${i} points at "${choice.next}", which does not exist — this soft-locks the conversation`);
        }
        if (choice.requires) problems.push(...validateRequirement(file, `node "${nodeId}" choice ${i}`, choice.requires));
        if (choice.effect) problems.push(...validateEffect(file, `node "${nodeId}" choice ${i}`, choice.effect, itemIds, false));
        if (choice.quest_trigger && !questIds.has(choice.quest_trigger)) {
          add(file, `node "${nodeId}" choice ${i} triggers unknown quest "${choice.quest_trigger}"`);
        }
      });

      if (node.requires) problems.push(...validateRequirement(file, `node "${nodeId}"`, node.requires));
      if (node.effect) problems.push(...validateEffect(file, `node "${nodeId}"`, node.effect, itemIds, false));
      if (node.quest_trigger && !questIds.has(node.quest_trigger)) {
        add(file, `node "${nodeId}" triggers unknown quest "${node.quest_trigger}"`);
      }
    }

    // Entry branches (ADR-96): NPCs that remember open on another node.
    const entries = [ENTRY_NODE];
    if (json.enter !== undefined && !Array.isArray(json.enter)) add(file, 'enter must be an array');
    for (const branch of Array.isArray(json.enter) ? json.enter : []) {
      if (typeof branch.flag !== 'string' || !branch.flag) add(file, 'every enter branch needs a flag');
      if (!nodes[branch.node]) add(file, `enter branch on "${branch.flag}" opens at "${branch.node}", which does not exist`);
      else entries.push(branch.node);
    }

    // Unreachable nodes are dead content — usually a rename that missed a link.
    const reachable = new Set<string>(entries);
    const queue = [...entries];
    while (queue.length) {
      const current = nodes[queue.shift()!];
      if (!current) continue;
      const targets = [
        current.next,
        ...(current.choices ?? []).map((c: Json) => c.next),
        current.negotiate?.deal,
        current.negotiate?.walk,
      ];
      for (const target of targets) {
        if (target && nodes[target] && !reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
    for (const nodeId of nodeIds) {
      if (!reachable.has(nodeId)) add(file, `node "${nodeId}" is unreachable from "${ENTRY_NODE}"`);
    }
  }

  return problems;
}

// ── World: districts × maps ──────────────────────────────────────────────
export interface WorldInputs {
  /** maps.manifest.json */
  manifest: { maps: Record<string, Json>; layerOrder?: string[] };
  /** Parsed .tmj per manifest key. */
  maps: Record<string, Json>;
  /** Sprite-sheet basenames on disk (src/assets/sprites/*.png). */
  sprites: string[];
  /** Where a run starts; every district must be reachable from it. */
  startDistrict?: string;
}

export interface WorldReport {
  problems: string[];
  warnings: string[];
}

/** ADR-40: at least one interactable per ~10×10-tile screen, or the world feels empty. */
const SCREEN_TILES = 100;

const objectNames = (tmj: Json | undefined, layerName: string | undefined): Set<string> => {
  const layer = (tmj?.layers ?? []).find((l: Json) => l.name === layerName);
  return new Set(((layer?.objects ?? []) as Json[]).map((o) => o.name).filter(Boolean));
};

/**
 * Cross-check every reference a district makes into its map — and every exit
 * into its destination's map — plus the two world-level rules that no single
 * file can express: every district is reachable from the start, and no
 * district is an empty screen.
 *
 * This is the "dead-end class of bug" check from technical architecture §3:
 * a spawn that was renamed in Tiled, an exit whose landing spawn is missing,
 * a district nobody can walk to — all silent at runtime, all build errors here.
 */
/**
 * The city behind the fullscreen map (P6b, ADR-115): everything inside the
 * drawn bounds, ids unique, every reference resolves, every journey the
 * player can make (an exit between two outdoor pockets) has a drawn path.
 */
/**
 * Settings menu (ADR-119): every row edits a real atom of settings.defaults.json
 * with a matching kind; every choice covers the default; every label is drawable.
 */
export function validateSettingsMenu(menu: Json, defaults: Json, glyphs?: Set<string>): string[] {
  const problems: string[] = [];
  const file = 'menus/settings.json';
  const add = (msg: string) => problems.push(`${file}: ${msg}`);
  const drawable = (where: string, text: unknown) => {
    if (!glyphs || typeof text !== 'string') return;
    const missing = [...new Set([...text].filter((ch) => !glyphs.has(ch) && ch !== '\n'))];
    if (missing.length) add(`${where} cannot draw ${missing.map((m) => `"${m}"`).join(', ')} in the UI font`);
  };
  if (!Array.isArray(menu?.sections) || !menu.sections.length) { add('needs a non-empty "sections" array'); return problems; }
  const ids = new Set<string>();
  for (const section of menu.sections as Json[]) {
    const where = `section "${section.id}"`;
    if (!section.id || typeof section.id !== 'string') add('a section is missing its id');
    if (ids.has(section.id)) add(`${where} is listed twice`);
    ids.add(section.id);
    if (typeof section.title !== 'string' || !section.title) add(`${where} needs a title`);
    else drawable(`${where} title`, section.title);
    if (!Array.isArray(section.rows) || !section.rows.length) { add(`${where} has no rows`); continue; }
    for (const [i, row] of (section.rows as Json[]).entries()) {
      const rw = `${where} row ${i}`;
      if (typeof row.label !== 'string' || !row.label) add(`${rw} needs a label`);
      else drawable(`${rw} label`, row.label);
      if (row.kind === 'note') continue;
      if (row.kind === 'action') {
        if (!['resetSettings', 'deleteSave', 'about'].includes(row.action)) add(`${rw} has unknown action "${row.action}"`);
        continue;
      }
      if (!['toggle', 'choice', 'slider'].includes(row.kind)) { add(`${rw} has unknown kind "${row.kind}"`); continue; }
      const [sec, key, extra] = String(row.setting ?? '').split('.');
      const atom = sec && key && !extra ? (defaults as Record<string, Record<string, unknown>>)[sec]?.[key] : undefined;
      if (atom === undefined) { add(`${rw} edits "${row.setting}", which is not in settings.defaults.json`); continue; }
      if (row.kind === 'toggle' && typeof atom !== 'boolean') add(`${rw} is a toggle but "${row.setting}" is a ${typeof atom}`);
      if (row.kind === 'slider') {
        if (typeof atom !== 'number') add(`${rw} is a slider but "${row.setting}" is a ${typeof atom}`);
        if (![row.min, row.max, row.step].every((n) => Number.isFinite(n)) || row.min >= row.max || row.step <= 0) add(`${rw} needs numeric min < max and a positive step`);
      }
      if (row.kind === 'choice') {
        if (!Array.isArray(row.options) || !row.options.length) { add(`${rw} needs options`); continue; }
        const values = (row.options as Json[]).map((o) => String(o.value));
        if (!values.includes(String(atom))) add(`${rw} options do not include the default "${String(atom)}"`);
        for (const o of row.options as Json[]) { if (typeof o.label !== 'string') add(`${rw} option "${o.value}" needs a label`); else drawable(`${rw} option "${o.value}"`, o.label); }
      }
    }
  }
  return problems;
}

export function validateCityMap(city: Json, districts: Json[], colourTokens: Set<string>): string[] {
  const problems: string[] = [];
  const add = (msg: string) => problems.push(`map/city.json: ${msg}`);
  const b = city.bounds ?? {};
  const inBounds = (p: unknown) => Array.isArray(p) && p.length === 2 && p[0] <= b.north && p[0] >= b.south && p[1] >= b.west && p[1] <= b.east;
  if (!(city.pxPerKm > 0)) add('pxPerKm must be a positive number');
  if (!(b.north > b.south && b.east > b.west)) add('bounds must have north > south and east > west');

  const KINDS = ['park', 'lake', 'commercial', 'it', 'residential', 'hill'];
  const ids = new Set<string>();
  const unique = (id: string, what: string) => { if (ids.has(id)) add(`${what} id "${id}" is used twice`); ids.add(id); };
  for (const r of city.regions ?? []) {
    unique(r.id, 'region');
    if (!KINDS.includes(r.kind)) add(`region "${r.id}" kind "${r.kind}" is not one of ${KINDS.join(', ')}`);
    if (!Array.isArray(r.outline) || r.outline.length < 3) add(`region "${r.id}" needs an outline of 3+ points`);
    else if (!r.outline.every(inBounds)) add(`region "${r.id}" leaves the map bounds`);
  }

  // Nodes: districts with coordinates, metro stations, teaser places.
  const byId: Record<string, Json> = Object.fromEntries(districts.map((d) => [d.id, d]));
  const anchor = (id: string): Json | undefined => {
    let d = byId[id];
    for (let i = 0; d?.realworld?.parent && i < 5; i++) d = byId[d.realworld.parent];
    return d?.realworld && 'lat' in d.realworld ? d : undefined;
  };
  const nodes = new Set<string>(districts.filter((d) => d.realworld && 'lat' in d.realworld).map((d) => d.id));
  for (const d of districts) if (d.realworld && 'lat' in d.realworld && !inBounds([d.realworld.lat, d.realworld.lng])) add(`district "${d.id}" sits outside the map bounds`);
  const stationAt: Record<string, string> = {};
  for (const line of city.metro ?? []) {
    unique(line.id, 'metro line');
    if (!colourTokens.has(line.colour)) add(`metro line "${line.id}" colour "${line.colour}" is not a colour token`);
    if (!Array.isArray(line.stations) || line.stations.length < 2) add(`metro line "${line.id}" needs 2+ stations`);
    for (const st of line.stations ?? []) {
      if (!inBounds(st.at)) add(`station "${st.id}" sits outside the map bounds`);
      const key = JSON.stringify(st.at);
      if (stationAt[st.id] && stationAt[st.id] !== key) add(`station "${st.id}" appears on two lines at different places — an interchange shares one position`);
      stationAt[st.id] = key;
      nodes.add(st.id);
    }
  }
  for (const p of city.places ?? []) {
    unique(p.id, 'place');
    if (!inBounds(p.at)) add(`place "${p.id}" sits outside the map bounds`);
    if (p.districtId !== undefined && !byId[p.districtId]) add(`place "${p.id}" districtId "${p.districtId}" is not a district`);
    nodes.add(p.id);
  }
  for (const d of districts) {
    if (d.metroStation !== undefined && !stationAt[d.metroStation]) add(`district "${d.id}" metroStation "${d.metroStation}" is not a station`);
  }

  for (const path of city.paths ?? []) {
    unique(path.id, 'path');
    if (!['road', 'walk'].includes(path.kind)) add(`path "${path.id}" kind must be road or walk`);
    if (!Array.isArray(path.points) || path.points.length < 2) add(`path "${path.id}" needs 2+ points`);
    else if (!path.points.every(inBounds)) add(`path "${path.id}" leaves the map bounds`);
    for (const n of path.connects ?? []) if (!nodes.has(n)) add(`path "${path.id}" connects unknown node "${n}"`);
  }
  // Every journey between two outdoor pockets is drawn.
  for (const d of districts) {
    const from = anchor(d.id);
    for (const exit of d.exits ?? []) {
      const to = anchor(exit.to);
      if (!from || !to || from.id === to.id) continue;
      const drawn = (city.paths ?? []).some((p: Json) => p.connects?.includes(from.id) && p.connects?.includes(to.id));
      if (!drawn) add(`the journey ${from.id} → ${to.id} (exit "${exit.zone}" of ${d.id}) has no path with connects [${from.id}, ${to.id}]`);
    }
  }

  const POI = ['chai', 'bus', 'home', 'uv', 'skull', 'rumour'];
  for (const poi of city.pois ?? []) {
    if (!POI.includes(poi.kind)) add(`poi kind "${poi.kind}" is not one of ${POI.join(', ')}`);
    if (!nodes.has(poi.node)) add(`poi "${poi.kind}" sits beside unknown node "${poi.node}"`);
  }
  return problems;
}

/**
 * Real neighbourhoods (ADR-117): a district with `realworld.area` has its
 * OpenStreetMap extract, credited; its pocket sits inside the area and is as
 * big as its tilemap (so the map stays proportional).
 */
export function validateAreas(districts: Json[], areas: Record<string, Json>, mapSizes: Record<string, [number, number]>): string[] {
  const problems: string[] = [];
  const M_LAT = 110_574;
  for (const d of districts) {
    const area = d.realworld?.area;
    if (!area) continue;
    const where = `districts.json: ${d.id}`;
    const data = areas[d.id];
    if (!data) { problems.push(`${where} has realworld.area but no src/data/map/areas/${d.id}.json — run node scripts/fetch-osm-area.mjs ${d.id}`); continue; }
    if (!/OpenStreetMap/.test(data.$comment ?? '') || !/ODbL/.test(data.$comment ?? '')) problems.push(`map/areas/${d.id}.json: must carry the OpenStreetMap / ODbL credit in $comment`);
    if (!(data.roads?.length > 0)) problems.push(`map/areas/${d.id}.json: no streets`);
    const p = area.pocket;
    if (!p) continue;
    const [lat, lng] = p.anchor ?? [];
    const dist = Math.hypot((lat - d.realworld.lat) * M_LAT, (lng - d.realworld.lng) * M_LAT * Math.cos((lat * Math.PI) / 180));
    if (!(dist < area.radiusM * 0.8)) problems.push(`${where} pocket anchor is ${Math.round(dist)} m from the area centre — keep it well inside radiusM ${area.radiusM}`);
    if (!(p.metresPerTile > 0.5 && p.metresPerTile < 3)) problems.push(`${where} pocket metresPerTile ${p.metresPerTile} is not character scale (0.5–3 m)`);
    const size = mapSizes[d.map];
    if (size && (p.tiles?.[0] !== size[0] || p.tiles?.[1] !== size[1])) problems.push(`${where} pocket tiles [${p.tiles}] do not match its tilemap ${size[0]}×${size[1]} — the map would not be proportional`);
  }
  return problems;
}

export function validateWorld(districts: Json[], world: WorldInputs): WorldReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  const where = 'districts.json';
  const add = (msg: string) => problems.push(`${where}: ${msg}`);
  const warn = (msg: string) => warnings.push(`${where}: ${msg}`);

  const byId = new Map<string, Json>(districts.filter((d) => d.id).map((d) => [d.id, d]));
  const sprites = new Set(world.sprites);

  for (const district of districts) {
    if (!district.id) continue;
    const d = `district "${district.id}"`;
    const def = world.manifest.maps[district.map];
    if (!def) {
      add(`${d} names map "${district.map}", which is not in maps.manifest.json (have: ${Object.keys(world.manifest.maps).join(', ')})`);
      continue;
    }
    const tmj = world.maps[district.map];
    if (!tmj) {
      add(`${d} map "${district.map}" could not be read`);
      continue;
    }
    const spawns = objectNames(tmj, def.spawnLayer);
    const pulse = objectNames(tmj, def.pulseLayer);
    const spawnList = () => [...spawns].join(', ') || 'none';

    const need = (name: string | undefined, what: string) => {
      if (name && !spawns.has(name)) {
        add(`${d} ${what} "${name}" is not an object in "${def.spawnLayer}" of ${def.file} (has: ${spawnList()})`);
      }
    };

    need(district.defaultSpawn, 'defaultSpawn');
    for (const ref of district.npcs ?? []) need(ref.spawn, `NPC "${ref.id}" spawn`);
    for (const ref of district.objects ?? []) need(ref.at, `object "${ref.id}" spawn`);
    for (const trigger of district.triggers ?? []) need(trigger.zone, 'trigger zone');
    for (const bus of district.buses ?? []) for (const k of ['from', 'stop', 'to'] as const) need(bus[k], `bus "${bus.id}" ${k} spawn`);
    for (const spot of district.photoSpots ?? []) need(spot.zone, `photoSpot "${spot.photo}" zone`);
    for (const z of district.fuelSpots ?? []) need(z, 'fuel zone');
    for (const z of district.signalZones ?? []) need(z.zone, 'signal zone');

    for (const exit of district.exits ?? []) {
      need(exit.zone, 'exit zone');
      const target = byId.get(exit.to);
      if (!target) continue; // validateContent already reports the dead end
      const targetDef = world.manifest.maps[target.map];
      const landing = objectNames(world.maps[target.map], targetDef?.spawnLayer);
      if (exit.spawn && !landing.has(exit.spawn)) {
        add(`${d} exit "${exit.zone}" lands on spawn "${exit.spawn}" in "${exit.to}", which is not in that map (has: ${[...landing].join(', ') || 'none'})`);
      }
    }

    if (district.ambient) {
      for (const sheet of district.ambient.base ?? []) {
        if (!sprites.has(sheet)) {
          add(`${d} ambient sheet "${sheet}" has no src/assets/sprites/${sheet}.png`);
        }
      }
      if (district.ambient.area) {
        const layer = (tmj.layers ?? []).find((l: Json) => l.name === def.spawnLayer);
        const area = ((layer?.objects ?? []) as Json[]).find((o) => o.name === district.ambient.area);
        if (!area) need(district.ambient.area, 'ambient area');
        else if (!area.width || !area.height) {
          add(`${d} ambient area "${district.ambient.area}" is a point — draw it as a rectangle in Tiled`);
        }
      }
    }

    for (const slot of district.pulse_slots ?? []) {
      if (!def.pulseLayer) {
        add(`${d} offers City Pulse slot "${slot}" but map "${district.map}" declares no pulseLayer`);
      } else if (!pulse.has(slot)) {
        add(`${d} City Pulse slot "${slot}" is not an object in "${def.pulseLayer}" of ${def.file}`);
      }
    }

    // Rule 7 (ADR-125): the feet box can walk from the default spawn to every exit zone.
    for (const exit of district.exits ?? []) {
      if (!exit.zone || !spawns.has(exit.zone) || !district.defaultSpawn || !spawns.has(district.defaultSpawn)) continue;
      const verdict = reachable(tmj, def, district.defaultSpawn, exit.zone);
      if (verdict === false) add(`${d}: the feet box cannot walk from "${district.defaultSpawn}" to exit "${exit.zone}" — a wall or footprint seals the way (ADR-125)`);
    }

    // Density: a screen with nothing to do is a design bug (ADR-40), not a crash.
    const tiles = (tmj.width ?? 0) * (tmj.height ?? 0);
    if (tiles > 0) {
      const objectLayer = (tmj.layers ?? []).find((l: Json) => l.name === def.sortedLayer);
      const interactables =
        (district.npcs?.length ?? 0) +
        (district.objects?.length ?? 0) +
        (district.exits?.length ?? 0) +
        (district.triggers?.length ?? 0) +
        (district.pulse_slots?.length ?? 0) +
        ((objectLayer?.objects ?? []) as Json[]).filter((o) => o.type !== 'cutout' && o.type !== 'above').length;
      const screens = tiles / SCREEN_TILES;
      if (interactables < screens) {
        warn(`${d} has ${interactables} interactables over ~${Math.round(screens)} screens — ADR-40 wants ≥1 per 10×10-tile screen`);
      }
    }
  }

  // Reachability: walk exits from the start. Anything not reached is content
  // the player can never see — usually a missing exit, sometimes a typo in `to`.
  const start = world.startDistrict ?? START_DISTRICT;
  if (byId.size && !byId.has(start)) {
    add(`start district "${start}" does not exist`);
  } else if (byId.size) {
    const reached = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const current = byId.get(queue.shift()!);
      for (const exit of current?.exits ?? []) {
        if (byId.has(exit.to) && !reached.has(exit.to)) {
          reached.add(exit.to);
          queue.push(exit.to);
        }
      }
    }
    for (const id of byId.keys()) {
      if (!reached.has(id)) add(`district "${id}" is unreachable from "${start}" — no chain of exits leads there`);
    }
  }

  return { problems, warnings };
}

/**
 * Walkability on an 8px grid with the 20×12 feet box (ADR-125): a cell is
 * blocked when any collision rect (object layer), collision tile, placed
 * object footprint or cutout footprint overlaps it. BFS from the spawn's cell
 * to any cell of the target zone. Returns null when the map has no collision
 * data at all (nothing to check). The grid itself lives in
 * src/playground/movie/walkgrid.ts, shared with the Movie Mode bot: a path the
 * bot walks is a path this rule accepts.
 */
export function reachable(tmj: Json, def: Json, spawnName: string, zoneName: string): boolean | null {
  const W = (tmj.width ?? 0) * 32, H = (tmj.height ?? 0) * 32;
  if (!W || !H) return null;
  const rects = rectsFromTmj(tmj, def);
  if (!rects.length) return null;
  const grid = buildGrid(rects, W, H);
  const layers: Json[] = tmj.layers ?? [];
  const spawnLayer = layers.find((l) => l.name === def.spawnLayer);
  const spawn = (spawnLayer?.objects ?? []).find((o: Json) => o.name === spawnName);
  const zone = (spawnLayer?.objects ?? []).find((o: Json) => o.name === zoneName);
  if (!spawn || !zone) return null;
  // Spawns are sprite centres; the feet box sits 17px below.
  const start = cellAt(grid, spawn.x ?? 0, (spawn.y ?? 0) + FEET_DY);
  if (start < 0) return null;
  const target = zoneOf(zone);
  return bfs(grid, start, (i) => overlapsZone(grid, i, target));
}

function validateRequirement(file: string, where: string, requires: Json): string[] {
  const out: string[] = [];
  if (!SKILL_BRANCHES.includes(requires.skill)) {
    out.push(`${file}: ${where} requires skill "${requires.skill}", which is not a branch (${SKILL_BRANCHES.join(', ')})`);
  } else {
    const tiers = (SKILL_TIER_NAMES as Record<string, readonly string[]>)[requires.skill];
    if (typeof requires.level !== 'number' || requires.level < 0 || requires.level >= tiers.length) {
      out.push(`${file}: ${where} requires level ${requires.level}, outside 0..${tiers.length - 1}`);
    }
  }
  return out;
}

function validateEffect(
  file: string,
  where: string,
  effect: Json,
  itemIds: Set<string>,
  itemsMayBeUnknown: boolean,
): string[] {
  const out: string[] = [];
  for (const key of Object.keys(effect)) {
    if (!EFFECT_KEYS.includes(key)) {
      const hint = key === 'money' ? ' (now "wallet")' : key === 'energy' ? ' (now "food")' : '';
      out.push(`${file}: ${where} has unknown effect key "${key}"${hint}`);
    }
  }
  if (effect.flags !== undefined) {
    if (typeof effect.flags !== 'object' || Array.isArray(effect.flags)) {
      out.push(`${file}: ${where} flags must be an object of flag → boolean`);
    } else {
      for (const [flag, value] of Object.entries(effect.flags)) {
        if (typeof value !== 'boolean') out.push(`${file}: ${where} flag "${flag}" must be true or false`);
      }
    }
  }
  if (effect.xp !== undefined && !effect.xp_branch) {
    out.push(`${file}: ${where} grants xp with no xp_branch`);
  }
  if (effect.relationship !== undefined) {
    const r = effect.relationship;
    if (typeof r !== 'object' || typeof r.npc !== 'string' || !r.npc) out.push(`${file}: ${where} relationship needs an npc`);
    if (!RELATIONSHIP_STATES.includes(r?.state)) out.push(`${file}: ${where} relationship state must be one of ${RELATIONSHIP_STATES.join(', ')}`);
  }
  if (effect.xp_branch && !SKILL_BRANCHES.includes(effect.xp_branch)) {
    out.push(`${file}: ${where} has xp_branch "${effect.xp_branch}", which is not a branch`);
  }
  // Item files are validated before every id is known, so their own effects
  // cannot cross-check item ids without a second pass.
  if (!itemsMayBeUnknown) {
    for (const key of ['item_add', 'item_remove'] as const) {
      if (effect[key] && !itemIds.has(effect[key])) {
        out.push(`${file}: ${where} references unknown item "${effect[key]}" via ${key}`);
      }
    }
  }
  return out;
}

function detectPrerequisiteCycles(questFiles: Array<{ file: string; json: Json }>): string[] {
  const graph = new Map<string, string[]>();
  for (const { json } of questFiles) {
    if (json.id) graph.set(json.id, json.prerequisite_quests ?? []);
  }

  const problems: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      problems.push(`quests: prerequisite cycle — ${[...path, id].join(' → ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const next of graph.get(id) ?? []) {
      if (graph.has(next)) visit(next, [...path, id]);
    }
    state.set(id, 'done');
  };

  for (const id of graph.keys()) visit(id, []);
  return problems;
}


// ── Movie Mode walkthroughs (Test Playground, T-054) ────────────────────────
const WALKTHROUGH_ACTIONS = ['wait_for', 'goto', 'interact', 'choose', 'advance', 'wait', 'phone', 'sleep', 'pay', 'expect', 'set_flag', 'unresolved'];
const WALKTHROUGH_READY = ['scene_loaded', 'free', 'flag', 'dialogue', 'objective'];

/**
 * One walkthrough per built scene (src/data/walkthroughs/<scene>.json): every
 * step is a known action, every target resolves against the district the bot
 * stands in at that point (its placed NPCs, its map's spawns and zones — the
 * district changes on `wait_for scene_loaded <district>`), beats exist in the
 * scene, numbers are numbers. `set_flag` is allowed but counted: the report
 * shows every use in yellow, and the console warns here.
 */
export function validateWalkthroughs(
  files: Array<{ file: string; json: Json }>,
  scenes: Json[],
  districts: Json[],
  npcs: Json[],
  manifest: { maps: Record<string, Json> },
  maps: Record<string, Json>,
): { problems: string[]; warnings: string[] } {
  const problems: string[] = [], warnings: string[] = [];
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const districtById = new Map(districts.map((d) => [d.id, d]));
  const npcIds = new Set(npcs.map((n) => n.id));
  const seen = new Set<string>();
  const objectsOf = (districtId: string): Set<string> => {
    const d = districtById.get(districtId);
    const def = d ? manifest.maps[d.map] : undefined;
    return objectNames(def ? maps[d!.map] : undefined, def?.spawnLayer);
  };
  for (const { file, json } of files) {
    const add = (msg: string) => problems.push(`${file}: ${msg}`);
    if (typeof json?.scene !== 'string' || !json.scene) { add('needs a "scene" id'); continue; }
    const scene = sceneById.get(json.scene);
    if (!scene) { add(`scene "${json.scene}" does not exist`); continue; }
    if (seen.has(json.scene)) add(`scene "${json.scene}" has two walkthroughs`);
    seen.add(json.scene);
    if (scene.status === 'STUB') add(`scene "${json.scene}" is a STUB — walkthroughs are for built scenes only`);
    if (file !== `walkthroughs/${json.scene}.json`) add(`file name must match the scene: walkthroughs/${json.scene}.json`);
    if (!Array.isArray(json.steps) || !json.steps.length) { add('needs a non-empty "steps" array'); continue; }
    const beats = new Set(((scene.beats ?? []) as Json[]).filter((b) => typeof b === 'object').map((b) => b.id));
    let district: string = scene.district;
    let objects = objectsOf(district);
    let cheats = 0;
    const ids = new Set<string>();
    (json.steps as Json[]).forEach((step, i) => {
      const where = `step ${step?.id ?? i + 1}`;
      if (!step || typeof step !== 'object') { add(`${where} is not an object`); return; }
      if (step.id !== undefined) { if (typeof step.id !== 'string' || !step.id) add(`${where} id must be a string`); else if (ids.has(step.id)) add(`${where} id is used twice`); else ids.add(step.id); }
      if (!WALKTHROUGH_ACTIONS.includes(step.do)) { add(`${where} has unknown action "${step.do}" (${WALKTHROUGH_ACTIONS.join(', ')})`); return; }
      if (step.beat !== undefined && !beats.has(step.beat)) add(`${where} names beat "${step.beat}", which scene "${json.scene}" does not have`);
      if (step.timeout !== undefined && (typeof step.timeout !== 'number' || step.timeout <= 0)) add(`${where} timeout must be a positive number of ms`);
      const target = (t: unknown, what: string) => {
        if (typeof t !== 'string' || !t) { add(`${where} ${what} must be a target string`); return; }
        const [prefix, rest] = t.includes(':') ? [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)] : ['', t];
        const placed = new Set(((districtById.get(district)?.npcs ?? []) as Json[]).map((n) => n.id));
        if (prefix === 'npc') { if (!npcIds.has(rest)) add(`${where} ${what} "${t}" is not an NPC`); else if (!placed.has(rest)) add(`${where} ${what} "${t}" is not placed in district "${district}"`); return; }
        if (prefix === 'tile') { if (!/^\d+,\d+$/.test(rest)) add(`${where} ${what} "${t}" must be tile:x,y`); return; }
        if (prefix === 'zone' || prefix === 'spawn' || prefix === 'exit') { if (!objects.has(rest)) add(`${where} ${what} "${t}" is not a spawn or zone of district "${district}"'s map`); return; }
        if (prefix) { add(`${where} ${what} "${t}" has unknown prefix "${prefix}" (npc, zone, spawn, exit, tile)`); return; }
        if (!placed.has(rest) && !objects.has(rest)) add(`${where} ${what} "${t}" is neither an NPC placed in "${district}" nor a spawn/zone of its map`);
      };
      switch (step.do) {
        case 'wait_for':
          if (!WALKTHROUGH_READY.includes(step.ready)) add(`${where} ready must be one of ${WALKTHROUGH_READY.join(', ')}`);
          if (step.scene !== undefined) {
            if (!districtById.has(step.scene)) add(`${where} waits for district "${step.scene}", which does not exist`);
            else { district = step.scene; objects = objectsOf(district); }
          }
          break;
        case 'goto': target(step.target, 'target'); break;
        case 'interact': if (step.target !== undefined) target(step.target, 'target'); break;
        case 'choose': if (!(typeof step.option === 'number' && step.option >= 0) && !(typeof step.option === 'string' && step.option)) add(`${where} option must be an index or a text/node id`); break;
        case 'wait': if (typeof step.ms !== 'number' || step.ms < 0) add(`${where} ms must be a number`); break;
        case 'phone': if (!['open', 'close', 'back', 'app', 'tap', 'scroll'].includes(step.action)) add(`${where} phone action must be open, close, back, app, tap or scroll`); if (step.action === 'app' && typeof step.app !== 'string') add(`${where} phone app needs an app id`); if (step.action === 'tap' && typeof step.target !== 'string') add(`${where} phone tap needs a focusable target`); break;
        case 'pay': if (step.max !== undefined && typeof step.max !== 'number') add(`${where} max must be a number`); break;
        case 'expect': {
          const keys = ['flag', 'not_flag', 'wallet_lte', 'wallet_gte', 'district', 'scene', 'near'].filter((k) => step[k] !== undefined);
          if (!keys.length) add(`${where} expects nothing — give it a flag, wallet bound, district, scene or near target`);
          if (step.district !== undefined && !districtById.has(step.district)) add(`${where} expects district "${step.district}", which does not exist`);
          if (step.near !== undefined) target(step.near, 'near');
          break;
        }
        case 'set_flag': if (typeof step.flag !== 'string' || !step.flag) add(`${where} set_flag needs a flag`); cheats += 1; break;
        case 'unresolved': if (typeof step.reason !== 'string' || !step.reason) add(`${where} unresolved needs a reason`); break;
        default: break;
      }
    });
    if (cheats) warnings.push(`${file}: ${cheats} set_flag step${cheats > 1 ? 's' : ''} — the movie will show ${cheats > 1 ? 'them' : 'it'} in yellow as cheated`);
  }
  return { problems, warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dialogue = readJsonDir('dialogue');
  const quests = readJsonDir('quests');
  const items = readJsonDir('items');
  const npcs = readJsonDir('npcs');
  const objects = readJsonDir('objects');
  const scenes = readJsonDir('scenes');
  const negotiations = readJsonDir('negotiations');
  const phoneApps = JSON.parse(readFileSync(join(dataDir, 'phone/apps.json'), 'utf8')) as Json[];
  const chats = readJsonDir('phone/chats');
  const districts = JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8')) as Json[];
  const tileIds = (
    JSON.parse(
      readFileSync(resolve(here, '../src/assets/tilesets/street.tiles.json'), 'utf8'),
    ) as { ids: Record<string, number> }
  ).ids;
  const fontMetrics = JSON.parse(readFileSync(resolve(here, '../src/assets/fonts/metrics.json'), 'utf8'));
  const glyphs = new Set(Object.keys(fontMetrics.advance as Record<string, number>));
  const reels = JSON.parse(readFileSync(join(dataDir, 'phone/reels.json'), 'utf8'));
  const photos = JSON.parse(readFileSync(join(dataDir, 'phone/photos.json'), 'utf8'));
  const contacts = JSON.parse(readFileSync(join(dataDir, 'phone/contacts.json'), 'utf8'));
  const notes = JSON.parse(readFileSync(join(dataDir, 'phone/notes.json'), 'utf8'));
  const problems = validateContent(dialogue, quests, items, districts, npcs, objects, tileIds, scenes, negotiations, { apps: phoneApps, chats, reels, photos, contacts, notes }, glyphs);

  const assetsDir = resolve(here, '../src/assets');
  const manifest = JSON.parse(readFileSync(join(assetsDir, 'maps.manifest.json'), 'utf8'));
  const maps: Record<string, Json> = {};
  for (const [key, def] of Object.entries(manifest.maps as Record<string, Json>)) {
    const path = join(assetsDir, 'tilemaps', def.file);
    if (existsSync(path)) maps[key] = JSON.parse(readFileSync(path, 'utf8'));
  }
  const spritesDir = join(assetsDir, 'sprites');
  const sprites = existsSync(spritesDir)
    ? readdirSync(spritesDir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''))
    : [];
  const city = JSON.parse(readFileSync(join(dataDir, 'map/city.json'), 'utf8'));
  const colourTokens = new Set(Object.keys(JSON.parse(readFileSync(join(assetsDir, '_meta/tokens.json'), 'utf8')).tokens));
  problems.push(...validateCityMap(city, districts, colourTokens));
  problems.push(...validateSettingsMenu(JSON.parse(readFileSync(join(dataDir, 'menus/settings.json'), 'utf8')), JSON.parse(readFileSync(join(dataDir, 'settings.defaults.json'), 'utf8')), glyphs));
  const areasDir = join(dataDir, 'map/areas');
  const areas: Record<string, Json> = {};
  if (existsSync(areasDir)) for (const f of readdirSync(areasDir).filter((x) => x.endsWith('.json'))) { const a = JSON.parse(readFileSync(join(areasDir, f), 'utf8')); areas[a.district] = a; }
  const mapSizes: Record<string, [number, number]> = {};
  for (const [key, json] of Object.entries(maps)) mapSizes[key] = [json.width, json.height];
  problems.push(...validateAreas(districts, areas, mapSizes));

  const world = validateWorld(districts, { manifest, maps, sprites });
  problems.push(...world.problems);
  for (const w of world.warnings) console.warn(`  ⚠ ${w}`);
  const walkDir = join(dataDir, 'walkthroughs');
  const walkthroughs = existsSync(walkDir) ? readJsonDir('walkthroughs') : [];
  const walks = validateWalkthroughs(walkthroughs, scenes.map((f) => f.json), districts, npcs.flatMap((f) => (Array.isArray(f.json) ? f.json : [])), manifest, maps);
  problems.push(...walks.problems);
  for (const w of walks.warnings) console.warn(`  ⚠ ${w}`);

  if (problems.length) {
    console.error(`\n✗ Content validation failed (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
  }

  const count = (files: typeof items) =>
    files.reduce((n, f) => n + (Array.isArray(f.json) ? f.json.length : 0), 0);
  console.log(
    `✓ content valid — ${districts.length} districts, ${count(npcs)} NPCs, ` +
      `${count(objects)} objects, ${dialogue.length} dialogue, ` +
      `${quests.length} quest, ${count(items)} items, ${scenes.length} scene component${scenes.length === 1 ? '' : 's'}, ` +
      `${negotiations.length} negotiation${negotiations.length === 1 ? '' : 's'}, ${phoneApps.length} phone apps, ${chats.length} chat threads, city map (${city.regions.length} regions, ${city.paths.length} paths, ${city.metro.length} metro lines), ${walkthroughs.length} walkthrough${walkthroughs.length === 1 ? '' : 's'}`,
  );
}
