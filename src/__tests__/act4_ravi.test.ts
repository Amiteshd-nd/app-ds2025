import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, SCENES } from '../data';
import { panelsFor } from '../systems/cards';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { PhoneManager } from '../systems/PhoneManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import RAVI_CHAT from '../data/phone/chats/ravi.json';
import QUEST_25 from '../data/quests/q_act2_ravi_1am.json';
import WALK from '../data/walkthroughs/act4_ravi.json';
import WALK_25 from '../data/walkthroughs/act2_ravi_1am.json';

const store = () => useGameStore.getState();
const reset = () => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear(); store().reset(); TimeManager.resetInstance(); StatsManager.resetInstance(); DialogueManager.resetInstance(); InventoryManager.resetInstance(); PhoneManager.resetInstance();
};
const pick = (id: string, text: string) => {
  const cards: string[] = [];
  const off = gameEvents.on('card:requested', ({ cardId }) => cards.push(cardId));
  const dm = DialogueManager.getInstance();
  let v = dm.start(id);
  const first = v.nodeId;
  while (v.canAdvance) v = dm.advance();
  v = dm.choose(v.choices.findIndex((c) => c.text.startsWith(text)));
  dm.end(); off();
  return { first, cards, node: v.nodeId };
};

describe('4.5 "Ravi" (ADR-157)', () => {
  beforeEach(reset);

  it('is built (P29) after the table; the message comes the night after it', () => {
    expect(SCENES.act4_ravi).toEqual(expect.objectContaining({ status: 'P29', seq: '4.5' }));
    expect(DISTRICTS.glass_house.sleepEvents).toContainEqual(expect.objectContaining({ after: 'ending_chosen', nights: 1, set: ['ravi_msg'] }));
    expect(RAVI_CHAT.messages.find((m) => m.id === 'ravi_5')!.after).toBe('ravi_msg');
  });

  it('the pin follows 2.5: supported → HIVR\'s quarantine block, left → a room in Yelahanka', () => {
    store().setFlag('ravi_msg', true);
    expect(pick('dlg_ravi_location', '(Go.)')).toEqual({ first: 'start', cards: ['card_to_yelahanka'], node: 'go' });
    reset();
    store().setFlag('ravi_supported', true);
    expect(pick('dlg_ravi_location', '(Go.)')).toEqual({ first: 'hivr', cards: ['card_to_hivr'], node: 'go' });
    expect(CARDS.card_to_hivr.then!.district).toBe('hivr_corridor');
    expect(CARDS.card_to_yelahanka.then!.district).toBe('yelahanka_room');
  });

  it('HIVR: he tells it once, Meera through the glass, her keycard; no infected in the corridor any more', () => {
    pick('dlg_ravi_hivr', '(Take the card');
    expect([store().flags.ravi_met_hivr, store().flags.ravi_met, InventoryManager.getInstance().has('meera_keycard')]).toEqual([true, true, true]);
    expect(DISTRICTS.hivr_corridor.infected!.packs[0].unlessFlag).toBe('base_cubbon_done');
    expect(DISTRICTS.hivr_corridor.npcs!.map((n) => n.id)).toEqual(['npc_ravi_hivr', 'npc_meera']);
  });

  it('Yelahanka: his mother asleep, tea, and his ID if you take it', () => {
    expect(pick('dlg_ravi_home', '(Leave it.)').node).toBe('bye');
    expect([store().flags.ravi_met_home, InventoryManager.getInstance().has('ravi_id')]).toEqual([true, false]);
    reset();
    pick('dlg_ravi_home', '(Take the ID');
    expect(InventoryManager.getInstance().has('ravi_id')).toBe(true);
    expect(DISTRICTS.yelahanka_room.npcs!.map((n) => n.id)).toEqual(['npc_ravi_home', 'npc_ravi_amma']);
    expect(DISTRICTS.yelahanka_room.infected).toBeUndefined();
  });

  it('the way back lands at the glass house and the voice note arrives', () => {
    expect(CARDS.card_ravi_back.then!.district).toBe('glass_house');
    expect(panelsFor(CARDS.card_ravi_back, {}).flatMap((p) => p.setFlags ?? [])).toContain('act4_ravi_done');
    store().setFlag('act4_ravi_done', true);
    expect(RAVI_CHAT.messages.find((m) => m.id === 'ravi_6')!.text).toContain('okay. okay.');
  });

  it('the bot sits with Ravi in 2.5 (the stub\'s default) — so the full run plays the HIVR branch', () => {
    expect(QUEST_25.objectives.find((o) => o.id === 'sit')).toEqual(expect.objectContaining({ target: 'ravi_sat', optional: true }));
    expect((WALK_25.steps as Array<{ option?: string }>).some((s) => s.option === 'sat')).toBe(true);
    const steps = WALK.steps as Array<{ do: string; target?: string }>;
    expect(steps.some((s) => s.target === 'npc:npc_ravi_hivr')).toBe(true);
    expect(steps.some((s) => s.do === 'unresolved' || s.do === 'set_flag')).toBe(false);
  });
});
