import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, SCENES } from '../data';
import { outcome, panelsFor } from '../systems/cards';
import { DialogueManager } from '../systems/DialogueManager';
import { myBangalore, myBangaloreLines } from '../systems/myBangalore';
import { useGameStore } from '../store';
import { SCENE_KEYS } from '../utils/constants';
import WALK from '../data/walkthroughs/act4_tunnel.json';

const store = () => useGameStore.getState();
const reset = () => { gameEvents.clear(); store().reset(); DialogueManager.resetInstance(); };
const steps = (flags: Record<string, boolean>) => {
  reset();
  for (const [f, v] of Object.entries(flags)) store().setFlag(f, v);
  const cards: string[] = [];
  const off = gameEvents.on('card:requested', ({ cardId }) => cards.push(cardId));
  const dm = DialogueManager.getInstance();
  const v = dm.start('dlg_majestic_steps');
  dm.choose(0); dm.end(); off();
  return { node: v.nodeId, card: cards[0] };
};
const titles = (id: string, flags: Record<string, boolean>) => panelsFor(CARDS[id], flags).map((p) => p.text);

describe('4.6 "The Tunnel" — the ending (ADR-158)', () => {
  beforeEach(reset);

  it('is built (P30): the last night goes down at Cubbon Park into the Purple Line', () => {
    expect(SCENES.act4_tunnel).toEqual(expect.objectContaining({ status: 'P30', seq: '4.6' }));
    expect(DISTRICTS.glass_house.triggers).toContainEqual({ zone: 'house_out', action: 'card', card: 'card_to_tunnel', requiresFlag: 'act4_ravi_done', unlessFlag: 'tunnel_in' });
    expect(CARDS.card_to_tunnel.then).toEqual(expect.objectContaining({ district: 'purple_tunnel', spawn: 'tunnel_east' }));
    expect(DISTRICTS.purple_tunnel.infected!.packs.every((p) => p.startMode === 'idle')).toBe(true);
  });

  it('at Majestic the table\'s choice plays: out, end it, or hold', () => {
    expect(steps({ path_evacuate: true })).toEqual({ node: 'start', card: 'card_ending_evacuate' });
    expect(steps({ path_fight: true })).toEqual({ node: 'fight', card: 'card_ending_groundzero' });
    expect(steps({ path_hold: true })).toEqual({ node: 'hold', card: 'card_ending_hold' });
  });

  it('every ending is a credits card that ends the game; each costs something', () => {
    for (const [id, flag] of [['card_ending_evacuate', 'ending_evacuate'], ['card_ending_hold', 'ending_hold'], ['card_ending_groundzero', 'ending_groundzero']] as const) {
      expect(CARDS[id].end).toBe('credits');
      expect(outcome(CARDS[id], {}).set).toEqual(expect.arrayContaining([flag, 'game_complete']));
    }
    expect(titles('card_ending_evacuate', {}).join(' ')).toContain('The others are still on the steps');
    expect(titles('card_ending_evacuate', { karthik_trust: true }).join(' ')).toContain('Nobody is left on the platform');
    expect(titles('card_ending_hold', {}).join(' ')).toContain("He doesn't come in.");
    expect(titles('card_ending_groundzero', { ravi_met_hivr: true, meera_keycard: true }).join(' ')).toContain("I'll open it. You close it.");
    expect(titles('card_ending_groundzero', { ravi_met_home: true }).join(' ')).toContain("Ravi's ID");
  });

  it('"My Bangalore": the run in numbers', () => {
    const m = myBangalore({ clock: { day: 41 }, counters: { act4_day: 16 }, met: ['a', 'b'], flags: { ending_hold: true, deepa_medicine: true, ananya_strained: true, photo_x: true }, transactions: [{ amount: -20, label: 'Chai Anna', reason: 'chai' }, { amount: -12, label: 'Mani', reason: 'Cutting chai' }, { amount: -300, label: 'Auto', reason: 'fare' }] });
    expect(m).toEqual({ daysInCity: 41, daysShut: 16, peopleMet: 2, chaiRupees: 32, photos: 1, keptAlive: ['Deepa'], ending: 'hold' });
    expect(myBangaloreLines(m)).toEqual(['41 days in Bangalore. 16 of them with the city shut.', '2 people you knew by name.', '₹32 on chai.', 'One City Moment photographed.', 'With you at the end: Deepa.', 'You held the glass house.']);
    expect(myBangaloreLines({ ...m, peopleMet: 0, chaiRupees: 0, photos: 0, keptAlive: [] })).toContain('Not a single chai.');
    expect(SCENE_KEYS.MY_BANGALORE).toBe('MyBangaloreScene');
  });

  it('the bot walks the tunnel and reaches the end card', () => {
    const s = WALK.steps as Array<{ do: string; target?: string; pace?: string; scene?: string }>;
    expect(s.some((x) => x.do === 'unresolved' || x.do === 'set_flag')).toBe(false);
    expect(s.find((x) => x.target === 'zone:majestic_steps')?.pace).toBe('walk');
    expect(s.some((x) => x.scene === 'MyBangaloreScene')).toBe(true);
  });
});
