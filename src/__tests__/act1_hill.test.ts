import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { REELS } from '../data';
import { QuestManager } from '../systems/QuestManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { bufferingText, REEL_BUFFER_MS, REEL_GIVEUP_MS, reelState, signalAt, visibleReels } from '../ui/phone/viewModel';
import { missingGlyphs } from '../ui/kit/text';
import { pgNoticeTimer, FLAG_NOTICE_GIVEN, PG_NOTICE_DAYS_LEFT } from '../world/behaviours/pgNoticeTimer';
import { salaryCountdown, FLAG_FIRST_SALARY, FLAG_FLAT_SIGNED, SALARY_DAYS_LEFT } from '../world/behaviours/salaryCountdown';
import { PG_NOTICE_DAYS, SALARY, SALARY_DAYS, STARTING_WALLET } from '../utils/constants';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const time = () => TimeManager.getInstance();

describe('the signal test (story 1.4, ADR-122)', () => {
  it('no bars = no network, one bar buffers then gives up, two bars buffer then play, three play at once', () => {
    expect(reelState(0, 99_999)).toBe('nosignal');
    expect(reelState(1, REEL_GIVEUP_MS - 1)).toBe('buffering');
    expect(reelState(1, REEL_GIVEUP_MS)).toBe('failed');
    expect(reelState(2, REEL_BUFFER_MS - 1)).toBe('buffering');
    expect(reelState(2, REEL_BUFFER_MS)).toBe('playing');
    expect(reelState(3, 0)).toBe('playing');
    expect(bufferingText(0)).toBe('Buffering');
    expect(bufferingText(850)).toBe('Buffering..');
  });

  it('a signal zone overrides the district; leaving it restores the district', () => {
    expect(signalAt('ambedkar_nagar_hill')).toBe(1);
    store().setSignalOverride(0, 'room1_checked');
    expect(signalAt('ambedkar_nagar_hill')).toBe(0);
    expect(store().signalZoneFlag).toBe('room1_checked');
    store().setSignalOverride(null);
    expect(signalAt('ambedkar_nagar_hill')).toBe(1);
    expect(store().signalZoneFlag).toBeNull();
    expect(signalAt('hill_flat')).toBe(2);
  });

  it('reels: gated by flags, newest first, the fever clip waits for the flat and is a breadcrumb', () => {
    const none = visibleReels(REELS, {});
    expect(none.map((c) => c.id)).toEqual(['reel_dog', 'reel_traffic']);
    const later = visibleReels(REELS, { pg_signed: true, flat_signed: true });
    expect(later[0].id).toBe('reel_fever');
    expect(later[0].critical).toBe(true);
    for (const c of REELS) for (const k of ['title', 'caption', 'handle'] as const) expect(missingGlyphs(c[k]), c.id).toEqual([]);
  });
});

describe('salaryCountdown behaviour (story 1.4 F3)', () => {
  const attach = () => salaryCountdown.attach({} as never) as () => void;

  it('starts at the flat, counts nights, and pays on day zero through earn()', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    const off = attach();
    expect(store().counters[SALARY_DAYS_LEFT]).toBeUndefined();
    store().setFlag(FLAG_FLAT_SIGNED, true);
    expect(store().counters[SALARY_DAYS_LEFT]).toBe(SALARY_DAYS);
    for (let i = 0; i < SALARY_DAYS - 1; i++) time().sleep();
    expect(store().counters[SALARY_DAYS_LEFT]).toBe(1);
    expect(store().flags[FLAG_FIRST_SALARY]).toBeUndefined();
    const before = store().stats.wallet;
    time().sleep();
    expect(store().stats.wallet).toBe(before + SALARY);
    expect(store().flags[FLAG_FIRST_SALARY]).toBe(true);
    expect(store().transactions[store().transactions.length - 1]).toMatchObject({ amount: SALARY, label: 'Salary' });
    expect(toasts.some((t) => t.includes('Salary credited'))).toBe(true);
    off();
  });

  it('attached after the flat was signed (entering the room), it starts then — and never twice', () => {
    store().setFlag(FLAG_FLAT_SIGNED, true);
    const off = attach();
    expect(store().counters[SALARY_DAYS_LEFT]).toBe(SALARY_DAYS);
    off();
    const off2 = attach();
    expect(store().counters[SALARY_DAYS_LEFT]).toBe(SALARY_DAYS);
    off2();
  });
});

describe('pgNoticeTimer returns the deposit (story 1.3 → 1.4)', () => {
  it('on the last night the haggled deposit comes back through earn()', () => {
    const off = (pgNoticeTimer.attach({} as never) as () => void);
    store().setCounter('neg.neg_shanthamma.deposit', 6000);
    store().setFlag(FLAG_NOTICE_GIVEN, true);
    for (let i = 0; i < PG_NOTICE_DAYS; i++) time().sleep();
    expect(store().counters[PG_NOTICE_DAYS_LEFT]).toBe(0);
    expect(store().stats.wallet).toBe(STARTING_WALLET + 6000);
    expect(store().transactions[store().transactions.length - 1]).toMatchObject({ amount: 6000, reason: 'pg_deposit_back' });
    off();
  });
});
