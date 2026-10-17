import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { StatsManager } from '../systems/StatsManager';
import { useSettings } from '../systems/SettingsManager';
import { useGameStore } from '../store';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  PhoneManager.resetInstance();
  QuestManager.resetInstance();
  ReputationManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
  useSettings.getState().reset();
});

const phone = () => PhoneManager.getInstance();
const toasts = () => {
  const list: string[] = [];
  gameEvents.on('ui:toast', ({ text }) => list.push(text));
  return list;
};

describe('chats', () => {
  it('Amma buzzes on the first step into the world', () => {
    const t = toasts();
    phone();
    gameEvents.emit('district:entered', { districtId: 'airport' });
    expect(useGameStore.getState().phone.delivered).toContain('amma_1');
    expect(t).toEqual(['Amma: Landed? Call.']);
  });

  it('delivers a thread in order: a later message waits for an earlier one\'s flag', () => {
    phone().deliver({ quiet: true });
    useGameStore.getState().setFlag('pg_signed', true); // amma_3's flag, but amma_2 (hotel) is not yet due
    expect(useGameStore.getState().phone.delivered).not.toContain('amma_3');
    useGameStore.getState().setFlag('hotel_checked_in', true);
    const d = useGameStore.getState().phone.delivered;
    expect(d).toContain('amma_2');
    expect(d).toContain('amma_3');
  });

  it('Do Not Disturb mutes non-critical buzzes but still delivers them', () => {
    useSettings.getState().set('gameplay', 'doNotDisturb', true);
    phone().deliver({ quiet: true });
    const t = toasts();
    useGameStore.getState().setFlag('pg_lane_found', true); // broker spam: not critical
    expect(useGameStore.getState().phone.delivered).toContain('pg_deals_1');
    expect(t).toEqual([]);
    const buzzes: string[] = [];
    gameEvents.on('phone:buzz', ({ reason }) => buzzes.push(reason));
    useGameStore.getState().setFlag('divya_called', true); // Divya: critical
    expect(t.filter((x) => !x.startsWith('APP UNLOCKED'))).toHaveLength(1);
    // Divya's message still buzzes; the Maps/Calls unlocks show their toasts but do not buzz under DND.
    expect(buzzes).toEqual(['message']);
  });

  it('an app unlocking announces itself once: toast + buzz + pop event', () => {
    phone(); // the manager listens from boot
    const t = toasts();
    const unlocked: string[] = [];
    const buzzes: string[] = [];
    gameEvents.on('phone:app-unlocked', ({ appId }) => unlocked.push(appId));
    gameEvents.on('phone:buzz', ({ reason, appId }) => { if (reason === 'unlock') buzzes.push(appId!); });
    useGameStore.getState().setFlag('divya_called', true);
    useGameStore.getState().setFlag('divya_called', true); // no change, no second announcement
    expect(unlocked).toEqual(['maps', 'call']);
    expect(buzzes).toEqual(['maps', 'call']);
    expect(t).toContain('APP UNLOCKED: MAPS');
  });

  it('counts unread, and opening a thread reads it', () => {
    phone().deliver({ quiet: true });
    useGameStore.getState().setFlag('divya_called', true);
    expect(phone().unreadCount()).toBe(2); // Amma + Divya ("me" messages never count)
    phone().markRead('divya');
    expect(phone().unreadCount()).toBe(1);
    expect(phone().threadsView()[0].thread.id).toBe('divya'); // most recent first
  });
});

describe('apps, UPI and Maps', () => {
  it('apps stay greyed until their mechanic is taught', () => {
    expect(phone().apps().find((a) => a.id === 'maps')!.unlocked).toBe(false);
    expect(phone().apps().find((a) => a.id === 'chats')!.unlocked).toBe(true);
    useGameStore.getState().setFlag('divya_called', true);
    expect(phone().apps().find((a) => a.id === 'maps')!.unlocked).toBe(true);
  });

  it('UPI shows the balance and the ledger, newest first', () => {
    StatsManager.getInstance().spend(20, 'chai', 'Chai Anna');
    StatsManager.getInstance().spend(250, 'fare:bus', 'Vayu Vajra KIA-8 → Whitefield');
    const upi = phone().upi();
    expect(upi.balance).toBe(34_730);
    expect(upi.transactions.map((t) => t.label)).toEqual(['Vayu Vajra KIA-8 → Whitefield', 'Chai Anna']);
  });

  it('Maps pins real places, folds interiors into their pocket, and marks the destination', () => {
    useGameStore.getState().setQuests({ active: { q_act0_pg_hunt: ['find_lane'] }, completed: ['q_act0_arrival'] });
    useGameStore.getState().setActiveDistrict('whitefield_hotel');
    const m = phone().maps();
    expect(m.pins.map((p) => p.districtId).sort()).toEqual(['airport', 'ambedkar_nagar_hill', 'church_street', 'cubbon_park', 'office_gate', 'prashanth_layout', 'scooter_showroom', 'whitefield_street']);
    expect(m.here).toBe('whitefield_street');
    expect(m.pins.find((p) => p.districtId === 'whitefield_street')!.state).toBe('here');
    expect(m.destination).toMatchObject({ districtId: 'prashanth_layout', label: 'Prashanth Layout' });
  });
});
