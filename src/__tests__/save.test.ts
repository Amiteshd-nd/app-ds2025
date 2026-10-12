import { beforeEach, describe, expect, it } from 'vitest';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { SAVE_KEY } from '../utils/constants';

/** jsdom is not configured for this package; a tiny shim is all these need. */
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
  mem = installLocalStorage();
  SaveManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

describe('StatsManager', () => {
  it('applies a compound effect in one pass', () => {
    StatsManager.getInstance().applyEffect({
      wallet: -350, food: -25, stress: 15, xp: 120, xp_branch: 'city_survival',
    });
    const s = useGameStore.getState();
    expect(s.stats).toMatchObject({ food: 75, stress: 15, wallet: 34_650 });
    expect(s.skills.city_survival).toEqual({ xp: 120, level: 1 });
  });

  it('clamps food, stress and stamina to their bounds', () => {
    const stats = StatsManager.getInstance();
    stats.adjust('food', -999);
    stats.adjust('stress', 999);
    stats.adjust('stamina', 99);
    expect(useGameStore.getState().stats.food).toBe(0);
    expect(useGameStore.getState().stats.stress).toBe(100);
    expect(useGameStore.getState().stats.stamina).toBe(8);
  });

  it('spend() is the only door out of the wallet and refuses what it cannot cover', () => {
    const stats = StatsManager.getInstance();
    expect(stats.canAfford(35_000)).toBe(true);
    expect(stats.spend(36_000, 'scooter')).toBe(false);
    expect(useGameStore.getState().stats.wallet).toBe(35_000); // nothing half-applied
    expect(stats.spend(250, 'bus_fare')).toBe(true);
    expect(useGameStore.getState().stats.wallet).toBe(34_750);
    expect(() => stats.spend(-5)).toThrow();
  });

  it('social climbs once per named NPC, never twice', () => {
    const stats = StatsManager.getInstance();
    expect(stats.meet('npc_chai_anna')).toBe(true);
    expect(stats.meet('npc_chai_anna')).toBe(false);
    expect(stats.meet('npc_cab_tout_1')).toBe(true);
    expect(useGameStore.getState().stats.social).toBe(2);
  });

  it('crosses skill tiers at the documented thresholds', () => {
    const stats = StatsManager.getInstance();
    const level = () => useGameStore.getState().skills.technical.level;
    stats.addXp('technical', 99);
    expect(level()).toBe(0);
    stats.addXp('technical', 1);
    expect(level()).toBe(1);
    stats.addXp('technical', 900);
    expect(level()).toBe(4);
  });
});

describe('SaveManager', () => {
  it('round-trips stats and skills through a reset', () => {
    StatsManager.getInstance().applyEffect({ wallet: -350, xp: 120, xp_branch: 'city_survival' });
    StatsManager.getInstance().meet('npc_chai_anna');
    expect(SaveManager.getInstance().save({ districtId: 'airport', x: 128, y: 256 })).toBe(true);

    useGameStore.getState().reset();
    expect(useGameStore.getState().stats.wallet).toBe(35_000);

    expect(SaveManager.getInstance().restore()).toBe(true);
    const s = useGameStore.getState();
    expect(s.stats.wallet).toBe(34_650);
    expect(s.stats.social).toBe(1);
    expect(s.met).toEqual(['npc_chai_anna']);
    expect(s.skills.city_survival.level).toBe(1);
  });

  it('records the district and position it was saved at — never a scene class', () => {
    SaveManager.getInstance().save({ districtId: 'airport', x: 128, y: 256 });
    expect(SaveManager.getInstance().load()!.player.position).toEqual({
      districtId: 'airport', x: 128, y: 256,
    });
  });

  it('round-trips the player appearance', () => {
    useGameStore.getState().setAppearance({ sheet: 'citizen_teal' });
    SaveManager.getInstance().save();
    useGameStore.getState().reset();
    expect(useGameStore.getState().appearance.sheet).toBe('player_m_3');
    SaveManager.getInstance().restore();
    expect(useGameStore.getState().appearance.sheet).toBe('citizen_teal');
  });

  it('refuses a save written by a different format version', async () => {
    mem.set(SAVE_KEY, JSON.stringify({ version: '0.9.0', stats: {} }));
    await SaveManager.getInstance().init();
    expect(SaveManager.getInstance().load()).toBeNull();
  });

  it('refuses corrupt JSON instead of throwing', async () => {
    mem.set(SAVE_KEY, '{not json');
    await SaveManager.getInstance().init();
    expect(() => SaveManager.getInstance().load()).not.toThrow();
    expect(SaveManager.getInstance().load()).toBeNull();
  });

  it('keeps playing when storage is unavailable: nothing throws, the run lives in memory', async () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    await expect(SaveManager.getInstance().init()).resolves.toBeUndefined();
    expect(SaveManager.getInstance().load()).toBeNull();
    expect(() => SaveManager.getInstance().save()).not.toThrow();
    expect(SaveManager.getInstance().restore()).toBe(true);
  });

  it('restore() is a no-op when there is nothing saved', () => {
    expect(SaveManager.getInstance().restore()).toBe(false);
  });
});

