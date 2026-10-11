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
import { NPC_TIERS, QUEST_TYPES, SKILL_TIER_NAMES, START_DISTRICT } from '../src/utils/constants.ts';
import { BEHAVIOUR_NAMES } from '../src/world/behaviours/names.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../src/data');

const ENTRY_NODE = 'start';
const ITEM_TYPES = ['consumable', 'key_item', 'gift', 'equipment'];
const TRANSIT_KINDS = ['walk', 'bus', 'metro', 'scooter', 'cab'];
const SKILL_BRANCHES = Object.keys(SKILL_TIER_NAMES);
const QUEST_TYPE_LIST: string[] = [...QUEST_TYPES];
const NPC_TIER_LIST: number[] = [...NPC_TIERS];

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
): string[] {
  const problems: string[] = [];
  const add = (file: string, msg: string) => problems.push(`${file}: ${msg}`);

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
      const other = claimed.get(ref.spawn);
      if (other) add(where, `${d}: NPC "${ref.id}" and "${other}" both claim spawn "${ref.spawn}"`);
      else claimed.set(ref.spawn, ref.id);
    }

    for (const ref of district.objects ?? []) {
      if (!ref.id || !ref.at) add(where, `${d} has an object entry without id or at`);
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
    }

    for (const trigger of district.triggers ?? []) {
      if (!trigger.zone) add(where, `${d} has a trigger without a zone`);
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
      objectiveIds.add(obj.id);
    }
    if (!json.objectives?.length) add(file, 'has no objectives');

    for (const prereq of json.prerequisite_quests ?? []) {
      if (!questIds.has(prereq)) add(file, `unknown prerequisite quest "${prereq}"`);
    }

    const rewards = json.rewards ?? {};
    if (rewards.reputation !== undefined && typeof rewards.reputation !== 'number') {
      add(file, 'rewards.reputation must be a number');
    }
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

  problems.push(...detectPrerequisiteCycles(questFiles));

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

      if (node.next && !nodes[node.next]) {
        add(file, `node "${nodeId}" advances to "${node.next}", which does not exist — this soft-locks the conversation`);
      }
      if (node.next && node.choices?.length) {
        add(file, `node "${nodeId}" has both choices and next; next would be unreachable`);
      }

      node.choices?.forEach((choice: Json, i: number) => {
        if (!choice.text) add(file, `node "${nodeId}" choice ${i} has no text`);
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

    // Unreachable nodes are dead content — usually a rename that missed a link.
    const reachable = new Set<string>([ENTRY_NODE]);
    const queue = [ENTRY_NODE];
    while (queue.length) {
      const current = nodes[queue.shift()!];
      if (!current) continue;
      const targets = [current.next, ...(current.choices ?? []).map((c: Json) => c.next)];
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

    // Density: a screen with nothing to do is a design bug (ADR-40), not a crash.
    const tiles = (tmj.width ?? 0) * (tmj.height ?? 0);
    if (tiles > 0) {
      const objectLayer = (tmj.layers ?? []).find((l: Json) => l.name === def.objectLayer);
      const interactables =
        (district.npcs?.length ?? 0) +
        (district.objects?.length ?? 0) +
        (district.exits?.length ?? 0) +
        (district.triggers?.length ?? 0) +
        (district.pulse_slots?.length ?? 0) +
        ((objectLayer?.objects ?? []) as Json[]).length;
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
  if (effect.xp !== undefined && !effect.xp_branch) {
    out.push(`${file}: ${where} grants xp with no xp_branch`);
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dialogue = readJsonDir('dialogue');
  const quests = readJsonDir('quests');
  const items = readJsonDir('items');
  const npcs = readJsonDir('npcs');
  const objects = readJsonDir('objects');
  const districts = JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8')) as Json[];
  const tileIds = (
    JSON.parse(
      readFileSync(resolve(here, '../src/assets/tilesets/street.tiles.json'), 'utf8'),
    ) as { ids: Record<string, number> }
  ).ids;
  const problems = validateContent(dialogue, quests, items, districts, npcs, objects, tileIds);

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
  const world = validateWorld(districts, { manifest, maps, sprites });
  problems.push(...world.problems);
  for (const w of world.warnings) console.warn(`  ⚠ ${w}`);

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
      `${quests.length} quest, ${count(items)} items`,
  );
}
