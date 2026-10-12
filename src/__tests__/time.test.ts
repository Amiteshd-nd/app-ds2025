import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { QuestManager } from '../systems/QuestManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { hotelNightTimer, HOTEL_NIGHTS_LEFT } from '../world/behaviours/hotelNightTimer';
import { GAME_MINUTE_MS, HOTEL_NIGHTS } from '../utils/constants';

const installLocalStorage = () => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
};

beforeEach(() => {
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  useGameStore.getState().reset();
  installLocalStorage();
});

const time = () => TimeManager.getInstance();
const clock = () => useGameStore.getState().clock;

describe('TimeManager', () => {
  it('starts at Day 1, 06:10 — "Bengaluru. 06:10."', () => {
    expect(clock()).toEqual({ day: 1, minute: 370 });
    expect(time().label).toBe('Day 1 · 06:10');
  });

  it('advances whole minutes from real time and carries the remainder', () => {
    time().tick(GAME_MINUTE_MS * 2.5);
    expect(clock().minute).toBe(372);
    time().tick(GAME_MINUTE_MS * 0.5);
    expect(clock().minute).toBe(373);
  });

  it('rolls over midnight into the next day', () => {
    const advanced = vi.fn();
    gameEvents.on('time:advanced', advanced);
    time().advance(24 * 60);
    expect(clock()).toEqual({ day: 2, minute: 370 });
    expect(advanced).toHaveBeenCalledWith({ day: 2, minute: 370, deltaMinutes: 1440 });
  });

  it('sleep lands on the next morning, heals, resets food, counts the night', () => {
    const stats = StatsManager.getInstance();
    stats.adjust('health', -50);
    stats.adjust('food', -60);
    const slept = vi.fn();
    gameEvents.on('time:slept', slept);

    time().advance(60); // 07:10, same day — sleeping still means the NEXT day
    time().sleep();
    expect(clock()).toEqual({ day: 2, minute: 7 * 60 });
    const s = useGameStore.getState();
    expect(s.stats.health).toBe(80);
    expect(s.stats.food).toBe(70);
    expect(s.counters.nights_slept).toBe(1);
    expect(slept).toHaveBeenCalledWith({ day: 2, nights: 1 });
  });

  it('sleep never lowers food that is already above the reset', () => {
    time().sleep();
    expect(useGameStore.getState().stats.food).toBe(100);
  });

  it('clock and counters survive a save round trip', () => {
    time().advance(500);
    useGameStore.getState().setCounter('x', 7);
    SaveManager.getInstance().save();
    useGameStore.getState().reset();
    SaveManager.getInstance().restore();
    expect(clock()).toEqual({ day: 1, minute: 870 });
    expect(useGameStore.getState().counters.x).toBe(7);
  });
});

