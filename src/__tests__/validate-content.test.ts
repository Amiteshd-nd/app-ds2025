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
        realDistricts, readDir('npcs'), [], {}, [], readDir('negotiations'),
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

describe('scene components (SCENE_TEMPLATE)', () => {
  const realDistricts = () => JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8'));
  const scene = (over: Record<string, unknown> = {}) => [{
    file: 'scenes/act0_arrivals.json', basename: 'act0_arrivals',
    json: {
      id: 'act0_arrivals', district: 'airport', act: 0, title: 'Arrivals',
      player_goal: 'g', design_goal: 'd', pacing: ['Calm', 'Reward'],
      cast: [{ npc: 'npc_chai_anna', tier: 2 }], quests: ['q_act0_arrival'],
      beats: [{ id: 'F1', pacing: 'Calm', what: 'x' }], acceptance: ['done'],
      ...over,
    },
  }];
  const run = (over: Record<string, unknown> = {}) =>
    validateContent(readDir('dialogue'), readDir('quests'), readDir('items'), realDistricts(), readDir('npcs'), [], {}, scene(over), readDir('negotiations'));

  it('passes the real act0_arrivals component', () => {
    expect(validateContent(readDir('dialogue'), readDir('quests'), readDir('items'), realDistricts(), readDir('npcs'), [], {}, readDir('scenes'), readDir('negotiations'))).toEqual([]);
  });

  it('accepts a well-formed scene', () => {
    expect(run()).toEqual([]);
  });

  it('catches a cast member that exists but is not placed in the district', () => {
    const p = run({ cast: [{ npc: 'receptionist', tier: 2 }, { npc: 'ghost', tier: 1 }] });
    expect(p.some((m) => m.includes('"ghost" is not an NPC'))).toBe(true);
    expect(p).not.toContainEqual(expect.stringContaining('"receptionist" is not placed'));
  });

  it('catches an unknown quest and a bad pacing tag', () => {
    const p = run({ quests: ['q_nope'], pacing: ['Bored'] });
    expect(p.some((m) => m.includes('quest "q_nope"'))).toBe(true);
    expect(p.some((m) => m.includes('pacing tag "Bored"'))).toBe(true);
  });

  it('catches Tense → Tense without a Calm (ADR-24)', () => {
    const p = run({ beats: [{ id: 'a', pacing: 'Tense', what: 'x' }, { id: 'b', pacing: 'Tense', what: 'y' }] });
    expect(p.some((m) => m.includes('Tense → Tense'))).toBe(true);
  });

  it('lets a STUB through with only id/district/act/title', () => {
    const stub = [{ file: 'scenes/act2_salary_scooter.json', basename: 'act2_salary_scooter',
      json: { id: 'act2_salary_scooter', district: 'TODO', act: 2, title: 'Salary & the Scooter', status: 'STUB', cast: ['TODO'] } }];
    expect(validateContent(readDir('dialogue'), readDir('quests'), readDir('items'), realDistricts(), readDir('npcs'), [], {}, stub, readDir('negotiations'))).toEqual([]);
  });
});

