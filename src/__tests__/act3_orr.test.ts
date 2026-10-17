import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { duration, outcome, panelsFor } from '../systems/cards';
import { useGameStore } from '../store';
import { sleepEvents } from '../world/behaviours/sleepEvents';
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
const night = CARDS.card_orr_night;

describe('the first morning of Act 3 (story 3.1 F1, ADR-136)', () => {
  it('the sleep after Amma\'s call ends Act 2 and opens on ACT 3 — FEVER, Divya\'s chat and a fifth headline', () => {
    const playCard = vi.fn();
    const off = sleepEvents.attach({ district: DISTRICTS.hill_flat, playCard } as never) as () => void;
    // An on-time first day (no "Where are you?"): Divya's later messages still arrive.
    for (const f of ['divya_called', 'on_time_first_day', 'act1_first_day_done', 'amma_worried_called']) store().setFlag(f, true);
    TimeManager.getInstance().sleep();
    expect(store().flags.act2_done).toBe(true);
    expect(store().flags.act3_started).toBe(true);
    expect(playCard).toHaveBeenCalledWith('card_act3_title');
    expect(PhoneManager.getInstance().news()[0].id).toBe('news_second_ward');
    PhoneManager.getInstance().deliver({ quiet: true });
    const divya = PhoneManager.getInstance().threadsView().find((t) => t.thread.id === 'divya')!;
    expect(divya.messages.map((m) => m.id)).toContain('divya_hivr');
    // Only once.
    TimeManager.getInstance().sleep();
    expect(playCard).toHaveBeenCalledTimes(1);
    off();
  });

  it('the title card is a title on black', () => {
    expect(CARDS.card_act3_title.panels).toEqual([expect.objectContaining({ style: 'title', title: 'FEVER', text: 'ACT 3' })]);
  });
});

describe('Divya sends you to Hebbal (F2)', () => {
  it('in Act 3 she opens on the HIVR job and sets hivr_assigned; then "go"; after the visit, "good"', () => {
    const dm = DialogueManager.getInstance();
    store().setFlag('act1_first_day_done', true);
    store().setFlag('act3_started', true);
    dm.start('dlg_divya_monday');
    expect(dm.view().nodeId).toBe('hivr');
    dm.advance();
    expect(dm.view().nodeId).toBe('hivr_2');
    dm.end();
    expect(store().flags.hivr_assigned).toBe(true);
    dm.start('dlg_divya_monday');
    expect(dm.view().nodeId).toBe('hivr_again');
    dm.end();
    store().setFlag('hivr_site_visit', true);
    dm.start('dlg_divya_monday');
    expect(dm.view().nodeId).toBe('after_hivr');
  });

  it('once she has sent you, the office door plays the card instead of the workday', () => {
    const t = DISTRICTS.office_gate.triggers!;
    expect(t.find((x) => x.action === 'workday')!.unlessFlag).toBe('hivr_assigned');
    expect(t).toContainEqual({ zone: 'office_door', action: 'card', card: 'card_orr_night', requiresFlag: 'hivr_assigned', unlessFlag: 'hivr_site_visit' });
  });
});

describe('the HIVR day and the ride home (F2–F4)', () => {
  it('with your scooter: the clue, the crash, the scooter wrecked, Ravi recognised, 23:55', () => {
    const out = outcome(night, { scooter_owned: true });
    expect(out.set).toEqual(expect.arrayContaining(['hivr_site_visit', 'clue_amr07_time', 'orr_crash', 'scooter_wrecked', 'ravi_recognised']));
    expect(out.set).not.toContain('sameer_bike_lent');
    expect(out.clear).toEqual(['hivr_assigned', 'scooter_owned']); // the office door gets its workday back
    expect(out.clockAt).toBe(23 * 60 + 55);
  });

  it('without one: Sameer lends his bike in the morning, and it is his bike that goes down', () => {
    const panels = panelsFor(night, {});
    expect(panels[0].text).toContain('mirror on');
    const out = outcome(night, {});
    expect(out.set).toEqual(expect.arrayContaining(['sameer_bike_lent', 'orr_crash', 'sameer_bike_wrecked', 'ravi_recognised']));
    expect(out.set).not.toContain('scooter_wrecked');
    expect(out.clear).toEqual(['hivr_assigned']);
  });

  it('exactly one cut, over the junction still; the fragments end on the lanyard and APPA; it holds on Ravi', () => {
    const panels = panelsFor(night, { scooter_owned: true });
    const cuts = panels.filter((p) => p.style === 'cut');
    expect(cuts).toHaveLength(1);
    expect(cuts[0].still).toBe('still_hebbal_night');
    const fragments = panels.filter((p) => p.style === 'fragment').map((p) => p.text).join(' ');
    expect(fragments).toContain('green lanyard');
    expect(fragments).toContain('APPA');
    expect(night.end).toBe('hold');
    expect(panels[panels.length - 1].title).toBe('Ravi.');
    expect(duration(night, {})).toBeGreaterThan(30000);
  });
});

describe('the scene and its quest', () => {
  it('starts after Breadcrumbs, completes on ravi_recognised and sets act3_orr_done', () => {
    expect(QUESTS.q_act3_orr.prerequisite_quests).toEqual(['q_act2_breadcrumbs']);
    store().setFlag('act2_breadcrumbs_done', true);
    store().setQuests({ active: {}, completed: ['q_act2_breadcrumbs'] });
    const qm = QuestManager.getInstance();
    store().setFlag('act3_started', true);
    expect(qm.start('q_act3_orr')).toBe(true);
    for (const f of ['hivr_assigned', ...outcome(night, { scooter_owned: true }).set]) store().setFlag(f, true);
    expect(store().flags.act3_orr_done).toBe(true);
  });

  it('is built (P17) with no open questions', () => {
    expect(SCENES.act3_orr.status).toBe('P17');
    expect((SCENES.act3_orr as unknown as { open_questions: string[] }).open_questions).toEqual([]);
  });
});

describe('card validation (ADR-136)', () => {
  const d = [{ id: 'x', triggers: [{ zone: 'z', action: 'card', card: 'nope' }], sleepEvents: [{ after: 'a', set: ['b'], card: 'nope2' }] }];
  it('catches an unknown card, a missing still, a bad style and a hold on a conditional panel', () => {
    const problems = validateCards([{ file: 'c.json', basename: 'c', json: { id: 'c', end: 'hold', panels: [{ text: 'a', still: 'missing', style: 'wobble' }, { text: 'b', ifFlag: 'f' }] } }], d, new Set(['still_hebbal_night']));
    expect(problems.join('\n')).toMatch(/names card "nope"/);
    expect(problems.join('\n')).toMatch(/names card "nope2"/);
    expect(problems.join('\n')).toMatch(/still "missing"/);
    expect(problems.join('\n')).toMatch(/style must be/);
    expect(problems.join('\n')).toMatch(/must end on a panel everyone sees/);
  });
});
