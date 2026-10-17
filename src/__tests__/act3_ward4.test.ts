import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, NPCS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { outcome } from '../systems/cards';
import { useGameStore } from '../store';
import { validateCards } from '../../scripts/validate-content';

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

describe('the landing (story 3.2 F1, ADR-137)', () => {
  it('the crash card lands in Ward 4 at 10:20 the next morning and wakes you with a cast', () => {
    expect(CARDS.card_orr_night.then).toEqual({ district: 'ward4', spawn: 'your_bed', nextDay: true, minute: 620 });
    expect(outcome(CARDS.card_orr_night, {}).set).toEqual(expect.arrayContaining(['ward_woke', 'wrist_cast']));
  });

  it('the ward slows you, has one bar, and no way out', () => {
    const w = DISTRICTS.ward4;
    expect(w.walkSpeed).toBe(0.7);
    expect(w.signal).toBe(1);
    expect(w.exits ?? []).toEqual([]);
    expect(w.triggers).toContainEqual({ zone: 'ward_exit', dialogue: 'dlg_ward_door' });
  });

  it('the phone: Amma, Divya, and Sameer on whichever bike went down', () => {
    for (const f of ['divya_called', 'act1_first_day_done', 'act3_started', 'amma_called', 'hotel_checked_in', 'pg_signed', 'flat_signed', 'slept_in_flat', 'cubbon_arrived', 'met_sameer', 'act1_done', 'first_salary', 'metro_open', 'ikea_planned', 'ikea_assembled', 'dating_installed', 'sameer_bike_wrecked', 'ward_woke']) store().setFlag(f, true);
    const ids = PhoneManager.getInstance().deliver({ quiet: true }).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['amma_ward', 'divya_ward', 'sameer_ward_bike']));
    expect(ids).not.toContain('sameer_ward_scooter');
  });
});

describe('Sister Lalitha (F2)', () => {
  it('remembers you only if you talked on the bus', () => {
    expect(NPCS.npc_ward_nurse.sheet).toBe('npc_nurse');
    expect(talk('dlg_ward_nurse')[0]).toBe('start');
    DialogueManager.getInstance().end();
    store().setFlag('nurse_heard', true);
    expect(talk('dlg_ward_nurse')[0]).toBe('remembers');
  });

  it('both answers end the conversation and set nurse_ward_met', () => {
    for (const i of [0, 1]) {
      store().reset();
      const dm = DialogueManager.getInstance();
      talk('dlg_ward_nurse');
      dm.choose(i);
      dm.end();
      expect(store().flags.nurse_ward_met).toBe(true);
    }
  });
});

describe('the isolation door (F3)', () => {
  it('tapping, then it stops; once seen, you do not wait for it', () => {
    expect(talk('dlg_sealed_door')).toEqual(['start', 'tap', 'stop']);
    DialogueManager.getInstance().end();
    expect(store().flags.sealed_section_seen).toBe(true);
    expect(talk('dlg_sealed_door')).toEqual(['again']);
  });
});

describe('Ravi (F4)', () => {
  it('three visits, each nearer the sentence; ravi_supported and ravi_left change one line', () => {
    const dm = DialogueManager.getInstance();
    expect(talk('dlg_ravi_ward')).toEqual(['start', 'loop1b', 'loop1_end']); dm.end();
    expect(talk('dlg_ravi_ward')).toEqual(['loop2', 'loop2_end']); dm.end();
    expect(talk('dlg_ravi_ward')).toEqual(['loop3', 'loop3b', 'loop3c']); dm.end();
    expect(store().flags.ravi_ward_talked).toBe(true);
    expect(talk('dlg_ravi_ward')).toEqual(['after']); dm.end();
    store().reset(); store().setFlag('ravi_supported', true);
    expect(talk('dlg_ravi_ward')[0]).toBe('loop1_supported'); dm.end();
    store().reset(); store().setFlag('ravi_left', true);
    expect(talk('dlg_ravi_ward')[0]).toBe('loop1_left');
  });

  it('lies in bed (a still sheet, no breathing)', () => {
    expect(NPCS.npc_ravi_ward).toEqual(expect.objectContaining({ sheet: 'npc_ravi_bed', breathing: false }));
  });
});

describe('the scene and its quest', () => {
  it('follows 3.1 and completes on Ravi\'s third visit', () => {
    expect(QUESTS.q_act3_ward4.prerequisite_quests).toEqual(['q_act3_orr']);
    store().setQuests({ active: {}, completed: ['q_act3_orr'] });
    expect(QuestManager.getInstance().start('q_act3_ward4')).toBe(true);
    for (const f of ['ward_woke', 'nurse_ward_met', 'sealed_section_seen', 'ravi_loop1', 'ravi_loop2', 'ravi_ward_talked']) store().setFlag(f, true);
    expect(store().flags.act3_ward4_done).toBe(true);
  });

  it('is built (P18) with no open questions', () => {
    expect(SCENES.act3_ward4.status).toBe('P18');
    expect((SCENES.act3_ward4 as unknown as { open_questions: string[] }).open_questions).toEqual([]);
  });

  it('a card landing must name a district that exists', () => {
    const problems = validateCards([{ file: 'c.json', basename: 'c', json: { id: 'c', panels: [{ text: 'a' }], then: { district: 'nowhere', spawn: 'x' } } }], [], new Set());
    expect(problems.join('\n')).toMatch(/then must name a district/);
  });
});