describe('hotelNightTimer behaviour (story 0.2)', () => {
  const attach = () => hotelNightTimer.attach({} as never) as () => void;

  it('starts the countdown when the receptionist sets hotel_checked_in', () => {
    const toast = vi.fn();
    gameEvents.on('ui:toast', toast);
    const off = attach();
    useGameStore.getState().setFlag('hotel_checked_in', true);
    expect(useGameStore.getState().counters[HOTEL_NIGHTS_LEFT]).toBe(HOTEL_NIGHTS);
    expect(toast).toHaveBeenCalledTimes(1);
    off();
  });

  it('spends one night per sleep and ends with hotel_nights_done', () => {
    const off = attach();
    useGameStore.getState().setFlag('hotel_checked_in', true);
    time().sleep();
    expect(useGameStore.getState().flags.hotel_slept_once).toBe(true); // the quest's sleep objective
    time().sleep();
    expect(useGameStore.getState().counters[HOTEL_NIGHTS_LEFT]).toBe(1);
    expect(useGameStore.getState().flags.hotel_nights_done).toBeUndefined();
    time().sleep();
    expect(useGameStore.getState().counters[HOTEL_NIGHTS_LEFT]).toBe(0);
    expect(useGameStore.getState().flags.hotel_nights_done).toBe(true);
    time().sleep(); // a fourth night does not go negative
    expect(useGameStore.getState().counters[HOTEL_NIGHTS_LEFT]).toBe(0);
    off();
  });

  it('after checkout, a night costs the receptionist rate — never a lock', () => {
    const off = attach();
    useGameStore.getState().setFlag('hotel_checked_in', true);
    for (let i = 0; i < HOTEL_NIGHTS; i++) time().sleep();
    const wallet = useGameStore.getState().stats.wallet;
    time().sleep();
    expect(useGameStore.getState().stats.wallet).toBe(wallet - 1800);
    useGameStore.setState((st) => ({ stats: { ...st.stats, wallet: 100 } }));
    time().sleep(); // short: the night is let go, nothing goes negative
    expect(useGameStore.getState().stats.wallet).toBe(100);
    useGameStore.setState((st) => ({ stats: { ...st.stats, wallet: 5000 } }));
    useGameStore.getState().setFlag('pg_signed', true);
    time().sleep(); // signed a PG: the hotel no longer charges
    expect(useGameStore.getState().stats.wallet).toBe(5000);
    off();
  });

  it('sleeping before check-in spends nothing', () => {
    const off = attach();
    time().sleep();
    expect(useGameStore.getState().counters[HOTEL_NIGHTS_LEFT]).toBeUndefined();
    off();
  });

  it('teardown stops it listening', () => {
    const off = attach();
    off();
    useGameStore.getState().setFlag('hotel_checked_in', true);
    expect(useGameStore.getState().counters[HOTEL_NIGHTS_LEFT]).toBeUndefined();
  });
});

describe('flag objectives + the hotel quest', () => {
  it('q_act0_hotel completes on check-in, the call and the first sleep', () => {
    useGameStore.getState().setQuests({ active: {}, completed: ['q_act0_arrival'] });
    const qm = QuestManager.getInstance();
    expect(qm.start('q_act0_hotel')).toBe(true);
    const store = useGameStore.getState();
    store.setFlag('hotel_checked_in', true);
    store.setFlag('divya_called', true);
    expect(qm.isCompleted('q_act0_hotel')).toBe(false);
    store.setFlag('hotel_slept_once', true);
    expect(qm.isCompleted('q_act0_hotel')).toBe(true);
    expect(useGameStore.getState().flags.act0_hotel_done).toBe(true);
  });

  it('a flag already set before the quest starts completes that objective immediately', () => {
    useGameStore.getState().setQuests({ active: {}, completed: ['q_act0_arrival'] });
    useGameStore.getState().setFlag('hotel_checked_in', true);
    QuestManager.getInstance().start('q_act0_hotel');
    expect(useGameStore.getState().quests.active.q_act0_hotel).toContain('check_in');
  });

  it('a dialogue effect can set flags', () => {
    StatsManager.getInstance().applyEffect({ flags: { hotel_checked_in: true } });
    expect(useGameStore.getState().flags.hotel_checked_in).toBe(true);
  });
});

describe('food drain (ADR-97)', () => {
  it('costs one food point per FOOD_MINUTES_PER_POINT awake, carrying remainders', async () => {
    const { FOOD_MINUTES_PER_POINT } = await import('../utils/constants');
    time().advance(FOOD_MINUTES_PER_POINT * 10);
    expect(useGameStore.getState().stats.food).toBe(90);
    time().advance(FOOD_MINUTES_PER_POINT - 1);
    expect(useGameStore.getState().stats.food).toBe(90);
    time().advance(1);
    expect(useGameStore.getState().stats.food).toBe(89);
  });

  it('says so once when the player gets hungry', async () => {
    const { FOOD_MINUTES_PER_POINT, HUNGRY_AT } = await import('../utils/constants');
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    time().advance(FOOD_MINUTES_PER_POINT * (100 - HUNGRY_AT + 1));
    time().advance(FOOD_MINUTES_PER_POINT * 5);
    expect(toasts.filter((t) => t.startsWith('Hungry'))).toHaveLength(1);
  });
});