describe('negotiations (ADR-95)', () => {
  const npcs = [{ file: 'npcs/x.json', basename: 'x', json: [{ id: 'owner', name: 'Owner', tier: 2, dialogue: 'd' }] }];
  const neg = (over: Record<string, unknown> = {}) => [{
    file: 'negotiations/neg_x.json', basename: 'neg_x',
    json: {
      id: 'neg_x', npc: 'owner', temperament: 'warm', patience: 2,
      terms: [{ id: 'rent', label: 'Rent', ask: 8000, floor: 7000 }],
      counters: [{ id: 'c', text: 'Less?', term: 'rent', offer: 6000, tactic: 'reason' }],
      lines: { concede: 'ok', hold: 'no', offended: 'hmph', final: 'final' },
      ...over,
    },
  }];
  const tree = (nodes: Record<string, unknown>) => [{ file: 'dialogue/d.json', basename: 'd', json: { id: 'd', speaker: 'S', portrait: 'p', nodes } }];
  const check = (negs = neg(), nodes: Record<string, unknown> = { start: { text: 'a' } }) =>
    validateContent(tree(nodes), [], items(), districts(), npcs, [], {}, [], negs);

  it('accepts a well-formed negotiation and a node that runs it', () => {
    expect(check(neg(), {
      start: { text: 'Price?', negotiate: { id: 'neg_x', deal: 'yes', walk: 'no' } },
      yes: { text: 'Done' }, no: { text: 'Bye' },
    })).toEqual([]);
  });

  it('rejects a floor above the ask, an unknown term and an unknown temperament', () => {
    const p = check(neg({
      temperament: 'grumpy',
      terms: [{ id: 'rent', label: 'Rent', ask: 7000, floor: 8000 }],
      counters: [{ id: 'c', text: 'x', term: 'deposit', offer: 1, tactic: 'reason' }],
    }));
    expect(p.some((x) => x.includes('temperament "grumpy"'))).toBe(true);
    expect(p.some((x) => x.includes('0 ≤ floor ≤ ask'))).toBe(true);
    expect(p.some((x) => x.includes('unknown term "deposit"'))).toBe(true);
  });

  it('requires a callback line for temperaments that call you back', () => {
    expect(check(neg({ temperament: 'firm' })).some((x) => x.includes('lines.callback'))).toBe(true);
  });

  it('catches a negotiate node pointing at missing nodes or an unknown negotiation', () => {
    const p = check(neg(), { start: { text: 'a', negotiate: { id: 'neg_missing', deal: 'gone', walk: 'start' } } });
    expect(p.some((x) => x.includes('negotiates "neg_missing"'))).toBe(true);
    expect(p.some((x) => x.includes('negotiate.deal "gone"'))).toBe(true);
  });

  it('counts deal/walk targets and entry branches as reachable', () => {
    const p = validateContent([{ file: 'dialogue/d.json', basename: 'd', json: {
      id: 'd', speaker: 'S', portrait: 'p', enter: [{ flag: 'f', node: 'later' }],
      nodes: { start: { text: 'a' }, later: { text: 'b' } },
    } }], [], items(), districts(), npcs, [], {}, [], neg());
    expect(p).toEqual([]);
    const bad = validateContent([{ file: 'dialogue/d.json', basename: 'd', json: {
      id: 'd', speaker: 'S', portrait: 'p', enter: [{ flag: 'f', node: 'nowhere' }], nodes: { start: { text: 'a' } },
    } }], [], items(), districts(), npcs, [], {}, [], neg());
    expect(bad[0]).toContain('opens at "nowhere"');
  });
});

describe('phone data (P6)', () => {
  const chat = (json: Record<string, unknown>) => [{ file: 'phone/chats/x.json', basename: 'x', json }];
  it('accepts a well-formed app list and thread', () => {
    expect(validateContent([], [], items(), districts(), [], [], {}, [], [], {
      apps: [{ id: 'chats', name: 'Chats', icon: 'chats', order: 1 }, { id: 'maps', name: 'Maps', icon: 'maps', order: 2, unlock: 'f' }],
      chats: chat({ id: 'x', contact: 'X', messages: [{ id: 'x1', from: 'them', text: 'hi' }, { id: 'x2', from: 'me', text: 'yo', after: 'f' }] }),
    })).toEqual([]);
  });

  it('catches an unknown icon, an overfull dock and text the UI font cannot draw (ADR-114)', () => {
    const apps = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: id, icon: 'chats', order: i, dock: true }));
    apps[0].icon = 'rocket';
    const p = validateContent([], [], items(), districts(), [], [], {}, [], [], {
      apps,
      chats: chat({ id: 'x', contact: 'X', messages: [{ id: 'x1', from: 'them', text: 'Landed? 📱' }] }),
    }, new Set([...'abcdeXLand ?']));
    expect(p.some((x) => x.includes('icon "rocket"'))).toBe(true);
    expect(p.some((x) => x.includes('in the dock'))).toBe(true);
    expect(p.some((x) => x.includes('cannot draw "📱"'))).toBe(true);
  });

  it('catches duplicate message ids, a bad sender and a duplicate app', () => {
    const p = validateContent([], [], items(), districts(), [], [], {}, [], [], {
      apps: [{ id: 'chats', name: 'Chats', icon: 'chats', order: 1 }, { id: 'chats', name: 'Again', icon: 'chats', order: 2 }],
      chats: chat({ id: 'x', contact: 'X', messages: [{ id: 'x1', from: 'them', text: 'a' }, { id: 'x1', from: 'bot', text: 'b' }] }),
    });
    expect(p.some((x) => x.includes('duplicate app'))).toBe(true);
    expect(p.some((x) => x.includes('used twice'))).toBe(true);
    expect(p.some((x) => x.includes('from must be'))).toBe(true);
  });

  it('checks real-world anchors and objective destinations', () => {
    const bad = [{ id: 'airport', name: 'A', map: 'airport_map', defaultSpawn: 'player_spawn', realworld: { parent: 'nowhere' } }];
    expect(validateContent([], [], items(), bad, [])[0]).toContain('realworld');
  });
});