describe('save slots (settings_and_saveload §2)', () => {
  const memoryBackend = () => {
    const disk = new Map<string, Record<string, unknown>>();
    return {
      disk,
      backend: {
        read: async (slot: string) => disk.get(slot) ?? null,
        write: async (slot: string, payload: Record<string, unknown>) => void disk.set(slot, payload),
        remove: async (slot: string) => void disk.delete(slot),
      },
    };
  };

  it('keeps an autosave and three manual slots apart', async () => {
    const { disk, backend } = memoryBackend();
    const sm = SaveManager.getInstance();
    sm.useBackend(backend);
    await sm.init();
    StatsManager.getInstance().spend(1000, 'test');
    sm.save({ districtId: 'airport', x: 1, y: 1 }, 'slot2');
    StatsManager.getInstance().spend(500, 'test');
    sm.save({ districtId: 'whitefield_street', x: 2, y: 2 });
    await Promise.resolve();
    expect([...disk.keys()].sort()).toEqual(['autosave', 'slot2']);
    const s = sm.summaries();
    expect(s.map((x) => x.slot)).toEqual(['autosave', 'slot1', 'slot2', 'slot3']);
    expect(s[0]).toMatchObject({ empty: false, place: 'Whitefield', wallet: 33_500, day: 1 });
    expect(s[1].empty).toBe(true);
    expect(s[2]).toMatchObject({ empty: false, place: 'Kempegowda International', wallet: 34_000 });
    sm.restore('slot2');
    expect(useGameStore.getState().stats.wallet).toBe(34_000);
  });

  it('reads the disk once at boot, so a fresh session finds the slots', async () => {
    const { backend } = memoryBackend();
    const first = SaveManager.getInstance();
    first.useBackend(backend);
    await first.init();
    first.save({ districtId: 'airport', x: 5, y: 5 }, 'slot3');
    await Promise.resolve();
    SaveManager.resetInstance();
    const second = SaveManager.getInstance();
    second.useBackend(backend);
    expect(second.load('slot3')).toBeNull(); // not read yet
    await second.init();
    expect(second.load('slot3')!.player.position).toEqual({ districtId: 'airport', x: 5, y: 5 });
  });

  it('saves the UPI ledger, the phone and real play time', async () => {
    const { backend } = memoryBackend();
    const sm = SaveManager.getInstance();
    sm.useBackend(backend);
    await sm.init();
    StatsManager.getInstance().spend(20, 'chai', 'Chai Anna');
    useGameStore.getState().setPhone({ delivered: ['amma_1'], read: [] });
    sm.tick(65_000);
    sm.save();
    useGameStore.getState().reset();
    sm.startNewRun();
    sm.restore();
    const st = useGameStore.getState();
    expect(st.transactions).toMatchObject([{ amount: -20, label: 'Chai Anna', reason: 'chai', balance: 34_980 }]);
    expect(st.phone.delivered).toEqual(['amma_1']);
    expect(sm.summaries()[0].playtimeSeconds).toBe(65);
  });

  it('clears a slot', async () => {
    const { backend } = memoryBackend();
    const sm = SaveManager.getInstance();
    sm.useBackend(backend);
    await sm.init();
    sm.save(undefined, 'slot1');
    sm.clear('slot1');
    expect(sm.load('slot1')).toBeNull();
  });
});
