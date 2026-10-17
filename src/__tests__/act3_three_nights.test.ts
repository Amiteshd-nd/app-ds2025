import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { DISTRICTS, OBJECTS, PHONE_APPS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { signalAt } from '../ui/phone/viewModel';
import { bandFor } from '../audio/mix';
import { useGameStore } from '../store';
import { countdown, countdownText } from '../world/behaviours/countdown';
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
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const talk = (id: string): string[] => {
  const dm = DialogueManager.getInstance();
  const seen = [dm.start(id).nodeId];
  for (let i = 0; i < 10 && dm.view().canAdvance; i++) seen.push(dm.advance().nodeId);
  return seen;
};
const ward = DISTRICTS.ward4;

describe('the countdown comes back (story 3.4 F1, ADR-142)', () => {
  it('after the corridor, Sister Lalitha starts three nights; the plate counts them down to "today"', () => {
    store().setFlag('act3_corridor_done', true);
    expect(talk('dlg_ward_nurse')[0]).toBe('three_nights');
    DialogueManager.getInstance().end();
    expect(store().flags.ward_nights_started).toBe(true);
    const timers: Array<string | null> = [];
    gameEvents.on('ui:timer', ({ text }) => timers.push(text));
    const scene = { time: { delayedCall: (_ms: number, fn: () => void) => fn() } };
    const offs = [sleepEvents.attach({ district: ward } as never), countdown.attach({ scene, district: ward } as never)] as Array<() => void>;
    expect(timers[timers.length - 1]).toBe('Discharge · 3 nights');
    for (let i = 0; i < 3; i++) TimeManager.getInstance().sleep();
    expect(timers).toEqual(expect.arrayContaining(['Discharge · 2 nights', 'Discharge · 1 night', 'Discharge · today']));
    for (const off of offs) off();
    expect(timers[timers.length - 1]).toBeNull();
    expect(countdownText('Discharge', 1)).toBe('Discharge · 1 night');
  });

  it('the ward bed sleeps once the countdown has started', () => {
    expect(ward.triggers).toContainEqual({ zone: 'bed_zone', action: 'sleep', requiresFlag: 'ward_nights_started', once: false });
  });
});

describe('three mornings, each quieter (F2–F4)', () => {
  it('night 1: the curfew; night 2: Amma, the empty bed, the silent door, UPI "Server busy"; night 3: Ravi gone, no signal', () => {
    const off = sleepEvents.attach({ district: ward } as never) as () => void;
    store().setFlag('ward_nights_started', true);
    TimeManager.getInstance().sleep();
    expect(store().flags.wn_curfew).toBe(true);
    expect(PhoneManager.getInstance().news()[0].id).toBe('news_curfew');
    TimeManager.getInstance().sleep();
    for (const f of ['wn_amma', 'wn_server_busy', 'woman_gone', 'door_quiet']) expect(store().flags[f], f).toBe(true);
    expect(store().flags.ravi_gone).toBeUndefined();
    expect(signalAt('ward4', null)).toBe(1);
    TimeManager.getInstance().sleep();
    expect(store().flags.ravi_gone).toBe(true);
    expect(signalAt('ward4', null)).toBe(0);
    off();
  });

  it('who leaves, what appears: Ravi and the woman go; the stripped bed and the IV line appear over his bed', () => {
    expect(ward.npcs!.find((n) => n.id === 'npc_ravi_ward')!.unlessFlag).toBe('ravi_gone');
    expect(ward.npcs!.find((n) => n.id === 'npc_patient_woman')!.unlessFlag).toBe('woman_gone');
    expect(ward.objects).toEqual(expect.arrayContaining([
      { id: 'STRIPPED_BED', at: 'stripped_bed', requiresFlag: 'ravi_gone', exact: true },
      { id: 'IV_FLOOR', at: 'iv_floor', requiresFlag: 'ravi_gone', exact: true },
    ]));
    expect(OBJECTS.STRIPPED_BED.sprite).toBe('ward_props_01');
  });

  it('the door stops tapping from morning 2', () => {
    expect(ward.triggers!.find((t) => t.dialogue === 'dlg_sealed_door')!.unlessFlag).toBe('door_quiet');
    expect(ward.triggers!.find((t) => t.dialogue === 'dlg_sealed_quiet')!.requiresFlag).toBe('door_quiet');
  });

  it('Amma: two kind answers, neither a yes', () => {
    const dm = DialogueManager.getInstance();
    for (const i of [0, 1]) {
      store().reset();
      expect(dm.start('dlg_amma_come_home').choices).toHaveLength(2);
      dm.choose(i); dm.end();
      expect(store().flags.amma_home_answered).toBe(true);
    }
  });

  it('Ravi: his phone taken, then a cough; the nurse: "Moved. Another ward."', () => {
    store().setFlag('wn_curfew', true);
    expect(talk('dlg_ravi_ward')[0]).toBe('phone_taken');
    DialogueManager.getInstance().end();
    store().setFlag('wn_amma', true);
    expect(talk('dlg_ravi_ward')[0]).toBe('cough');
    DialogueManager.getInstance().end();
    store().setFlag('ravi_gone', true);
    expect(talk('dlg_ward_nurse')[0]).toBe('moved');
    DialogueManager.getInstance().end();
    expect(store().flags.nurse_ravi_moved).toBe(true);
  });

  it('UPI shows "Server busy" but payments still go through', () => {
    expect(PHONE_APPS.find((a) => a.id === 'upi')!.noticeIf).toEqual({ flag: 'wn_server_busy', text: 'Server busy. Try again later.' });
    store().setFlag('wn_server_busy', true);
    expect(StatsManager.getInstance().spend(20, 'tea', 'Ward tea')).toBe(true);
  });

  it('the ward sounds thinner night by night: the warning band by morning 2', () => {
    const at = (flags: string[]) => (ward.stabilityIf ?? []).filter((s) => flags.includes(s.flag)).pop()?.stability ?? 100;
    expect(bandFor(at([]))).toBe('normal');
    expect(bandFor(at(['wn_curfew']))).toBe('normal');
    expect(bandFor(at(['wn_curfew', 'wn_amma']))).toBe('warning');
  });
});

describe('the scene and its quest', () => {
  it('follows the corridor and completes on the nurse\'s answer', () => {
    expect(QUESTS.q_act3_three_nights.prerequisite_quests).toEqual(['q_act3_corridor']);
    store().setQuests({ active: {}, completed: ['q_act3_corridor'] });
    expect(QuestManager.getInstance().start('q_act3_three_nights')).toBe(true);
    for (const f of ['ward_nights_started', 'wn_curfew', 'wn_amma', 'amma_home_answered', 'ravi_gone', 'nurse_ravi_moved']) store().setFlag(f, true);
    expect(store().flags.act3_three_nights_done).toBe(true);
  });

  it('is built (P20) with no open questions', () => {
    expect(SCENES.act3_three_nights.status).toBe('P20');
    expect((SCENES.act3_three_nights as unknown as { open_questions: string[] }).open_questions).toEqual([]);
  });
});
