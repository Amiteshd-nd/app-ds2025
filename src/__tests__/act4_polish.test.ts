import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { allGlows, clearGlows, resetGlows, setGlows } from '../systems/glows';
import { PULSE_BLOCKS, meters } from '../ui/hud/viewModel';
import { HUD_GLYPHS } from '../ui/hud/glyphs';
import { COMBAT } from '../systems/combat';

const stats = { health: 100, food: 100, stress: 0 };

describe('glows that escape the drain (ADR-161)', () => {
  it('owners set and clear their own lights; an empty list clears', () => {
    resetGlows();
    setGlows('a', [{ x: 1, y: 2, r: 3, color: 0xff0000, alpha: 1, halo: 2 }]);
    setGlows('b', [{ x: 5, y: 6, r: 1, color: 0x00ff00, alpha: 0.5, halo: 0 }]);
    expect(allGlows()).toHaveLength(2);
    setGlows('a', []);
    expect(allGlows().map((g) => g.x)).toEqual([5]);
    clearGlows('b');
    expect(allGlows()).toEqual([]);
  });

  it('the tunnel keeps its red lights, and the camp fire is lit only once the camp is pitched', async () => {
    const { DISTRICTS } = await import('../data');
    const tunnel = DISTRICTS.purple_tunnel.glows!;
    expect(tunnel.length).toBe(8);
    expect(tunnel.every((g) => g.color === 'map.danger')).toBe(true);
    expect(DISTRICTS.cubbon_park.glows!.every((g) => g.requiresFlag === 'base_cubbon_set')).toBe(true);
  });
});

describe('the Pulse meter (ADR-161)', () => {
  const full = COMBAT.pulse.charges, lowAt = COMBAT.pulse.lowAt;
  it('ten blocks, two charges each; a part-used block still shows; red at the low mark', () => {
    const at = (charges: number) => meters(stats, 'auto', null, null, { charges, full, lowAt })[0];
    expect(at(20)).toMatchObject({ id: 'pulse', icon: 'pulse', blocks: PULSE_BLOCKS, max: PULSE_BLOCKS, critical: false });
    expect(at(19).blocks).toBe(10);
    expect(at(11).blocks).toBe(6);
    expect(at(lowAt).critical).toBe(true);
    expect(at(0).blocks).toBe(0);
  });
  it('only while you carry the gun (the caller passes null otherwise) and its glyph fits the meter row', () => {
    expect(meters(stats, 'auto').map((m) => m.id)).toEqual([]);
    expect(HUD_GLYPHS.pulse.every((row) => row.length === 7)).toBe(true);
  });
});

describe('fall frames (ADR-161)', () => {
  it('every body with twitch frames can also fall', () => {
    const files = readdirSync(join(__dirname, '../assets/sprites')).map((f) => f.replace(/\.png$/, ''));
    const twitchers = files.filter((f) => f.endsWith('__twitch')).map((f) => f.replace(/__twitch$/, ''));
    expect(twitchers.length).toBeGreaterThan(40);
    for (const s of twitchers) expect(files, s).toContain(`${s}__fall`);
  });
});

describe('the camp at Cubbon (ADR-161)', () => {
  it('tents, a fire, a cot, crates, a drum and three lamp posts — pitched with the camp, never in the way', async () => {
    const { DISTRICTS, OBJECTS } = await import('../data');
    const camp = DISTRICTS.cubbon_park.objects!.filter((o) => o.requiresFlag === 'base_cubbon_set');
    expect(camp.map((o) => o.id).sort()).toEqual(['ARMY_COT', 'CAMPFIRE', 'CAMP_TENT_BLUE', 'CAMP_TENT_ORANGE', 'SUPPLY_CRATES', 'UV_LAMP_POST', 'UV_LAMP_POST', 'UV_LAMP_POST', 'WATER_DRUM_BLUE']);
    for (const o of camp) expect(OBJECTS[o.id]?.solid, o.id).toBe(false);
    // The lamp posts stand where the base's UV lamps are.
    const posts = camp.filter((o) => o.id === 'UV_LAMP_POST').map((o) => JSON.stringify(o.at));
    expect(posts.sort()).toEqual(DISTRICTS.cubbon_park.base!.uv.map((u) => JSON.stringify(u.at)).sort());
  });
});
