import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, OBJECTS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { outcome, panelsFor } from '../systems/cards';
import { useGameStore } from '../store';
import { countdown } from '../world/behaviours/countdown';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  ReputationManager.resetInstance();
  DialogueManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const ward = DISTRICTS.ward4;

describe('the slip and the warning (story 3.5 F1–F2, ADR-143)', () => {
  it('after "Moved", Sister Lalitha signs you out; "Why five?" gets no answer; both choices end the same', () => {
    const dm = DialogueManager.getInstance();
    for (const i of [0, 1]) {
      store().reset();
      store().setFlag('nurse_ravi_moved', true);
      expect(dm.start('dlg_ward_nurse').nodeId).toBe('sign_out');
      expect(dm.advance().nodeId).toBe('five');
      expect(store().flags.discharged).toBe(true);
      expect(dm.view().text).toBe("Go home. Stay inside. Don't make noise after five.");
      const view = dm.choose(i);
      expect(view.nodeId).toBe(i === 0 ? 'why' : 'okay');
      dm.end();
      expect(store().flags.five_warning).toBe(true);
    }
    // No ritual hint: nobody explains (4.1 does).
    expect(JSON.stringify(dm.start('dlg_ward_nurse'))).not.toMatch(/plate|spoon|solidarity/i);
  });

  it('the countdown plate goes once you are discharged', () => {
    const timers: Array<string | null> = [];
    gameEvents.on('ui:timer', ({ text }) => timers.push(text));
    store().setFlag('ward_nights_started', true);
    const off = countdown.attach({ scene: { time: { delayedCall: (_ms: number, fn: () => void) => fn() } }, district: ward } as never) as () => void;
    store().setFlag('discharged', true);
    expect(timers[timers.length - 1]).toBeNull();
    off();
  });
});

describe('the ward lets you go (F3–F4)', () => {
  it('the isolation doors open on an empty room; the ward boy\'s chair is empty', () => {
    expect(ward.objects).toEqual(expect.arrayContaining([
      { id: 'ISOLATION_OPEN', at: 'isolation_open', requiresFlag: 'discharged', exact: true },
      { id: 'BOY_CHAIR', at: 'boy_chair', requiresFlag: 'discharged', exact: true },
    ]));
    expect(OBJECTS.ISOLATION_OPEN.sprite).toBe('discharge_props_01');
    expect(ward.triggers).toContainEqual({ zone: 'sealed_zone', dialogue: 'dlg_sealed_open', requiresFlag: 'discharged', unlessFlag: 'act4' });
    expect([ward.triggers!.find((t) => t.dialogue === 'dlg_sealed_quiet')!.unlessFlag].flat()).toContain('discharged');
  });

  it('the ward door: "Not discharged" until the slip; then the leaving card, ACT 4 — CURFEW, and it lands at the hospital gate (4.0, ADR-148)', () => {
    expect(ward.triggers!.find((t) => t.dialogue === 'dlg_ward_door')!.unlessFlag).toBe('discharged');
    // In Act 4 the ward door is the walk home instead (4.3, ADR-152).
    expect(ward.triggers).toContainEqual({ zone: 'ward_exit', action: 'card', card: 'card_leaving_ward', requiresFlag: 'discharged', unlessFlag: 'act4' });
    const card = CARDS.card_leaving_ward;
    const panels = panelsFor(card, {});
    expect(panels[panels.length - 1]).toEqual(expect.objectContaining({ style: 'title', title: 'CURFEW' }));
    expect(card.then).toEqual({ district: 'hebbal_gate', spawn: 'hospital_steps', minute: 510 });
    expect(outcome(card, {}).set).toEqual(['act3_done', 'act4', 'janata_out']);
  });

  it('the cast stays on into Act 4', () => {
    expect(ward.walkSpeed).toBe(0.7);
  });
});

describe('the scene and its quest', () => {
  it('follows the three nights and completes as you leave', () => {
    expect(QUESTS.q_act3_discharge.prerequisite_quests).toEqual(['q_act3_three_nights']);
    store().setQuests({ active: {}, completed: ['q_act3_three_nights'] });
    expect(QuestManager.getInstance().start('q_act3_discharge')).toBe(true);
    for (const f of ['discharged', 'five_warning', 'act3_done']) store().setFlag(f, true);
    expect(store().flags.act3_discharge_done).toBe(true);
  });

  it('is built (P21) with no open questions', () => {
    expect(SCENES.act3_discharge.status).toBe('P21');
    expect((SCENES.act3_discharge as unknown as { open_questions: string[] }).open_questions).toEqual([]);
  });
});
