import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { ITEMS, getDialogue } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { COMBAT, knockback, landing, lureFor, readied, readyFlag, smokeBlocks, stunFor, swingHits, weaponFor } from '../systems/combat';
import { ENERGY, energy, resetEnergy, spendPips } from '../systems/energy';
import { INFECTED, brain, chaseSpeed, stun, think, type Point, type Senses } from '../systems/infected';
import { BAG_SLOTS, InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { act4Buttons, touchLayout } from '../ui/hud/layout';
import { tapZone } from '../ui/kit/molecules';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../utils/constants';
import { CORE_BEHAVIOURS } from '../world/behaviours';
import { validateCombat } from '../../scripts/validate-content';
import COMBAT_JSON from '../data/infected/combat.json';

const reset = () => { useGameStore.getState().reset(); DialogueManager.resetInstance(); InventoryManager.resetInstance(); StatsManager.resetInstance(); gameEvents.clear(); };
const inv = () => InventoryManager.getInstance();
const act4 = () => useGameStore.getState().setFlag('act4', true);
const T = TILE_SIZE;

describe('the swing (ADR-48, ADR-151)', () => {
  it('you swing the best you carry: UV torch, then the bat, then the knife, else a shove', () => {
    expect(weaponFor(() => false).id).toBe('shove');
    expect(weaponFor((id) => id === 'kitchen_knife' || id === 'cricket_bat').id).toBe('cricket_bat');
    expect(weaponFor(() => true).id).toBe('uv_torch');
    expect(weaponFor(() => true).noiseTiles).toBeLessThan(COMBAT.weapons.cricket_bat.noiseTiles);
  });

  it('hits only ahead and in reach, nearest first, up to the weapon\'s count', () => {
    const me: Point = [100, 100];
    const ahead1: Point = [100 + T, 100], ahead2: Point = [100 + 1.4 * T, 100 + 8], behind: Point = [100 - T, 100], far: Point = [100 + 3 * T, 100];
    const shove = weaponFor(() => false), bat = weaponFor((id) => id === 'cricket_bat');
    expect(swingHits(me, 'right', shove, [behind, far, ahead2, ahead1])).toEqual([3]);
    expect(swingHits(me, 'right', bat, [behind, far, ahead2, ahead1])).toEqual([3, 2]);
    expect(swingHits(me, 'left', bat, [behind, far, ahead2, ahead1])).toEqual([0]);
  });

  it('a stun is 2 s with a weapon, 1 s with your hands, half for the Evolved; never a kill', () => {
    const bat = weaponFor((id) => id === 'cricket_bat');
    expect(stunFor(bat, false)).toBe(2000);
    expect(stunFor(weaponFor(() => false), false)).toBe(1000);
    expect(stunFor(bat, true)).toBe(1000);
    for (const w of Object.values(COMBAT.weapons)) expect(w.stunMs).toBeLessThanOrEqual(5000);
  });

  it('knocks them back along the line from you', () => {
    expect(knockback([0, 0], [T, 0], 1.5)).toEqual([2.5 * T, 0]);
  });

  it('costs a pip; empty, you cannot swing', () => {
    resetEnergy(3);
    expect(spendPips(1)).toBe(true);
    expect(energy.pips).toBe(2);
    resetEnergy(1);
    expect(spendPips(1)).toBe(true);
    expect(energy.exhausted).toBe(ENERGY.exhaustedMs);
    expect(spendPips(1)).toBe(false);
  });
});

describe('stunned, then angry (act4 doc §4)', () => {
  const senses = (o: Partial<Senses> = {}): Senses => ({ dt: 100, sees: false, player: [0, 0], heard: null, packAlert: false, atTarget: false, night: false, ...o });
  const rng = () => 0.5;

  it('down for the stun, then straight back at you, faster for 5 s', () => {
    const b = brain('chase');
    stun(b, 2000);
    let i = think(b, senses({ dt: 1900, sees: true }), rng, () => null);
    expect(b.mode).toBe('stunned');
    expect(i.speed).toBe(0);
    i = think(b, senses({ dt: 200, sees: true, player: [50, 50] }), rng, () => null);
    expect(b.mode).toBe('chase');
    i = think(b, senses({ dt: 16, sees: true, player: [50, 50] }), rng, () => null);
    expect(i.speed).toBeCloseTo(chaseSpeed('degraded', false) * COMBAT.stunned.angrySpeed);
    think(b, senses({ dt: 5000, sees: true, player: [50, 50] }), rng, () => null);
    i = think(b, senses({ dt: 16, sees: true, player: [50, 50] }), rng, () => null);
    expect(i.speed).toBeCloseTo(chaseSpeed('degraded', false));
  });
});

describe('throws: lures and smoke (the spec\'s escape valves)', () => {
  const senses = (o: Partial<Senses> = {}): Senses => ({ dt: 16, sees: false, player: [0, 0], heard: null, packAlert: false, atTarget: false, night: false, ...o });
  const rng = () => 0.5;

  it('lands at range or short of the first wall', () => {
    expect(landing([0, 0], 'right', 5, () => true)).toEqual([5 * T, 0]);
    expect(landing([0, 0], 'down', 5, (p) => p[1] < 2 * T)).toEqual([0, 1.75 * T]);
    expect(landing([0, 0], 'up', 5, () => false)).toBeNull();
  });

  it('a lure pulls the wanderers, the pack in cover and the searchers — and a chaser that lost you', () => {
    const lure: Point = [300, 0];
    for (const mode of ['wander', 'idle', 'search'] as const) {
      const b = brain(mode);
      const i = think(b, senses({ lure }), rng, () => [5, 5]);
      expect(i.target, mode).toEqual(lure);
    }
    const c = brain('chase');
    c.lastSeen = [10, 10];
    expect(think(c, senses({ lure }), rng, () => null).target).toEqual(lure);
    // It still sees you: you win over the noise.
    const d = brain('chase');
    expect(think(d, senses({ lure, sees: true, player: [20, 20] }), rng, () => null).target).toEqual([20, 20]);
  });

  it('only within its pull, only while it sounds; the newest wins', () => {
    const lures = [{ at: [0, 0] as Point, pull: 100, until: 1000 }, { at: [50, 0] as Point, pull: 100, until: 500 }];
    expect(lureFor([10, 0], lures, 100)).toEqual([50, 0]);
    expect(lureFor([10, 0], lures, 600)).toEqual([0, 0]);
    expect(lureFor([500, 0], lures, 100)).toBeNull();
    expect(lureFor([10, 0], lures, 1000)).toBeNull();
  });

  it('smoke between you breaks the line of sight (and standing in it hides you)', () => {
    const cloud = [{ at: [100, 0] as Point, r: 2 * T, until: 1000 }];
    expect(smokeBlocks([0, 0], [200, 0], cloud, 0)).toBe(true);
    expect(smokeBlocks([0, 200], [200, 200], cloud, 0)).toBe(false);
    expect(smokeBlocks([100, 10], [300, 300], cloud, 0)).toBe(true);
    expect(smokeBlocks([0, 0], [200, 0], cloud, 1000)).toBe(false);
  });

  it('every throw is a craftable or found consumable; the noise maker pulls 8 s (the spec)', () => {
    expect(COMBAT.throws.noise_maker).toEqual(expect.objectContaining({ kind: 'lure', ms: 8000 }));
    expect(COMBAT.throws.smoke_bomb.kind).toBe('smoke');
    for (const id of Object.keys(COMBAT.throws)) expect(ITEMS[id].type).toBe('consumable');
  });
});

describe('the bag: 8 slots in Act 4 (game_components §5)', () => {
  beforeEach(reset);

  it('before Act 4 it holds anything; in Act 4 a new kind needs a free slot, key items ride free', () => {
    const kinds = ['bottle', 'cloth', 'stones', 'steel_tumbler', 'food_packet', 'canned_food', 'batteries', 'uv_led', 'fuel_can'];
    for (const id of kinds) expect(inv().add(id)).toBe(true);
    reset(); act4();
    for (const id of kinds.slice(0, BAG_SLOTS)) expect(inv().add(id), id).toBe(true);
    expect(inv().add('fuel_can')).toBe(false);
    expect(inv().add('bottle')).toBe(true);
    expect(inv().add('guitar')).toBe(true);
    expect(inv().slotsUsed()).toBe(BAG_SLOTS);
  });

  it('a trade or recipe that would not fit is locked "No room in the bag"', () => {
    act4();
    for (const id of ['bottle', 'cloth', 'stones', 'steel_tumbler', 'canned_food', 'batteries', 'uv_led', 'laptop']) inv().add(id);
    expect(inv().fits({ smoke_bomb: 1 }, { bottle: 1, cloth: 1 })).toBe(true);
    // A second bottle and cloth: both stay in the bag after the recipe, so the smoke bomb needs a ninth slot.
    inv().add('bottle'); inv().add('cloth');
    expect(inv().fits({ smoke_bomb: 1 }, { bottle: 1, cloth: 1 })).toBe(false);
    const v = DialogueManager.getInstance().start('craft:bench');
    expect(v.choices[0]).toEqual(expect.objectContaining({ enabled: false, lockedReason: 'No room in the bag' }));
  });

  it('the bag opens as a conversation: slots counted, eat, ready a throw, leave a stack', () => {
    act4();
    inv().add('food_packet', 2); inv().add('noise_maker'); inv().add('smoke_bomb'); inv().add('cricket_bat'); inv().add('guitar');
    const dm = DialogueManager.getInstance();
    let v = dm.start('bag:');
    expect(v.text).toBe('Your bag: 4 of 8 slots. Plus Acoustic guitar, which takes no slot.');
    expect(v.choices.map((c) => c.text)).toEqual(['Food packet ×2', 'Noise maker', 'Smoke bomb', 'Cricket bat (in hand)', 'Close.']);
    const used: string[] = [];
    gameEvents.on('item:used', ({ itemId }) => used.push(itemId));
    const food = useGameStore.getState().stats.food;
    v = dm.choose(0);
    v = dm.choose(v.choices.findIndex((c) => c.text === 'Eat it.'));
    expect(used).toEqual(['food_packet']);
    expect(inv().count('food_packet')).toBe(1);
    expect(useGameStore.getState().stats.food).toBeGreaterThan(food - 1);
    dm.end();
    v = dm.start('bag:');
    v = dm.choose(1);
    dm.choose(v.choices.findIndex((c) => c.text === 'Ready it to throw.'));
    dm.end();
    expect(readied(useGameStore.getState().flags, (id) => inv().has(id))).toBe('noise_maker');
    v = dm.start('bag:');
    v = dm.choose(2);
    dm.choose(v.choices.findIndex((c) => c.text === 'Ready it to throw.'));
    dm.end();
    const flags = useGameStore.getState().flags;
    expect([flags[readyFlag('noise_maker')], flags[readyFlag('smoke_bomb')]]).toEqual([false, true]);
    v = dm.start('bag:');
    expect(v.choices[1].text).toBe('Noise maker');
    v = dm.choose(0);
    dm.choose(v.choices.findIndex((c) => c.text === 'Leave it here.'));
    expect(inv().has('food_packet')).toBe(false);
  });

});

describe('the bag before Act 4', () => {
  beforeEach(reset);
  it('lists, and lets you drink — nothing else', () => {
    inv().add('water_bottle');
    const file = getDialogue('bag:', {}, { inventory: useGameStore.getState().inventory, flags: {} });
    expect(file.nodes.start.text).toBe('Your bag.');
    expect(file.nodes.item_water_bottle.choices!.map((c) => c.text)).toEqual(['Drink it.', 'Back.']);
  });
});

describe('the touch hands and the wiring', () => {
  it('HIT, BAG and THROW sit on screen beside A, every zone ≥ 44 px, none overlapping (both thumbs)', () => {
    for (const side of ['left', 'right'] as const) {
      const { action } = touchLayout(side);
      const b = act4Buttons(action, side === 'left' ? 'right' : 'left');
      const zones = [tapZone(action.x, action.y, action.size, action.size), ...Object.values(b).map((x) => tapZone(x.x, x.y, x.size, x.size))];
      for (const z of zones) expect(z.x >= 0 && z.y >= 0 && z.x + z.w <= GAME_WIDTH && z.y + z.h <= GAME_HEIGHT, `${side} ${JSON.stringify(z)}`).toBe(true);
      for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i], c = zones[j];
        expect(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y, `${side} ${i}/${j}`).toBe(true);
      }
    }
  });

  it('every place gets your hands without listing them', () => {
    expect(CORE_BEHAVIOURS).toContain('act4Hands');
  });

  it('the validator catches a throw that is not an item and a stun that kills', () => {
    const bad = structuredClone(COMBAT_JSON) as unknown as { throws: Record<string, unknown>; weapons: Record<string, { stunMs: number }> };
    bad.throws.brick = { kind: 'lure', rangeTiles: 4, ms: 1000, pullTiles: 4, cue: 'a.sfx.combat.swing' };
    bad.weapons.cricket_bat.stunMs = 60000;
    const items = [{ file: 'act4.json', basename: 'act4', json: Object.values(ITEMS) }];
    const tokens = new Set(['a.sfx.combat.swing', 'a.sfx.combat.block', 'a.sfx.combat.hit_plate', 'a.sfx.combat.hit_pipe', 'a.sfx.world.torch_click', 'a.sfx.pulse.glass_break_distant', 'a.sfx.world.glass_tap', 'a.sfx.combat.pulse_fire', 'a.sfx.combat.pulse_empty', 'a.sfx.infected.fall']);
    expect(validateCombat(COMBAT_JSON, items, tokens)).toEqual([]);
    const p = validateCombat(bad, items, tokens);
    expect(p.some((x) => x.includes('"brick"'))).toBe(true);
    expect(p.some((x) => x.includes('over 5 s'))).toBe(true);
  });

  it('the infected numbers S2 set are untouched (a stun is its own mode)', () => {
    expect(INFECTED.recoverMs).toBe(1000);
  });
});
