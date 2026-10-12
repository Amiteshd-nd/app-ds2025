import { beforeEach, describe, expect, it } from 'vitest';
import defaults from '../data/settings.defaults.json';
import { mergeSettings, settings, survivalRate, useSettings } from '../systems/SettingsManager';
import { TimeManager } from '../systems/TimeManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { FOOD_MINUTES_PER_POINT } from '../utils/constants';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  useSettings.getState().reset();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

describe('settings', () => {
  it('starts from the data defaults', () => {
    const { $comment: _c, ...d } = defaults;
    expect(settings()).toEqual(d);
  });

  it('persists a change immediately and reads it back at boot', async () => {
    useSettings.getState().set('controls', 'joystickSide', 'right');
    await Promise.resolve();
    expect(JSON.parse(mem.get('bangalore-times:settings')!).controls.joystickSide).toBe('right');
    useSettings.setState({ settings: mergeSettings(null) });
    await useSettings.getState().load();
    expect(settings().controls.joystickSide).toBe('right');
  });

  it('merging keeps new defaults and ignores unknown or mistyped values', () => {
    const s = mergeSettings({ audio: { master: 10, bogus: 1 }, gameplay: { doNotDisturb: 'yes', minimap: true }, extra: { x: 1 } });
    expect(s.audio.master).toBe(10);
    expect((s.audio as Record<string, unknown>).bogus).toBeUndefined();
    expect(s.gameplay.doNotDisturb).toBe(false);
    // ADR-113: the minimap setting is gone; an old save's value is dropped.
    expect((s.gameplay as Record<string, unknown>).minimap).toBeUndefined();
    expect((s as Record<string, unknown>).extra).toBeUndefined();
  });

  it('Relaxed difficulty halves the food drain (ADR-16)', () => {
    TimeManager.getInstance().advance(FOOD_MINUTES_PER_POINT * 10);
    const normal = 100 - useGameStore.getState().stats.food;
    useGameStore.getState().reset();
    TimeManager.resetInstance();
    useSettings.getState().set('gameplay', 'difficulty', 'relaxed');
    expect(survivalRate()).toBe(0.5);
    TimeManager.getInstance().advance(FOOD_MINUTES_PER_POINT * 10);
    expect(100 - useGameStore.getState().stats.food).toBe(normal / 2);
  });
});
