/**
 * The playground's content tree, built from data — never hand-listed
 * (ADR-105): Intro (Boot, Title, Character creation) · Act → [Arc →] Scene →
 * Beat from data/scenes/*.json in story order · Characters from the sprite
 * sheets on disk and the NPC definitions. Validator problems are attached to
 * the node they belong to.
 */
import { sceneOrder } from '../dev/prereq';
import type { NpcDef, SceneBeat, SceneComponent } from '../utils/types';

export type NodeKind = 'group' | 'intro' | 'act' | 'arc' | 'scene' | 'beat' | 'character' | 'device' | 'location';
export type NodeStatus = 'built' | 'stub' | 'failing';

export interface TreeNode {
  id: string;
  label: string;
  kind: NodeKind;
  status?: NodeStatus;
  errors?: string[];
  children?: TreeNode[];
  /** Scene id for scenes and beats; sheet base for characters; scene key for intro. */
  ref?: string;
  beat?: SceneBeat;
  scene?: SceneComponent;
  /** Characters: sheets that belong to this base (player skins 1–5), and the NPC using it. */
  sheets?: string[];
  npc?: NpcDef;
  /** Locations: the map key and the district that opens it (B1/B2). */
  location?: Location;
}

/** A map/pocket as the playground lists it (built from maps.manifest.json + districts.json). */
export interface Location {
  mapKey: string;
  /** District name, e.g. "Kempegowda International"; the first district that uses the map. */
  label: string;
  /** Districts rendered through this map (interiors and pockets are one each). */
  districts: Array<{ id: string; name: string }>;
  /** Scene ids whose district or exits touch this map. */
  scenes: string[];
}

export const INTRO: Array<{ key: 'BootScene' | 'TitleScene' | 'CharacterSelectScene'; label: string }> = [
  { key: 'BootScene', label: 'Boot (loading)' },
  { key: 'TitleScene', label: 'Title screen' },
  { key: 'CharacterSelectScene', label: 'Character creation' },
];

const errorsFor = (problems: string[], needles: string[]) =>
  problems.filter((p) => needles.some((n) => p.includes(n)));

/** Problems that belong to a map: its key, its tileset/overlay files, or any district it renders. */
export const locationErrors = (problems: string[], loc: Location): string[] =>
  errorsFor(problems, [`${loc.mapKey}:`, ...loc.districts.map((d) => `district "${d.id}"`), ...loc.districts.map((d) => `${d.id}.json`)]);

function locationNode(loc: Location, problems: string[], idPrefix = 'loc'): TreeNode {
  const errors = locationErrors(problems, loc);
  return { id: `${idPrefix}:${loc.mapKey}`, label: `${loc.label} (${loc.mapKey})`, kind: 'location', ref: loc.mapKey, location: loc, status: errors.length ? 'failing' : 'built', errors };
}

function sceneNode(scene: SceneComponent, problems: string[], locations: Location[] = []): TreeNode {
  const errors = errorsFor(problems, [`scenes/${scene.id}.json`]);
  const stub = scene.status === 'STUB';
  const beats = (scene.beats ?? []).filter((b): b is SceneBeat => typeof b === 'object');
  // B2: the maps this scene uses — its district's, plus every exit's destination.
  const used = locations.filter((l) => l.scenes.includes(scene.id));
  const locationGroup: TreeNode[] = used.length
    ? [{ id: `scene-locs:${scene.id}`, label: 'Locations', kind: 'group', children: used.map((l) => locationNode(l, problems, `sceneloc:${scene.id}`)) }]
    : [];
  return {
    id: `scene:${scene.id}`,
    label: `${scene.seq ? `${scene.seq} · ` : ''}${scene.title}`,
    kind: 'scene',
    ref: scene.id,
    scene,
    status: errors.length ? 'failing' : stub ? 'stub' : 'built',
    errors,
    children: (beats.map((beat): TreeNode => ({
      id: `beat:${scene.id}:${beat.id}`,
      label: `${beat.id} · ${beat.what.slice(0, 48)}${beat.what.length > 48 ? '…' : ''}`,
      kind: 'beat' as const,
      ref: scene.id,
      beat,
      scene,
      status: stub ? 'stub' : 'built',
    })) as TreeNode[]).concat(locationGroup),
  };
}

