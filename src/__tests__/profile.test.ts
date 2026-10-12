import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_PLAYER_SHEETS, DEGREES, INDIAN_STATES, defaultProfile, sheetForProfile, validateProfile,
} from '../utils/profile';
import { SaveManager } from '../systems/SaveManager';
import { useGameStore } from '../store';
import { DEFAULT_PLAYER_SHEET, SAVE_KEY, SAVE_VERSION } from '../utils/constants';
import tokens from '../assets/_meta/tokens.json';
import { color, hex, PALETTE } from '../ui/tokens';

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
  useGameStore.getState().reset();
});

describe('player profile (ADR-15: gates flavour, never content)', () => {
  it('the default profile is valid once it has a name', () => {
    expect(validateProfile(defaultProfile())).toEqual(['Name must be 2–14 characters']);
    expect(validateProfile({ ...defaultProfile(), name: 'Amit' })).toEqual([]);
  });

  it('rejects an age outside 20–26 and a name outside 2–14', () => {
    expect(validateProfile({ ...defaultProfile(), name: 'A', age: 19 })).toHaveLength(2);
    expect(validateProfile({ ...defaultProfile(), name: 'A'.repeat(15), age: 27 })).toHaveLength(2);
  });

  it('assigns the sprite from gender + skin, never from anything else', () => {
    const p = { ...defaultProfile(), name: 'Amit' };
    expect(sheetForProfile({ ...p, gender: 'M', skin: 3, age: 22 })).toBe('player_m_3');
    expect(sheetForProfile({ ...p, gender: 'M', skin: 3, age: 24 })).toBe('player_m_3'); // age does not change the sheet (T-022)
    expect(sheetForProfile({ ...p, gender: 'F', skin: 5, age: 20 })).toBe('player_f_5');
    expect(sheetForProfile({ ...p, gender: 'F', skin: 1, age: 26, degree: 'MCA', college: 'x' })).toBe('player_f_1');
    expect(DEFAULT_PLAYER_SHEET).toBe(sheetForProfile(defaultProfile()));
  });

  it('every assignable sheet exists on disk — pnpm art and profile.ts agree', () => {
    expect(ALL_PLAYER_SHEETS).toHaveLength(2 * 5);
    for (const sheet of ALL_PLAYER_SHEETS) {
      expect(existsSync(join(__dirname, '..', 'assets', 'sprites', `${sheet}.png`)), sheet).toBe(true);
    }
  });

  it('offers every Indian state and the six degrees', () => {
    expect(INDIAN_STATES).toContain('Karnataka');
    expect(INDIAN_STATES).toContain('Outside India');
    expect(DEGREES).toEqual(['B.E/B.Tech', 'B.Sc', 'BCA', 'MCA', 'B.Com', 'Other']);
  });

  it('setProfile derives the display name and the sprite', () => {
    useGameStore.getState().setProfile({ ...defaultProfile(), name: ' Priya ', gender: 'F', skin: 2, age: 25 });
    const s = useGameStore.getState();
    expect(s.playerName).toBe('Priya');
    expect(s.appearance.sheet).toBe('player_f_2');
  });
});

describe('save 1.3.0 — profile', () => {
  it('round-trips the profile', () => {
    useGameStore.getState().setProfile({ ...defaultProfile(), name: 'Ravi', hometown: { state: 'Karnataka', town: 'Hubli' }, college: 'KLE', degree: 'B.Sc' });
    expect(SaveManager.getInstance().save()).toBe(true);
    useGameStore.getState().reset();
    expect(useGameStore.getState().profile.name).toBe('');
    SaveManager.getInstance().restore();
    const s = useGameStore.getState();
    expect(s.profile).toMatchObject({ name: 'Ravi', hometown: { town: 'Hubli' }, college: 'KLE', degree: 'B.Sc' });
    expect(s.playerName).toBe('Ravi');
  });

  it('upgrades a 1.2.0 save: keeps the name, defaults the rest, re-derives the sprite', async () => {
    mem.set(SAVE_KEY, JSON.stringify({
      version: '1.2.0', timestamp: 1,
      player: { name: 'Old', background: 'engineering', homeState: 'Kerala', appearance: { sheet: 'player' },
        position: { districtId: 'airport', x: 1, y: 2 }, direction: 'down' },
      stats: { energy: 1, stress: 1, money: 1 }, // 1.2.0 shape, migrated below
      skills: { technical: { xp: 0, level: 0 }, soft_skills: { xp: 0, level: 0 }, city_survival: { xp: 0, level: 0 } },
      reputation: { total: 0, byDistrict: {} }, inventory: [], quests: { active: {}, completed: [] }, flags: {},
      playtime_seconds: 0,
    }));
    await SaveManager.getInstance().init();
    const loaded = SaveManager.getInstance().load()!;
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.player.profile).toMatchObject({ name: 'Old', gender: 'M', age: 22, skin: 3, hometown: { state: 'Kerala' } });
    expect(loaded.player.appearance.sheet).toBe('player_m_3'); // never the retired 'player' sheet
  });
});

describe('design tokens (ADR-61: no raw hex)', () => {
  it('every token resolves to one of the 48 locked colours', () => {
    expect(PALETTE).toHaveLength(48);
    for (const [name, value] of Object.entries(tokens.tokens)) expect(PALETTE, name).toContain(value);
  });

  it('exposes hex and Phaser numbers, and fails loudly on a typo', () => {
    expect(hex('ui.line')).toBe('#222a22');
    expect(color('ui.line')).toBe(0x222a22);
    expect(() => hex('ui.nope' as never)).toThrow(/Unknown colour token/);
  });

  it('the generated file matches palette.gpl on disk', () => {
    const gpl = readFileSync(join(__dirname, '..', 'assets', '_meta', 'palette.gpl'), 'utf8');
    const entries = gpl.split('\n').filter((l) => /^\s*\d+\s+\d+\s+\d+/.test(l));
    expect(entries).toHaveLength(PALETTE.length);
  });
});
