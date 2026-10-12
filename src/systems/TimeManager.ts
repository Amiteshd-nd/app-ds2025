import { gameEvents } from '../core/events';
import { useGameStore, type GameClock } from '../store';
import { StatsManager } from './StatsManager';
import {
  FOOD_MINUTES_PER_POINT,
  GAME_MINUTE_MS,
  HUNGRY_AT,
  MINUTES_PER_DAY,
  SLEEP_FOOD_RESET,
  SLEEP_HEALTH,
  WAKE_MINUTE,
} from '../utils/constants';

/**
 * TimeManager — the in-game clock (game_components §11, technical §6).
 *
 * Drives what later phases hang on it: bus intervals, the hotel's three
 * nights, the office time-lapse, day/night tints, the 17:00 plates. Real time
 * only moves it while a WorldScene is updating (menus, dialogue and transit
 * cards do not age the day). Sleeping is the one big jump: the next morning,
 * health and food restored (profile doc §3, Acts 1–3 table).
 *
 * Engine-free: the store owns the clock, this owns the rules.
 */
export class TimeManager {
  private static instance: TimeManager | null = null;

  static getInstance(): TimeManager {
    if (!TimeManager.instance) TimeManager.instance = new TimeManager();
    return TimeManager.instance;
  }

  static resetInstance(): void {
    TimeManager.instance = null;
  }

  private carryMs = 0;
  /** Waking minutes not yet turned into a food point. */
  private foodCarry = 0;

  get clock(): GameClock {
    return useGameStore.getState().clock;
  }

  /** "Day 1 · 06:10" — for the HUD and save slots. */
  get label(): string {
    const { day, minute } = this.clock;
    const hh = String(Math.floor(minute / 60)).padStart(2, '0');
    const mm = String(minute % 60).padStart(2, '0');
    return `Day ${day} · ${hh}:${mm}`;
  }

  /** Feed real elapsed ms; advances whole game minutes. */
  tick(deltaMs: number): void {
    this.carryMs += deltaMs;
    const minutes = Math.floor(this.carryMs / GAME_MINUTE_MS);
    if (minutes <= 0) return;
    this.carryMs -= minutes * GAME_MINUTE_MS;
    this.advance(minutes);
  }

  /** Move the clock forward, rolling over midnight into the next day. */
  advance(minutes: number): void {
    if (minutes <= 0) return;
    const { day, minute } = this.clock;
    const total = minute + minutes;
    const next = { day: day + Math.floor(total / MINUTES_PER_DAY), minute: total % MINUTES_PER_DAY };
    useGameStore.getState().setClock(next);
    this.drainFood(minutes);
    gameEvents.emit('time:advanced', { ...next, deltaMinutes: minutes });
  }

  /**
   * Awake time costs food: one point per FOOD_MINUTES_PER_POINT (ADR-97).
   * Crossing into hunger says so once; walking slows while it lasts (Player).
   */
  private drainFood(minutes: number): void {
    this.foodCarry += minutes;
    const points = Math.floor(this.foodCarry / FOOD_MINUTES_PER_POINT);
    if (points <= 0) return;
    this.foodCarry -= points * FOOD_MINUTES_PER_POINT;
    const before = useGameStore.getState().stats.food;
    StatsManager.getInstance().adjust('food', -points);
    const after = useGameStore.getState().stats.food;
    if (before >= HUNGRY_AT && after < HUNGRY_AT) {
      gameEvents.emit('ui:toast', { text: 'Hungry. Walking slower — find a darshini.' });
    }
  }

  /**
   * Sleep until the next morning. Always lands on the NEXT day's WAKE_MINUTE,
   * even if it is 02:00 — a night is a night. Restores health and resets food
   * (profile doc §3). Counts nights slept and announces `time:slept`, which is
   * what the hotel's three-night timer listens for.
   */
  sleep(): GameClock {
    const { day } = this.clock;
    const next = { day: day + 1, minute: WAKE_MINUTE };
    useGameStore.getState().setClock(next);
    this.foodCarry = 0;

    const stats = StatsManager.getInstance();
    stats.adjust('health', SLEEP_HEALTH);
    const food = useGameStore.getState().stats.food;
    if (food < SLEEP_FOOD_RESET) stats.adjust('food', SLEEP_FOOD_RESET - food);

    const store = useGameStore.getState();
    const nights = (store.counters.nights_slept ?? 0) + 1;
    store.setCounter('nights_slept', nights);
    gameEvents.emit('time:slept', { day: next.day, nights });
    return next;
  }
}
