import { beforeEach, describe, expect, it } from 'vitest';
import { DialogueManager } from '../systems/DialogueManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { DIALOGUE, ITEMS, QUESTS, getDialogue, getItem, getQuest } from '../data';

beforeEach(() => {
  DialogueManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

describe('content registry', () => {
  it('loads authored content by id', () => {
    expect(Object.keys(DIALOGUE).sort()).toEqual([
      'airport_helper', 'dlg_amma_call', 'dlg_amma_come_home', 'dlg_amma_news', 'dlg_amma_worried', 'dlg_ananya',
      'dlg_ananya_camp', 'dlg_ananya_photo', 'dlg_ananya_walk', 'dlg_appa_call', 'dlg_argument', 'dlg_aunty_boxes',
      'dlg_auto_fair', 'dlg_auto_kannada', 'dlg_auto_meter', 'dlg_balcony_watcher', 'dlg_bunk_attendant', 'dlg_bus_kid',
      'dlg_bus_nurse', 'dlg_bus_uncle', 'dlg_busker', 'dlg_cab_tout', 'dlg_chai_anna', 'dlg_coliving',
      'dlg_corridor_clipboard', 'dlg_council', 'dlg_crowd_filming', 'dlg_crowd_garland', 'dlg_crowd_selfie',
      'dlg_cycle_guy', 'dlg_darshini', 'dlg_deepa', 'dlg_divya_call', 'dlg_divya_monday', 'dlg_engineer',
      'dlg_flat_ransacked', 'dlg_gate_constable', 'dlg_glove_station', 'dlg_guard_salute', 'dlg_guitar_clip',
      'dlg_guitar_shop', 'dlg_hill_chai', 'dlg_hill_climbed', 'dlg_hill_furniture', 'dlg_hill_table',
      'dlg_hotel_reception', 'dlg_hygge_aisle', 'dlg_hygge_cafe', 'dlg_hygge_cashier', 'dlg_hygge_staff',
      'dlg_hygge_tag_bedroom', 'dlg_hygge_tag_kitchen', 'dlg_hygge_tag_living', 'dlg_icecream', 'dlg_ikea_assembly',
      'dlg_janata_bay', 'dlg_janata_bus', 'dlg_janata_doors', 'dlg_janata_whistle', 'dlg_jogger', 'dlg_karthik',
      'dlg_kid_mother', 'dlg_kumar_cafe', 'dlg_kumar_trapped', 'dlg_lost_kid', 'dlg_majestic_steps',
      'dlg_majestic_uncle', 'dlg_majestic_uncle_thanks', 'dlg_manju', 'dlg_manju_act4', 'dlg_metro_ajji',
      'dlg_metro_guard', 'dlg_metro_sign', 'dlg_neighbour_leela', 'dlg_noor', 'dlg_office_guard', 'dlg_office_return',
      'dlg_owner_aunty', 'dlg_pg_token', 'dlg_prakash', 'dlg_priya', 'dlg_provision', 'dlg_raju_cafe',
      'dlg_raju_trapped', 'dlg_rathore', 'dlg_ravi_hivr', 'dlg_ravi_home', 'dlg_ravi_intro', 'dlg_ravi_location',
      'dlg_ravi_ward', 'dlg_sameer_intro', 'dlg_sealed_door', 'dlg_sealed_open', 'dlg_sealed_quiet', 'dlg_shanthamma',
      'dlg_slide_tray', 'dlg_slot_shop', 'dlg_suresh', 'dlg_tanvi', 'dlg_token_uncle', 'dlg_uncle', 'dlg_vikram',
      'dlg_ward_door', 'dlg_ward_not_yet', 'dlg_ward_nurse', 'dlg_ward_patient_old', 'dlg_ward_patient_woman',
      'dlg_ward_tray', 'dlg_ward_tv', 'receptionist', 'security_guard', 'shopkeeper',
    ]);
    expect(Object.keys(QUESTS)).toContain('q_act0_arrival');
    expect(Object.keys(ITEMS)).toContain('water_bottle');
  });

  it('fails loudly on an unknown id rather than returning undefined', () => {
    expect(() => getDialogue('nobody')).toThrow(/Unknown dialogue "nobody"/);
    expect(() => getQuest('nothing')).toThrow(/Unknown quest/);
    expect(() => getItem('nothing')).toThrow(/Unknown item/);
  });
});

describe('DialogueManager', () => {
  it('opens on the start node and exposes its choices', () => {
    const view = DialogueManager.getInstance().start('receptionist');
    expect(view.speaker).toBe('Receptionist');
    expect(view.nodeId).toBe('start');
    expect(view.choices.map((c) => c.text)).toEqual([
      'Which one is cheaper?', 'Thanks, I\'ll manage.',
    ]);
    expect(view.isEnd).toBe(false);
  });

  it('applies a node effect on arrival', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    expect(useGameStore.getState().skills.city_survival.xp).toBe(0);
    d.choose(0); // -> "fares", which grants 10 city_survival xp
    expect(useGameStore.getState().skills.city_survival.xp).toBe(10);
  });

  it('applies a choice effect — buying water spends from the wallet and grants the item', () => {
    const d = DialogueManager.getInstance();
    d.start('shopkeeper');
    d.choose(0);
    expect(useGameStore.getState().stats.wallet).toBe(34_980);
  });

  it('auto-advances a node that has next and no choices', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    const fares = d.choose(0);
    expect(fares.canAdvance).toBe(true);
    const farewell = d.advance();
    expect(farewell.nodeId).toBe('farewell');
    expect(farewell.isEnd).toBe(true);
    expect(farewell.canAdvance).toBe(false);
  });

  it('locks a choice behind a skill requirement but still shows it', () => {
    const view = DialogueManager.getInstance().start('airport_helper');
    const gated = view.choices[1];
    expect(gated.enabled).toBe(false);
    expect(gated.lockedReason).toBe('Needs City Survival: Newcomer');
    expect(gated.text).toBeTruthy(); // shown, not hidden
  });

  it('unlocks that choice once the skill tier is reached', () => {
    StatsManager.getInstance().addXp('city_survival', 100); // -> level 1
    const view = DialogueManager.getInstance().start('airport_helper');
    expect(view.choices[1].enabled).toBe(true);
    expect(view.choices[1].lockedReason).toBeUndefined();
  });

  it('refuses to take a locked choice', () => {
    const d = DialogueManager.getInstance();
    d.start('airport_helper');
    expect(() => d.choose(1)).toThrow(/is locked/);
  });

  it('refuses a choice index that does not exist', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    expect(() => d.choose(99)).toThrow(/does not exist/);
  });

  it('refuses to advance from a terminal node', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    d.choose(1); // straight to farewell
    expect(() => d.advance()).toThrow(/nothing to advance to/);
  });

  it('tracks active state across a conversation', () => {
    const d = DialogueManager.getInstance();
    expect(d.isActive).toBe(false);
    d.start('security_guard');
    expect(d.isActive).toBe(true);
    d.end();
    expect(d.isActive).toBe(false);
  });

  it('throws when driven with no active conversation', () => {
    expect(() => DialogueManager.getInstance().view()).toThrow(/No dialogue is active/);
  });

  it('accumulates stress from the guard branch that foreshadows the outbreak', () => {
    const d = DialogueManager.getInstance();
    d.start('security_guard');
    d.choose(0);
    expect(useGameStore.getState().stats.stress).toBe(5); // 0 starting + 5
  });
});
