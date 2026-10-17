import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CHATS, DISTRICTS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { exitRuns, fareAt, isNight, nightDepth, NIGHT_END, NIGHT_START } from '../systems/night';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { WAKE_MINUTE } from '../utils/constants';
import { BEHAVIOURS, CORE_BEHAVIOURS } from '../world/behaviours';
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
const dm = () => DialogueManager.getInstance();
const pick = (text: string) => {
  const i = dm().view().choices.findIndex((c) => c.text.startsWith(text));
  if (i < 0) throw new Error(`no choice "${text}"`);
  return i;
};
const toChoice = () => { dm().start('dlg_ravi_intro'); for (let i = 0; i < 4; i++) dm().advance(); };

describe('night (story 2.5, ADR-133)', () => {
  it('runs 23:00 to 05:30; buses stop, night-only exits wake, autos double after midnight', () => {
    expect(isNight(NIGHT_START)).toBe(true);
    expect(isNight(NIGHT_END)).toBe(false);
    expect(isNight(12 * 60)).toBe(false);
    expect(exitRuns({ transit: 'bus' }, 50)).toBe(false);
    expect(exitRuns({ transit: 'bus' }, 9 * 60)).toBe(true);
    expect(exitRuns({ transit: 'auto', onlyAt: 'night' }, 50)).toBe(true);
    expect(exitRuns({ transit: 'auto', onlyAt: 'night' }, 9 * 60)).toBe(false);
    expect(exitRuns({ transit: 'auto', onlyAt: 'day' }, 50)).toBe(false);
    expect(fareAt({ transit: 'auto', fare: 80 }, 50)).toBe(160);
    expect(fareAt({ transit: 'auto', fare: 80 }, 23 * 60 + 30)).toBe(80); // before midnight: day meter
    expect(fareAt({ transit: 'bus', fare: 20 }, 50)).toBe(20);
  });

  it('the night look ramps in over half an hour and is a core behaviour of every district', () => {
    expect(nightDepth(22 * 60)).toBe(0);
    expect(nightDepth(NIGHT_START + 15)).toBeCloseTo(0.5);
    expect(nightDepth(60)).toBe(1);
    expect(nightDepth(NIGHT_END)).toBe(0);
    expect(CORE_BEHAVIOURS).toContain('nightLook');
    expect(BEHAVIOURS.nightLook).toBeDefined();
  });

  it('bed after midnight wakes you the same morning, not the one after', () => {
    store().setClock({ day: 4, minute: 3 * 60 });
    expect(TimeManager.getInstance().sleep()).toEqual({ day: 4, minute: WAKE_MINUTE });
    store().setClock({ day: 4, minute: 22 * 60 });
    expect(TimeManager.getInstance().sleep()).toEqual({ day: 5, minute: WAKE_MINUTE });
  });

  it('the hill road and the office auto stand each carry a night-only auto; the office crowd goes home at night', () => {
    expect(DISTRICTS.ambedkar_nagar_hill.exits).toContainEqual(expect.objectContaining({ zone: 'road_out', to: 'office_gate', transit: 'auto', onlyAt: 'night' }));
    const stand = DISTRICTS.office_gate.exits!.filter((e) => e.zone === 'auto_stand');
    expect(stand.map((e) => [e.to, e.onlyAt])).toEqual([['whitefield_street', 'day'], ['ambedkar_nagar_hill', 'night']]);
    const day = DISTRICTS.office_gate.npcs!.filter((n) => n.onlyAt === 'day').map((n) => n.id).sort();
    expect(day).toEqual(['npc_divya', 'npc_prakash', 'npc_sameer']);
  });
});

describe('Ravi, 1 AM', () => {
  it('the first sleep after the IKEA run wakes you at 00:50 with his message, in a power cut', () => {
    const flat = DISTRICTS.hill_flat;
    const off = sleepEvents.attach({ district: flat } as never) as () => void;
    store().setFlag('act2_ikea_done', true);
    TimeManager.getInstance().sleep();
    expect(store().clock.minute).toBe(50);
    expect(store().flags.ravi_called).toBe(true);
    expect(store().flags.power_cut).toBe(true);
    off();
    const msg = CHATS.ravi.messages.find((m) => m.after === 'ravi_called')!;
    expect(msg.critical).toBe(true);
  });

  it('sit and give can both happen; sitting costs an hour and stress; giving costs ₹2,000', () => {
    store().setFlag('ravi_called', true);
    store().setClock({ day: 3, minute: 60 });
    const wallet = store().stats.wallet, stress = store().stats.stress;
    toChoice();
    dm().choose(pick("I'll sit"));
    expect(store().clock.minute).toBe(120);
    expect(store().stats.stress).toBe(stress + 5);
    expect(store().flags.ravi_supported).toBe(true);
    dm().choose(pick('Take this'));
    expect(store().stats.wallet).toBe(wallet - 2000);
    expect(dm().view().choices.find((c) => c.text.startsWith("I'll sit"))).toMatchObject({ enabled: false });
    dm().choose(pick('Get some sleep'));
    expect(store().flags.ravi_decided).toBe(true);
    expect(store().flags.ravi_left).toBeUndefined();
  });

  it('leaving ends it — no support, and no morning message', () => {
    store().setFlag('ravi_called', true);
    toChoice();
    dm().choose(pick('I have work tomorrow'));
    expect(store().flags.ravi_left).toBe(true);
    expect(store().flags.ravi_decided).toBe(true);
    expect(store().flags.ravi_supported).toBeUndefined();
    const flat = DISTRICTS.hill_flat;
    const off = sleepEvents.attach({ district: flat } as never) as () => void;
    store().setFlag('act2_ikea_done', true);
    store().setFlag('ravi_called', true);
    TimeManager.getInstance().sleep();
    off();
    expect(store().flags.ravi_night_over).toBe(true);
    expect(store().flags.power_cut).toBe(false);
    expect(store().flags.ravi_thanked).toBeUndefined();
  });

  it('the scene is built, starts at 00:50 in the flat, and the quest follows the IKEA run', () => {
    expect(SCENES.act2_ravi_1am.status).toBe('P14');
    expect(SCENES.act2_ravi_1am.time).toMatch(/^00:50/);
    expect(QUESTS.q_act2_ravi_1am.prerequisite_quests).toEqual(['q_act2_ikea']);
  });
});
