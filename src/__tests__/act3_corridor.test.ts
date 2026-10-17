import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { CARDS, DISTRICTS, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { outcome, panelsFor } from '../systems/cards';
import { useGameStore } from '../store';

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
const talk = (id: string): string[] => {
  const dm = DialogueManager.getInstance();
  const seen = [dm.start(id).nodeId];
  for (let i = 0; i < 10 && dm.view().canAdvance; i++) seen.push(dm.advance().nodeId);
  return seen;
};

describe('Ravi offers the story (story 3.3 F1, ADR-138)', () => {
  it('after "I answered": "Tell me." asks for the corridor card; "Rest, Ravi." does not', () => {
    const requested: string[] = [];
    gameEvents.on('card:requested', ({ cardId }) => requested.push(cardId));
    const dm = DialogueManager.getInstance();
    store().setFlag('ravi_ward_talked', true);
    expect(talk('dlg_ravi_ward')).toEqual(['offer']);
    dm.choose(1); dm.end();
    expect(requested).toEqual([]);
    talk('dlg_ravi_ward');
    dm.choose(0); dm.end();
    expect(requested).toEqual(['card_corridor_in']);
    expect(CARDS.card_corridor_in.then).toEqual({ district: 'hivr_corridor', spawn: 'airlock' });
  });

  it('after the corridor he is asleep', () => {
    store().setFlag('ravi_ward_talked', true);
    store().setFlag('act3_corridor_done', true);
    expect(talk('dlg_ravi_ward')).toEqual(['after']);
  });
});

describe('the corridor (F2–F3)', () => {
  it('you are Ravi, and only the objective shows', () => {
    expect(DISTRICTS.hivr_corridor).toEqual(expect.objectContaining({ playerSheet: 'npc_ravi', hud: 'minimal' }));
  });

  it('the call: Ignore is shown but locked ("It\'s Appa."); Answer plays three lines', () => {
    const dm = DialogueManager.getInstance();
    const view = dm.start('dlg_appa_call');
    expect(view.choices.map((c) => c.text)).toEqual(['Answer', 'Ignore']);
    expect(view.choices[1]).toEqual(expect.objectContaining({ enabled: false, lockedReason: "It's Appa." }));
    dm.choose(0);
    expect(dm.view().nodeId).toBe('appa1');
    dm.advance(); dm.advance();
    expect(dm.view().nodeId).toBe('appa3');
    dm.end();
    expect(store().flags.appa_answered).toBe(true);
  });

  it('the glove station and the tray wait for the call; the tray skips the gloves and starts the closing card', () => {
    const t = DISTRICTS.hivr_corridor.triggers!;
    expect(t.find((x) => x.zone === 'glove_zone')!.requiresFlag).toBe('appa_answered');
    expect(t.find((x) => x.zone === 'tray_zone')!.requiresFlag).toBe('appa_answered');
    const requested: string[] = [];
    gameEvents.on('card:requested', ({ cardId }) => requested.push(cardId));
    expect(talk('dlg_slide_tray')).toEqual(['start', 'tray2', 'tray3']);
    DialogueManager.getInstance().end();
    expect(store().flags.tray_unsealed).toBe(true);
    expect(store().flags.gloves_skipped).toBe(true);
    expect(requested).toEqual(['card_corridor_out']);
  });
});

describe('the ant and the morning after (F4)', () => {
  it('the clipboard with one unticked box, four ant stills, the line over black, the locker, back to the ward at 18:30', () => {
    const panels = panelsFor(CARDS.card_corridor_out, {});
    expect(panels[0].text.match(/\[ \]/g)).toHaveLength(1);
    expect(panels.filter((p) => p.still?.startsWith('still_ant_')).map((p) => p.still)).toEqual(['still_ant_1', 'still_ant_2', 'still_ant_3', 'still_ant_4']);
    expect(panels.filter((p) => p.style === 'fragment').map((p) => p.text).join(' ')).toContain('keep going');
    expect(outcome(CARDS.card_corridor_out, {}).set).toEqual(['ant_seen', 'vikram_locker_seen']);
    expect(CARDS.card_corridor_out.then).toEqual({ district: 'ward4', spawn: 'your_bed', minute: 18 * 60 + 30 });
  });
});

describe('the scene and its quest', () => {
  it('follows Ward 4 and completes on the locker', () => {
    expect(QUESTS.q_act3_corridor.prerequisite_quests).toEqual(['q_act3_ward4']);
    store().setQuests({ active: {}, completed: ['q_act3_ward4'] });
    expect(QuestManager.getInstance().start('q_act3_corridor')).toBe(true);
    for (const f of ['corridor_started', 'corridor_checklist_seen', 'appa_answered', 'tray_unsealed', 'ant_seen', 'vikram_locker_seen']) store().setFlag(f, true);
    expect(store().flags.act3_corridor_done).toBe(true);
  });

  it('is built (P19) with no open questions', () => {
    expect(SCENES.act3_corridor.status).toBe('P19');
    expect((SCENES.act3_corridor as unknown as { open_questions: string[] }).open_questions).toEqual([]);
  });
});
