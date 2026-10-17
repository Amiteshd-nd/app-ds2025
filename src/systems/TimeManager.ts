import { gameEvents } from '../core/events';
import { useGameStore, type GameClock } from '../store';
import { StatsManager } from './StatsManager';
import { survivalRate } from './SettingsManager';
import { tuningFor } from './survival';
import { ACT4_DAY, ACT4_FLAG } from './stability';
import {
  FIRST_DAY_STRESS,
  GAME_MINUTE_MS,
  HUNGRY_AT,
  MINUTES_PER_DAY,
  OFFICE_END_MINUTE,
  WAKE_MINUTE,
  WORKDAY_FOOD_COST,
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
  /** Starving health not yet taken (Act 4's table, ADR-144). */
  private starveCarry = 0;

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
   * Awake time costs food: one point per `foodMinutesPerPoint` (ADR-97; the
   * table is gentle until Act 4, harsh after — ADR-16/144). Crossing into
   * hunger says so once; walking slows while it lasts (Player). In Act 4 an
   * empty stomach costs health too.
   */
  private drainFood(minutes: number): void {
    const tuning = tuningFor(useGameStore.getState().flags);
    // Relaxed difficulty halves survival ticks (ADR-16, Settings → Gameplay).
    this.foodCarry += minutes * survivalRate();
    const points = Math.floor(this.foodCarry / tuning.foodMinutesPerPoint + 1e-9);
    if (points > 0) {
      this.foodCarry -= points * tuning.foodMinutesPerPoint;
      const before = useGameStore.getState().stats.food;
      StatsManager.getInstance().adjust('food', -points);
      const after = useGameStore.getState().stats.food;
      if (before >= HUNGRY_AT && after < HUNGRY_AT) {
        gameEvents.emit('ui:toast', { text: 'Hungry. Walking slower — find a darshini.' });
      }
    }
    this.starve(minutes, tuning.starveHealthPerMinute);
  }

  /** Food at 0 in Act 4: health drains (profile doc §3, harsh table). */
  private starve(minutes: number, perMinute: number): void {
    if (perMinute <= 0 || useGameStore.getState().stats.food > 0) { this.starveCarry = 0; return; }
    this.starveCarry += minutes * perMinute * survivalRate();
    const hp = Math.floor(this.starveCarry + 1e-9);
    if (hp <= 0) return;
    this.starveCarry -= hp;
    StatsManager.getInstance().adjust('health', -hp);
  }

  /**
   * Sleep until the next morning. Always lands on the NEXT day's WAKE_MINUTE,
   * even if it is 02:00 — a night is a night. Restores health and tops up food
   * by the survival table (profile doc §3; Act 4's is harsher). Counts nights slept and announces `time:slept`, which is
   * what the hotel's three-night timer listens for.
   */
  sleep(): GameClock {
    const { day, minute } = this.clock;
    // Bed after midnight (home at 3 AM, ADR-133) wakes you the same morning, not the one after.
    const next = { day: minute < WAKE_MINUTE ? day : day + 1, minute: WAKE_MINUTE };
    useGameStore.getState().setClock(next);
    this.foodCarry = 0;
    this.starveCarry = 0;

    const tuning = tuningFor(useGameStore.getState().flags);
    const stats = StatsManager.getInstance();
    stats.adjust('health', tuning.sleepHealth);
    const food = useGameStore.getState().stats.food;
    if (food < tuning.sleepFoodReset) stats.adjust('food', tuning.sleepFoodReset - food);

    const store = useGameStore.getState();
    const nights = (store.counters.nights_slept ?? 0) + 1;
    store.setCounter('nights_slept', nights);
    // Act 4 counts its own days from the hospital gate (ADR-144): each night moves every place along its fall curve.
    if (store.flags[ACT4_FLAG]) store.setCounter(ACT4_DAY, (store.counters[ACT4_DAY] ?? 0) + 1);
    gameEvents.emit('time:slept', { day: next.day, nights });
    return next;
  }

  /**
   * A workday in one jump (story 1.1 F4, the skyline time-lapse): the clock
   * lands on closing time the same day. Not the awake drain — eight hours of
   * it would empty the food meter — but one canteen-sized cost, plus first-day
   * nerves the first time. Announces `time:workday` so the office behaviours
   * and the transition card can react. A no-op after closing time.
   */
  workday(): GameClock {
    const { day, minute } = this.clock;
    if (minute >= OFFICE_END_MINUTE) return this.clock;
    const skipped = OFFICE_END_MINUTE - minute;
    const next = { day, minute: OFFICE_END_MINUTE };
    useGameStore.getState().setClock(next);
    this.foodCarry = 0;
    const stats = StatsManager.getInstance();
    stats.adjust('food', -WORKDAY_FOOD_COST);
    const store = useGameStore.getState();
    const days = (store.counters.workdays ?? 0) + 1;
    store.setCounter('workdays', days);
    if (days === 1) stats.adjust('stress', FIRST_DAY_STRESS);
    gameEvents.emit('time:advanced', { ...next, deltaMinutes: skipped });
    gameEvents.emit('time:workday', { day, minutesSkipped: skipped });
    return next;
  }
}
