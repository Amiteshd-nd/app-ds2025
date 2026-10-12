import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
// @ts-expect-error — plain .mjs pipeline module, no types
import { FRAME_H, FRAME_W, deriveBreath, readFrame } from '../../scripts/art/breath.mjs';
import {
  attachBreathing, breathDecision, breathTiming, idleDirection, type BreathCharacter, type BreathScene,
} from '../world/behaviours/breathing';
import { motion } from '../ui/tokens';

const assets = join(__dirname, '..', 'assets');
const LINES = JSON.parse(readFileSync(join(assets, '_raw/characters/breath.json'), 'utf8'));
const DIRS = ['down', 'left', 'right', 'up'];

const rowsEqual = (a: Buffer, b: Buffer, from: number, to: number) => {
  for (let y = from; y < to; y++) {
    const s = y * FRAME_W * 4, e = s + FRAME_W * 4;
    if (!a.subarray(s, e).equals(b.subarray(s, e))) return false;
  }
  return true;
};

describe('breathing frames (baked, feet planted)', async () => {
  const { data, info } = await sharp(join(assets, 'sprites/player_m_3.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (const [row, dir] of DIRS.entries()) {
    const f0: Buffer = readFrame(data, info.width, 1, row);
    const lines = LINES.player_m[dir];
    const { f1, f2, f3 } = deriveBreath(f0, lines);

    it(`${dir}: every row at or below waist_y is identical across F0–F3`, () => {
      for (const f of [f1, f2, f3]) expect(rowsEqual(f0, f, lines.waist_y, FRAME_H)).toBe(true);
    });

    it(`${dir}: F2's upper body is F0 shifted DOWN by 1px (top row cleared)`, () => {
      const exact = deriveBreath(f0, lines, { repair: false }).f2;
      for (let y = 1; y < lines.waist_y; y++) {
        const s = y * FRAME_W * 4;
        expect(exact.subarray(s, s + FRAME_W * 4).equals(f0.subarray(s - FRAME_W * 4, s))).toBe(true);
      }
      expect(exact.subarray(0, FRAME_W * 4).every((v: number) => v === 0)).toBe(true);
    });

    it(`${dir}: F1 moves only the head; F3 equals F1`, () => {
      expect(rowsEqual(f0, f1, lines.head_y + 1, FRAME_H)).toBe(true);
      expect(f3.equals(f1)).toBe(true);
    });
  }
});

describe('beh_breathing — controller', () => {
  const T = breathTiming();
  const anims = { exists: (k: string) => k.includes('-breath-') };
  const char = (data: Record<string, unknown> = {}) => {
    const c: BreathCharacter & { played: Array<{ key: string; startFrame?: number; timeScale?: number }> } = {
      active: true,
      texture: { key: 'npc_x' },
      body: { velocity: { x: 0, y: 0 } },
      anims: { currentAnim: { key: 'npc_x-idle-down' }, timeScale: 1 },
      getData: (k) => data[k],
      played: [],
      play(config) { this.played.push(config); this.anims.currentAnim = { key: config.key }; return this; },
    };
    return c;
  };
  const fresh = () => ({ stillSince: null as number | null, started: false, timeScale: 1 });

  it('times come from motion tokens', () => {
    expect(T).toEqual({ resume: motion('m.breath.resume'), jitter: motion('m.breath.jitter') });
    expect(motion('m.breath.f0') + motion('m.breath.f1') + motion('m.breath.f2') + motion('m.breath.f3')).toBe(1800);
  });

  it('reads the facing from the idle animation key', () => {
    expect(idleDirection('npc_x', 'npc_x-idle-left')).toBe('left');
    expect(idleDirection('npc_x', 'npc_x-walk-left')).toBeNull();
  });

  it('starts only after m.breath.resume ms of standing still, and stops on movement', () => {
    const c = char(), s = fresh();
    expect(breathDecision(c, s, 0, T, anims, true, () => 0)).toBeNull();
    expect(breathDecision(c, s, T.resume - 1, T, anims, true, () => 0)).toBeNull();
    expect(breathDecision(c, s, T.resume, T, anims, true, () => 0)).toEqual({ key: 'npc_x-breath-down', startFrame: 0, timeScale: 1 });
    c.body!.velocity!.x = 120;
    expect(breathDecision(c, s, T.resume + 50, T, anims, true, () => 0)).toBeNull();
    expect(s.stillSince).toBeNull(); // the 300 ms wait starts again after moving
  });

  it('never breathes with breathing:false, while walking, or without baked frames', () => {
    expect(breathDecision(char({ breathing: false }), fresh(), 5000, T, anims, false, () => 0)).toBeNull();
    const walking = char();
    walking.anims.currentAnim = { key: 'npc_x-walk-down' };
    const s = fresh();
    breathDecision(walking, s, 0, T, anims, false, () => 0);
    expect(breathDecision(walking, s, 5000, T, anims, false, () => 0)).toBeNull();
    const s2 = fresh();
    breathDecision(char(), s2, 0, T, { exists: () => false }, false, () => 0);
    expect(breathDecision(char(), s2, 5000, T, { exists: () => false }, false, () => 0)).toBeNull();
  });

  it('NPCs start on different frames and speeds; the player starts on F0 at speed 1', () => {
    let tick: () => void = () => {};
    const scene: BreathScene = {
      time: { now: 0, addEvent: ({ callback }) => { tick = callback; return { remove() {} }; } },
      anims,
    };
    const npcs = [char(), char(), char(), char()];
    const player = char();
    const rolls = [0.05, 0.9, 0.3, 0.6, 0.45, 0.15, 0.75, 0.95];
    let r = 0;
    attachBreathing(scene, () => [player, ...npcs], player, { random: () => rolls[r++ % rolls.length] });
    tick();
    scene.time.now = T.resume;
    tick();
    const starts = npcs.map((n) => n.played[0]);
    expect(new Set(starts.map((p) => `${p.startFrame}/${p.timeScale}`)).size).toBeGreaterThan(1);
    for (const p of starts) expect(Math.abs((p.timeScale ?? 1) - 1)).toBeLessThanOrEqual(T.jitter + 1e-9);
    expect(player.played[0]).toEqual({ key: 'npc_x-breath-down', startFrame: 0, timeScale: 1 });
  });

  it('reduced motion attaches nothing', () => {
    let added = false;
    const scene: BreathScene = { time: { now: 0, addEvent: () => { added = true; return { remove() {} }; } }, anims };
    attachBreathing(scene, () => [], null, { still: true });
    expect(added).toBe(false);
  });
});
