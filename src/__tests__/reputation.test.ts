import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { DISTRICTS, NPCS, npcsInDistrict, questsInDistrict, getDistrict, getNpc } from '../data';
import { REPUTATION_TIER_NAMES, SAVE_KEY, SAVE_VERSION } from '../utils/constants';
import type { DistrictDef } from '../utils/types';

const installLocalStorage = () => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  return mem;
};

let mem: Map<string, string>;

beforeEach(() => {
  gameEvents.clear();
  ReputationManager.resetInstance();
  QuestManager.resetInstance();
  DialogueManager.resetInstance();
  InventoryManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
  mem = installLocalStorage();
});

const rep = () => ReputationManager.getInstance();

describe('ReputationManager', () => {
  it('starts every run as an Outsider', () => {
    expect(rep().total).toBe(0);
    expect(rep().tier).toBe(0);
    expect(rep().tierName).toBe('Outsider');
  });

  it('climbs the macro-loop tiers at their thresholds', () => {
    const expected: Array<[number, string]> = [
      [0, 'Outsider'], [50, 'Survivor'], [150, 'Trusted Helper'],
      [400, 'Fixer'], [800, 'Important Player'],
    ];
    for (const [threshold, name] of expected) {
      useGameStore.getState().reset();
      ReputationManager.resetInstance();
      rep().add(threshold);
      expect(rep().tierName).toBe(name);
    }
    expect(REPUTATION_TIER_NAMES).toHaveLength(5);
  });

  it('reports how much is left to the next tier, and null at the top', () => {
    rep().add(20);
    expect(rep().toNextTier).toBe(30); // 50 - 20
    rep().add(800);
    expect(rep().toNextTier).toBeNull();
  });

  it('credits a district gain to both local standing and the global total', () => {
    rep().add(30, 'airport');
    expect(rep().total).toBe(30);
    expect(rep().standingIn('airport')).toBe(30);
    expect(rep().standingIn('whitefield_street')).toBe(0);
  });

  it('emits reputation:changed, and reputation:tier only on a promotion', () => {
    const changed = vi.fn();
    const promoted = vi.fn();
    gameEvents.on('reputation:changed', changed);
    gameEvents.on('reputation:tier', promoted);

    rep().add(10);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(promoted).not.toHaveBeenCalled();

    rep().add(40); // crosses 50
    expect(promoted).toHaveBeenCalledWith({ tier: 1, tierName: 'Survivor' });
  });

  it('ignores a zero-value change', () => {
    const changed = vi.fn();
    gameEvents.on('reputation:changed', changed);
    rep().add(0);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('district access', () => {
  // Synthetic districts so each rule is tested on its own.
  const district = (id: string, unlock?: DistrictDef['unlock']): DistrictDef => ({
    id, name: id, map: 'm', defaultSpawn: 's', ...(unlock ? { unlock } : {}),
  });
  const gated = () => new ReputationManager({
    open: district('open'),
    by_quest: district('by_quest', { quest: 'arrival' }),
    by_rep: district('by_rep', { reputation: 50 }),
    by_flag: district('by_flag', { flags: ['pg_signed'] }),
  });

  it('opens districts with no unlock rule', () => {
    expect(rep().canEnter('airport')).toBe(true);
    expect(gated().canEnter('open')).toBe(true);
  });

  it('gates a district behind its unlocking quest', () => {
    expect(rep().canEnter('whitefield_street')).toBe(false); // the real airport → Whitefield gate
    expect(gated().canEnter('by_quest')).toBe(false);
    useGameStore.getState().setQuests({ active: {}, completed: ['arrival'] });
    expect(rep().canEnter('whitefield_street')).toBe(true);
    expect(gated().canEnter('by_quest')).toBe(true);
  });

  it('gates a district behind reputation', () => {
    const r = gated();
    expect(r.canEnter('by_rep')).toBe(false); // needs 50
    r.add(50);
    expect(r.canEnter('by_rep')).toBe(true);
  });

  it('gates a district behind a flag', () => {
    const r = gated();
    expect(r.canEnter('by_flag')).toBe(false);
    useGameStore.getState().setFlag('pg_signed', true);
    expect(r.canEnter('by_flag')).toBe(true);
  });

  it('refuses an unknown district instead of letting it through', () => {
    expect(rep().canEnter('atlantis')).toBe(false);
  });

  it('lists available districts in declaration order', () => {
    expect(rep().availableDistricts().map((d) => d.id)).toEqual(['airport']);
    useGameStore.getState().setQuests({ active: {}, completed: ['arrival'] });
    expect(rep().availableDistricts().map((d) => d.id)).toEqual(['airport', 'whitefield_street']);
  });
});

describe('district + NPC registries', () => {
  it('loads districts and NPCs by id', () => {
    expect(Object.keys(DISTRICTS)).toContain('airport');
    expect(Object.keys(NPCS)).toContain('receptionist');
    expect(getDistrict('airport').name).toBe('Kempegowda International');
    expect(getNpc('receptionist').tier).toBe(2);
  });

  it('queries content by district — the unit of world expansion', () => {
    expect(npcsInDistrict('airport')).toHaveLength(5);
    expect(npcsInDistrict('whitefield_street')).toEqual([]);
    expect(questsInDistrict('airport').map((q) => q.id)).toEqual(['arrival']);
  });

  it('fails loudly on unknown ids', () => {
    expect(() => getDistrict('narnia')).toThrow(/Unknown district/);
    expect(() => getNpc('nobody')).toThrow(/Unknown NPC/);
  });
});

describe('reputation in the quest loop', () => {
  it('completing arrival grants reputation globally and to its district', () => {
    QuestManager.getInstance().start('arrival');
    const d = DialogueManager.getInstance();
    d.start('receptionist'); d.choose(1); d.end();
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', districtId: 'airport' });

    expect(rep().total).toBe(10);
    expect(rep().standingIn('airport')).toBe(10);
  });

  it('a reputation-gated quest refuses to start until the bar is met', () => {
    const qm = new QuestManager({
      big_job: {
        id: 'big_job', title: 'T', description: '', chapter: 2,
        district: 'airport', type: 'negotiation', reputation_required: 150,
        objectives: [{ id: 'o', text: '', type: 'reach', target: 'z' }],
        rewards: { xp: 0 },
      },
    });
    expect(qm.start('big_job')).toBe(false);
    rep().add(150);
    expect(qm.start('big_job')).toBe(true);
    qm.dispose();
  });
});

describe('save migration', () => {
  it('round-trips reputation', () => {
    rep().add(75, 'airport');
    expect(SaveManager.getInstance().save()).toBe(true);
    useGameStore.getState().reset();
    expect(rep().total).toBe(0);
    expect(SaveManager.getInstance().restore()).toBe(true);
    expect(rep().total).toBe(75);
    expect(rep().standingIn('airport')).toBe(75);
  });

  it('upgrades a 1.0.0 save forward instead of discarding the run', () => {
    mem.set(SAVE_KEY, JSON.stringify({
      version: '1.0.0',
      timestamp: 1,
      player: { name: 'Old', background: 'engineering', homeState: 'Other',
        position: { scene: 'AirportScene', x: 1, y: 2 }, direction: 'down' },
      stats: { energy: 40, stress: 30, money: 1234 },
      skills: { technical: { xp: 0, level: 0 }, soft_skills: { xp: 0, level: 0 },
        city_survival: { xp: 120, level: 1 } },
      inventory: ['water_bottle'],
      quests: { active: {}, completed: ['arrival'] },
      flags: {},
      playtime_seconds: 0,
    }));

    const loaded = SaveManager.getInstance().load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.reputation).toEqual({ total: 0, byDistrict: {} });
    // The scene class the old save named becomes the district it rendered.
    expect(loaded!.player.position).toEqual({ districtId: 'airport', x: 1, y: 2 });
    expect(loaded!.player.appearance).toEqual({ sheet: 'player_m_3' }); // re-derived from the migrated profile

    expect(SaveManager.getInstance().restore()).toBe(true);
    const state = useGameStore.getState();
    expect(state.stats.money).toBe(1234);          // the old run survives
    expect(state.inventory).toEqual(['water_bottle']);
    expect(state.quests.completed).toEqual(['arrival']);
  });

  it('sends a legacy save whose scene is unknown back to the airport', () => {
    mem.set(SAVE_KEY, JSON.stringify({
      version: '1.1.0', timestamp: 1,
      player: { name: 'Old', background: 'engineering', homeState: 'Other',
        position: { scene: 'PGScene', x: 9, y: 9 }, direction: 'down' },
      stats: { energy: 1, stress: 1, money: 1 },
      skills: { technical: { xp: 0, level: 0 }, soft_skills: { xp: 0, level: 0 }, city_survival: { xp: 0, level: 0 } },
      reputation: { total: 0, byDistrict: {} }, inventory: [], quests: { active: {}, completed: [] }, flags: {},
      playtime_seconds: 0,
    }));
    expect(SaveManager.getInstance().load()!.player.position.districtId).toBe('airport');
  });

  it('still refuses a version it has no migration for', () => {
    mem.set(SAVE_KEY, JSON.stringify({ version: '0.5.0', stats: {} }));
    expect(SaveManager.getInstance().load()).toBeNull();
  });
});

describe('single-currency economy', () => {
  it('tracks lifetime earnings without counting spending', () => {
    const stats = StatsManager.getInstance();
    stats.adjustMoney(500);   // income
    stats.adjustMoney(-200);  // spend
    stats.adjustMoney(100);   // income
    const state = useGameStore.getState();
    expect(state.stats.money).toBe(5400);   // 5000 + 500 - 200 + 100
    expect(state.totalEarned).toBe(600);    // income only
  });
});
