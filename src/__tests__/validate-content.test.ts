import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateContent } from '../../scripts/validate-content.ts';

const dataDir = join(__dirname, '..', 'data');

const readDir = (dir: string) =>
  readdirSync(join(dataDir, dir))
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({
      file: `${dir}/${file}`,
      basename: file.replace(/\.json$/, ''),
      json: JSON.parse(readFileSync(join(dataDir, dir, file), 'utf8')),
    }));

const items = () => [
  {
    file: 'items/test.json',
    basename: 'test',
    json: [{ id: 'water_bottle', name: 'W', description: 'd', icon: 'i', type: 'consumable', stackable: true, max_stack: 2 }],
  },
];

const quests = () => [
  {
    file: 'quests/arrival.json',
    basename: 'arrival',
    json: {
      id: 'arrival', title: 'T', description: 'd', chapter: 1,
      district: 'airport', type: 'search',
      objectives: [{ id: 'o1', text: 't', type: 'reach', target: 'zone_exit' }],
      rewards: { xp: 10, xp_branch: 'city_survival' },
    },
  },
];

const districts = () => [{ id: 'airport', name: 'Airport', map: 'airport_map', defaultSpawn: 'player_spawn' }];

const dialogue = (nodes: Record<string, unknown>) => [
  { file: 'dialogue/npc.json', basename: 'npc', json: { id: 'npc', speaker: 'S', portrait: 'p', nodes } },
];

const run = (nodes: Record<string, unknown>) =>
  validateContent(dialogue(nodes), quests(), items(), districts(), []);