export function buildTree(
  scenes: SceneComponent[],
  sheets: string[],
  npcs: NpcDef[],
  problems: string[] = [],
  locations: Location[] = [],
): TreeNode[] {
  const intro: TreeNode = {
    id: 'group:intro', label: 'Intro', kind: 'group',
    children: INTRO.map(({ key, label }) => ({ id: `intro:${key}`, label, kind: 'intro', ref: key, status: 'built' })),
  };

  const byAct = new Map<number, SceneComponent[]>();
  for (const scene of sceneOrder(scenes)) byAct.set(scene.act, [...(byAct.get(scene.act) ?? []), scene]);
  const acts: TreeNode[] = [...byAct.entries()].sort(([a], [b]) => a - b).map(([act, list]) => {
    const hasArcs = list.some((s) => s.arc);
    const children: TreeNode[] = hasArcs
      ? [...new Set(list.map((s) => s.arc ?? '(no arc)'))].map((arc): TreeNode => ({
          id: `arc:${act}:${arc}`, label: `Arc · ${arc}`, kind: 'arc' as const,
          children: list.filter((s) => (s.arc ?? '(no arc)') === arc).map((s) => sceneNode(s, problems, locations)),
        }))
      : list.map((s) => sceneNode(s, problems, locations));
    const flat = hasArcs ? children.flatMap((c) => c.children ?? []) : children;
    const status: NodeStatus = flat.some((c) => c.status === 'failing') ? 'failing' : flat.every((c) => c.status === 'stub') ? 'stub' : 'built';
    return { id: `act:${act}`, label: `Act ${act}`, kind: 'act', status, children };
  });

  const chapters: TreeNode = { id: 'group:chapters', label: 'Chapters', kind: 'group', children: acts };

  const characterSheets = sheets.filter((s) => !s.includes('__'));
  const bases = [...new Set(characterSheets.map((s) => (s.startsWith('player_') ? s.replace(/_[1-5]$/, '') : s)))].sort();
  const npcBySheet = new Map(npcs.filter((n) => n.sheet).map((n) => [n.sheet!, n]));
  const characterNode = (base: string): TreeNode => {
    const own = characterSheets.filter((s) => s === base || s.replace(/_[1-5]$/, '') === base).sort();
    const errors = errorsFor(problems, [`sprites/${base}`, `"${base}"`]);
    const npc = npcBySheet.get(base);
    return {
      id: `char:${base}`, label: npc ? `${npc.name} (${base})` : base, kind: 'character',
      ref: base, sheets: own, npc, status: errors.length ? 'failing' : 'built', errors,
    };
  };
  const group = (id: string, label: string, test: (b: string) => boolean): TreeNode => ({
    id, label, kind: 'group', children: bases.filter(test).map(characterNode),
  });
  const characters: TreeNode = {
    id: 'group:characters', label: 'Characters', kind: 'group',
    children: [
      group('chars:player', 'Player', (b) => b.startsWith('player_')),
      group('chars:npc', 'NPCs', (b) => b.startsWith('npc_')),
      group('chars:crowd', 'Crowd', (b) => b.startsWith('crowd_')),
      group('chars:other', 'Other', (b) => !/^(player|npc|crowd)_/.test(b)),
    ].filter((g) => g.children!.length),
  };

  const devices: TreeNode = {
    id: 'group:devices', label: 'Devices', kind: 'group',
    children: [{ id: 'device:phone-landscape', label: 'Phone in landscape — thumbs & controls', kind: 'device' }],
  };

  // B1: every map/pocket, labelled by the district that renders it.
  const locationsGroup: TreeNode = { id: 'group:locations', label: 'Locations', kind: 'group', children: locations.map((l) => locationNode(l, problems)) };

  return locations.length ? [intro, chapters, locationsGroup, characters, devices] : [intro, chapters, characters, devices];
}

/**
 * Locations from the manifest and the districts (never hand-listed): one per
 * map key, with the districts that render it and the scenes that touch it.
 */
export function buildLocations(
  mapKeys: string[],
  districts: Array<{ id: string; name: string; map: string; exits?: Array<{ to: string }> }>,
  scenes: SceneComponent[],
): Location[] {
  const byId = new Map(districts.map((d) => [d.id, d]));
  const mapOf = (districtId: string) => byId.get(districtId)?.map;
  return mapKeys.map((mapKey) => {
    const ds = districts.filter((d) => d.map === mapKey);
    const sceneIds = scenes.filter((s) => {
      const own = mapOf(s.district) === mapKey;
      const exits = (s.exits ?? []).some((e) => typeof e === 'object' && mapOf(e.to) === mapKey);
      return own || exits;
    }).map((s) => s.id);
    return { mapKey, label: ds[0]?.name ?? mapKey, districts: ds.map((d) => ({ id: d.id, name: d.name })), scenes: sceneIds };
  });
}

/** Depth-first filter: keep nodes whose label matches, and their ancestors. */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const walk = (n: TreeNode): TreeNode | null => {
    const kids = (n.children ?? []).map(walk).filter((c): c is TreeNode => c !== null);
    if (n.label.toLowerCase().includes(q) || kids.length) return { ...n, children: kids.length ? kids : n.children };
    return null;
  };
  return nodes.map(walk).filter((n): n is TreeNode => n !== null);
}

/** Find a node by id anywhere in the tree. */
export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}
