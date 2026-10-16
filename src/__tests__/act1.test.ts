import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { QuestManager } from '../systems/QuestManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { officeClockIn, FLAG_LATE, FLAG_OFFICE_ARRIVED, FLAG_ON_TIME } from '../world/behaviours/officeClockIn';
import { pgNoticeTimer, FLAG_NOTICE_DUE, FLAG_NOTICE_GIVEN, PG_NOTICE_DAYS_LEFT } from '../world/behaviours/pgNoticeTimer';
import { FIRST_DAY_STRESS, LATE_STRESS, OFFICE_END_MINUTE, OFFICE_START_MINUTE, PG_NOTICE_DAYS, STARTING_FOOD, WORKDAY_FOOD_COST } from '../utils/constants';

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

describe('workday (story 1.1 F4, ADR-120)', () => {
  it('jumps the clock to 18:00 the same day, costs one canteen lunch, adds first-day nerves once', () => {
    store().setClock({ day: 5, minute: 9 * 60 + 28 });
    const spy = vi.fn();
    gameEvents.on('time:workday', spy);
    const next = time().workday();
    expect(next).toEqual({ day: 5, minute: OFFICE_END_MINUTE });
    expect(store().stats.food).toBe(STARTING_FOOD - WORKDAY_FOOD_COST);
    expect(store().stats.stress).toBe(FIRST_DAY_STRESS);
    expect(store().counters.workdays).toBe(1);
    expect(spy).toHaveBeenCalledWith({ day: 5, minutesSkipped: OFFICE_END_MINUTE - (9 * 60 + 28) });
    // Day two: no new nerves, still a lunch.
    store().setClock({ day: 6, minute: 9 * 60 + 40 });
    time().workday();
    expect(store().stats.stress).toBe(FIRST_DAY_STRESS);
    expect(store().stats.food).toBe(STARTING_FOOD - 2 * WORKDAY_FOOD_COST);
  });

  it('is a no-op after closing time', () => {
    store().setClock({ day: 5, minute: 19 * 60 });
    expect(time().workday()).toEqual({ day: 5, minute: 19 * 60 });
    expect(store().stats.food).toBe(STARTING_FOOD);
  });
});

describe('officeClockIn behaviour (story 1.1 lateness)', () => {
  const attach = () => officeClockIn.attach({} as never) as () => void;

  it('on time: the flag, a toast, no stress', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    const off = attach();
    store().setClock({ day: 5, minute: OFFICE_START_MINUTE - 2 });
    store().setFlag(FLAG_OFFICE_ARRIVED, true);
    expect(store().flags[FLAG_ON_TIME]).toBe(true);
    expect(store().flags[FLAG_LATE]).toBeUndefined();
    expect(store().stats.stress).toBe(0);
    expect(toasts[0]).toBe('09:28. Made it.');
    off();
  });

  it('late: stress, the other flag, and never twice', () => {
    const off = attach();
    store().setClock({ day: 5, minute: OFFICE_START_MINUTE + 12 });
    store().setFlag(FLAG_OFFICE_ARRIVED, true);
    expect(store().flags[FLAG_LATE]).toBe(true);
    expect(store().stats.stress).toBe(LATE_STRESS);
    store().setFlag(FLAG_OFFICE_ARRIVED, false);
    store().setFlag(FLAG_OFFICE_ARRIVED, true);
    expect(store().stats.stress).toBe(LATE_STRESS);
    off();
  });
});

describe('pgNoticeTimer behaviour (story 1.3)', () => {
  const attach = () => pgNoticeTimer.attach({} as never) as () => void;

  it('counts seven nights from the notice and sets pg_notice_due at zero', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    const off = attach();
    store().setFlag(FLAG_NOTICE_GIVEN, true);
    expect(store().counters[PG_NOTICE_DAYS_LEFT]).toBe(PG_NOTICE_DAYS);
    for (let i = 0; i < PG_NOTICE_DAYS - 1; i++) time().sleep();
    expect(store().counters[PG_NOTICE_DAYS_LEFT]).toBe(1);
    expect(store().flags[FLAG_NOTICE_DUE]).toBeUndefined();
    time().sleep();
    expect(store().counters[PG_NOTICE_DAYS_LEFT]).toBe(0);
    expect(store().flags[FLAG_NOTICE_DUE]).toBe(true);
    expect(toasts[toasts.length - 1]).toContain('Notice is up');
    time().sleep(); // past zero: nothing more happens
    expect(store().counters[PG_NOTICE_DAYS_LEFT]).toBe(0);
    off();
  });
});