describe('content validator', () => {
  it('passes the real authored content', () => {
    const realDistricts = JSON.parse(
      readFileSync(join(dataDir, 'districts.json'), 'utf8'),
    );
    expect(
      validateContent(
        readDir('dialogue'), readDir('quests'), readDir('items'),
        realDistricts, readDir('npcs'),
      ),
    ).toEqual([]);
  });

  it('accepts a well-formed tree', () => {
    expect(run({ start: { text: 'a', next: 'b' }, b: { text: 'b' } })).toEqual([]);
  });

  it('catches a dangling next — the soft-lock case', () => {
    const p = run({ start: { text: 'a', next: 'nowhere' } });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('soft-locks the conversation');
  });

  it('catches a dangling choice target', () => {
    const p = run({ start: { text: 'a', choices: [{ text: 'c', next: 'nowhere' }] } });
    expect(p[0]).toContain('soft-locks the conversation');
  });

  it('catches an unreachable node', () => {
    const p = run({ start: { text: 'a' }, orphan: { text: 'b' } });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('unreachable');
  });

  it('catches a missing entry node', () => {
    const p = run({ opening: { text: 'a' } });
    expect(p[0]).toContain('no "start" node');
  });

  it('catches choices and next on the same node', () => {
    const p = run({ start: { text: 'a', next: 'b', choices: [{ text: 'c', next: 'b' }] }, b: { text: 'b' } });
    expect(p.some((x) => x.includes('next would be unreachable'))).toBe(true);
  });

  it('catches an unknown item in an effect', () => {
    const p = run({ start: { text: 'a', effect: { item_add: 'ghost_item' } } });
    expect(p[0]).toContain('unknown item "ghost_item"');
  });

  it('catches an invalid skill branch in a requirement', () => {
    const p = run({ start: { text: 'a', choices: [{ text: 'c', next: 'start', requires: { skill: 'luck', level: 1 } }] } });
    expect(p[0]).toContain('not a branch');
  });

  it('catches a skill tier above the top level', () => {
    const p = run({ start: { text: 'a', choices: [{ text: 'c', next: 'start', requires: { skill: 'technical', level: 9 } }] } });
    expect(p[0]).toContain('outside 0..4');
  });

  it('catches xp granted with no branch', () => {
    const p = run({ start: { text: 'a', effect: { xp: 10 } } });
    expect(p[0]).toContain('no xp_branch');
  });

  it('catches an id that does not match its filename', () => {
    const files = [{ file: 'dialogue/npc.json', basename: 'npc', json: { id: 'other', speaker: 'S', portrait: 'p', nodes: { start: { text: 'a' } } } }];
    expect(validateContent(files, quests(), items(), districts(), [])[0]).toContain('does not match filename');
  });

  it('catches a prerequisite cycle between quests', () => {
    const cyclic = [
      { file: 'quests/a.json', basename: 'a', json: { id: 'a', district: 'airport', type: 'search', objectives: [{ id: 'o' }], prerequisite_quests: ['b'], rewards: {} } },
      { file: 'quests/b.json', basename: 'b', json: { id: 'b', district: 'airport', type: 'search', objectives: [{ id: 'o' }], prerequisite_quests: ['a'], rewards: {} } },
    ];
    expect(validateContent([], cyclic, items(), districts(), []).some((p) => p.includes('prerequisite cycle'))).toBe(true);
  });

  it('catches an unknown reward item and the retired unlock_scene field', () => {
    const bad = [{
      file: 'quests/x.json', basename: 'x',
      json: { id: 'x', district: 'airport', type: 'search', objectives: [{ id: 'o' }], rewards: { items: ['nope'] }, on_complete: { unlock_scene: 'PGScene' } },
    }];
    const p = validateContent([], bad, items(), districts(), []);
    expect(p.some((x) => x.includes('reward item "nope"'))).toBe(true);
    expect(p.some((x) => x.includes('unlock_scene is gone'))).toBe(true);
  });

  it('catches stackable/max_stack incoherence', () => {
    const bad = [{ file: 'items/i.json', basename: 'i', json: [{ id: 'x', type: 'key_item', stackable: false, max_stack: 3 }] }];
    expect(validateContent([], [], bad)[0]).toContain('max_stack but is not stackable');
  });

  it('catches an invalid item type', () => {
    const bad = [{ file: 'items/i.json', basename: 'i', json: [{ id: 'x', type: 'relic', stackable: false }] }];
    expect(validateContent([], [], bad)[0]).toContain('expected one of');
  });

  it('catches an invalid quest type', () => {
    const bad = [{ file: 'quests/x.json', basename: 'x',
      json: { id: 'x', district: 'airport', type: 'heist', objectives: [{ id: 'o' }], rewards: {} } }];
    expect(validateContent([], bad, items(), districts(), [])[0]).toContain('is not one of');
  });

  it('catches a quest in a district that does not exist', () => {
    const bad = [{ file: 'quests/x.json', basename: 'x',
      json: { id: 'x', district: 'atlantis', type: 'search', objectives: [{ id: 'o' }], rewards: {} } }];
    expect(validateContent([], bad, items(), districts(), [])[0]).toContain('not in districts.json');
  });

  it('catches a tier 2 NPC with no dialogue', () => {
    const bad = [{ file: 'npcs/a.json', basename: 'a',
      json: [{ id: 'x', name: 'X', tier: 2 }] }];
    const p = validateContent([], [], items(), districts(), bad);
    expect(p.some((m) => m.includes('is tier 2 but has no dialogue'))).toBe(true);
  });

  it('allows a tier 1 ambient NPC with no dialogue', () => {
    const ambient = [{ file: 'npcs/a.json', basename: 'a',
      json: [{ id: 'x', name: 'X', tier: 1 }] }];
    expect(validateContent([], [], items(), districts(), ambient)).toEqual([]);
  });

  it('catches an invalid NPC tier', () => {
    const bad = [{ file: 'npcs/a.json', basename: 'a',
      json: [{ id: 'x', name: 'X', tier: 7, dialogue: 'npc' }] }];
    const p = validateContent(dialogue({ start: { text: 'a' } }), [], items(), districts(), bad);
    expect(p.some((m) => m.includes('has tier 7'))).toBe(true);
  });

  it('catches two NPCs claiming one spawn point in a district', () => {
    const npcs = [{ file: 'npcs/a.json', basename: 'a', json: [
      { id: 'a1', name: 'A', tier: 1 }, { id: 'a2', name: 'B', tier: 1 },
    ] }];
    const clash = [{ ...districts()[0], npcs: [{ id: 'a1', spawn: 'desk' }, { id: 'a2', spawn: 'desk' }] }];
    const p = validateContent([], [], items(), clash, npcs);
    expect(p.some((m) => m.includes('both claim spawn "desk"'))).toBe(true);
  });

  it('catches a district placing an NPC that does not exist', () => {
    const bad = [{ ...districts()[0], npcs: [{ id: 'ghost', spawn: 'desk' }] }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('places NPC "ghost"'))).toBe(true);
  });

  it('catches a district unlocked by a quest that does not exist', () => {
    const bad = [{ ...districts()[0], id: 'x', unlock: { quest: 'ghost' } }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('unlocked by quest "ghost"'))).toBe(true);
  });

  it('catches a district with no map or defaultSpawn', () => {
    const bad = [{ id: 'x', name: 'X' }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('has no map key'))).toBe(true);
    expect(p.some((m) => m.includes('has no defaultSpawn'))).toBe(true);
  });

  it('catches an exit that leads to a district that does not exist — the dead-end class of bug', () => {
    const bad = [{ ...districts()[0], exits: [{ zone: 'z', to: 'pg_scene', spawn: 's', transit: 'bus' }] }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('exits to "pg_scene"') && m.includes('dead end'))).toBe(true);
  });

  it('catches an exit with an unknown transit kind', () => {
    const bad = [{ ...districts()[0], exits: [{ zone: 'z', to: 'airport', spawn: 's', transit: 'teleport' }] }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('transit "teleport"'))).toBe(true);
  });

  it('catches a district starting a quest that does not exist', () => {
    const bad = [{ ...districts()[0], quests: ['ghost'] }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('starts quest "ghost"'))).toBe(true);
  });

  it('catches an unregistered behaviour name', () => {
    const bad = [{ ...districts()[0], behaviours: ['teleporter'] }];
    const p = validateContent([], [], items(), bad, []);
    expect(p.some((m) => m.includes('behaviour "teleporter"'))).toBe(true);
  });
});
