import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { DISTRICTS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { nightsKey, sleepEvents } from '../world/behaviours/sleepEvents';

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
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const sleepNights = (n: number) => { for (let i = 0; i < n; i++) TimeManager.getInstance().sleep(); };

describe('four mornings of news (story 2.7, ADR-135)', () => {
  it('each night in the flat after 2.6 adds one headline; Sameer is off on nights 2–3 and back on 4', () => {
    const off = sleepEvents.attach({ district: DISTRICTS.hill_flat } as never) as () => void;
    store().setFlag('act2_app_done', true);
    const headlines = () => PhoneManager.getInstance().news().map((n) => n.id);
    sleepNights(1);
    expect(store().flags.news_taught).toBe(true);
    expect(headlines()).toEqual(['news_fever']);
    sleepNights(1);
    expect(headlines()).toEqual(['news_denial', 'news_fever']); // newest first
    expect(store().flags.sameer_sick).toBe(true);
    sleepNights(1);
    expect(store().flags.bc_sealed).toBe(true);
    expect(store().flags.bc_schools).toBeUndefined();
    sleepNights(1);
    expect(headlines()[0]).toBe('news_schools');
    expect(store().flags.sameer_sick).toBe(false);
    expect(store().flags.sameer_back).toBe(true);
    expect(store().counters[nightsKey('act2_app_done')]).toBe(4);
    off();
  });

  it('nights only count once their flag is set', () => {
    const off = sleepEvents.attach({ district: DISTRICTS.hill_flat } as never) as () => void;
    sleepNights(3);
    expect(store().counters[nightsKey('act2_app_done')]).toBeUndefined();
    store().setFlag('act2_app_done', true);
    sleepNights(1);
    expect(store().flags.bc_fever).toBe(true);
    expect(store().flags.bc_denial).toBeUndefined();
    off();
  });
});

describe('the office and home', () => {
  it('Sameer coughs, disappears while sick, comes back pale', () => {
    const ref = DISTRICTS.office_gate.npcs!.find((n) => n.id === 'npc_sameer')!;
    expect(ref.unlessFlag).toBe('sameer_sick');
    const dm = DialogueManager.getInstance();
    store().setFlag('met_sameer', true);
    store().setFlag('bc_fever', true);
    dm.start('dlg_sameer_intro');
    expect(dm.view().nodeId).toBe('coughing');
    dm.end();
    store().setFlag('sameer_back', true);
    dm.start('dlg_sameer_intro');
    expect(dm.view().nodeId).toBe('back_pale');
  });

  it('the office door on the denial day sets the AMR-07 clue and Divya writes; the guard salutes once, on the sealed day', () => {
    const t = DISTRICTS.office_gate.triggers!;
    expect(t).toContainEqual({ zone: 'office_door', setFlags: ['clue_amr07'], requiresFlag: 'bc_denial', unlessFlag: 'clue_amr07' });
    expect(t).toContainEqual({ zone: 'office_arrival', dialogue: 'dlg_guard_salute', requiresFlag: 'bc_sealed', unlessFlag: 'guard_salute_seen' });
  });

  it('Amma\'s call closes Act 2 on the next sleep', () => {
    const off = sleepEvents.attach({ district: DISTRICTS.hill_flat } as never) as () => void;
    const dm = DialogueManager.getInstance();
    dm.start('dlg_amma_worried');
    dm.choose(0);
    expect(store().flags.amma_worried_called).toBe(true);
    sleepNights(1);
    expect(store().flags.act2_done).toBe(true);
    off();
  });

  it('the scene is built and follows The App', () => {
    expect(SCENES.act2_breadcrumbs.status).toBe('P16');
    expect(QUESTS.q_act2_breadcrumbs.prerequisite_quests).toEqual(['q_act2_the_app']);
  });
});
