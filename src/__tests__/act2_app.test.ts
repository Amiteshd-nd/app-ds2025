import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { DIALOGUE, DISTRICTS, JODI_PROFILES, QUESTS, SCENES } from '../data';
import { buildPrereqState } from '../dev/prereq';
import { DialogueManager } from '../systems/DialogueManager';
import { jodiState, swipe } from '../systems/jodi';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { RelationshipManager } from '../systems/RelationshipManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { sleepEvents } from '../world/behaviours/sleepEvents';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  ReputationManager.resetInstance();
  DialogueManager.resetInstance();
  PhoneManager.resetInstance();
  RelationshipManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const dm = () => DialogueManager.getInstance();

describe('Jodi (story 2.6, ADR-134)', () => {
  it('cards come one at a time; LIKE on Tanvi is the match; LIKE on anyone else is not', () => {
    expect(JODI_PROFILES.map((p) => p.id)).toEqual(['sunsets', 'cofounder', 'cousin', 'tanvi']);
    expect(jodiState(JODI_PROFILES, 0, {})).toMatchObject({ kind: 'card', index: 0 });
    expect(swipe(JODI_PROFILES, 0, true)).toEqual({ index: 1, flags: [] });
    expect(swipe(JODI_PROFILES, 3, true)).toEqual({ index: 4, flags: ['tanvi_matched', 'jodi_decided'] });
    expect(jodiState(JODI_PROFILES, 4, { tanvi_matched: true }).kind).toBe('matched');
  });

  it('NOPE on everyone is the way out: the beat never happens', () => {
    let i = 0, flags: string[] = [];
    for (let k = 0; k < JODI_PROFILES.length; k++) ({ index: i, flags } = swipe(JODI_PROFILES, i, false));
    expect(flags).toEqual(['dating_declined', 'jodi_decided', 'app_settled']);
    expect(jodiState(JODI_PROFILES, i, {}).kind).toBe('empty');
    expect(jodiState(JODI_PROFILES, i, { jodi_gone: true }).kind).toBe('gone');
  });

  it('the app appears with Sameer\'s install and is gone after the next night', () => {
    const app = () => PhoneManager.getInstance().apps().find((a) => a.id === 'dating');
    expect(app()).toMatchObject({ name: 'Jodi', unlocked: false });
    const off = sleepEvents.attach({ district: DISTRICTS.hill_flat } as never) as () => void;
    store().setFlag('act2_ravi_done', true);
    TimeManager.getInstance().sleep();
    expect(app()?.unlocked).toBe(true);
    store().setFlag('app_settled', true);
    TimeManager.getInstance().sleep();
    off();
    expect(store().flags.jodi_gone).toBe(true);
    expect(app()).toBeUndefined();
  });
});

describe('the date and Sunday', () => {
  it('Tanvi waits at the café only after the match; coffee is ₹480, ₹240 or hers', () => {
    expect(DISTRICTS.church_street.npcs).toContainEqual({ id: 'npc_tanvi', spawn: 'cafe_table', requiresFlag: 'tanvi_matched', unlessFlag: 'tanvi_date_done' });
    const costs = DIALOGUE.dlg_tanvi.nodes.bill.choices!.map((c) => c.effect?.wallet ?? 0);
    expect(costs).toEqual([-480, -240, 0]);
  });

  it('every answer at the bandstand lands on strained; she leaves', () => {
    for (const answer of [0, 1, 2, 3]) {
      useGameStore.getState().reset();
      DialogueManager.resetInstance();
      store().setFlag('tanvi_date_done', true);
      dm().start('dlg_ananya');
      expect(dm().view().nodeId).toBe('sunday');
      dm().advance(); dm().advance();
      dm().choose(answer);
      expect(store().flags.ananya_strained).toBe(true);
      expect(store().relationships.npc_ananya).toBe('strained');
    }
    expect(DISTRICTS.cubbon_park.npcs?.find((n) => n.id === 'npc_ananya')?.unlessFlag).toBe('ananya_found_out');
  });

  it('Ananya\'s contact loses its line once strained', () => {
    store().setFlag('ananya_number', true);
    const note = () => PhoneManager.getInstance().contacts().find((c) => c.id === 'ananya')!.note;
    expect(note()).toBe('Cubbon Park · photographer');
    store().setFlag('ananya_strained', true);
    expect(note()).toBe('');
  });

  it('the Playground marks the places of earlier scenes as visited (Maps offers METRO there)', () => {
    const state = buildPrereqState('act2_the_app', Object.values(SCENES), { stats: store().stats, clock: { day: 1, minute: 600 } });
    expect(state.flags['visited:cubbon_park']).toBe(true);
    expect(state.flags['visited:church_street']).toBe(true);
    expect(state.clock.minute).toBe(600);
  });

  it('the scene is built and the quest follows Ravi\'s night', () => {
    expect(SCENES.act2_the_app.status).toBe('P15');
    expect(QUESTS.q_act2_the_app.prerequisite_quests).toEqual(['q_act2_ravi_1am']);
  });
});
