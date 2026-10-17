import { FOOD_MINUTES_PER_POINT, SLEEP_FOOD_RESET, SLEEP_HEALTH } from '../utils/constants';
import { ACT4_FLAG } from './stability';

/**
 * One survival system, two tuning tables (ADR-16, profile doc §3, ADR-144):
 * gentle through Acts 0–3, harsh once Act 4 begins. TimeManager reads the
 * table; nothing else changes. Relaxed difficulty still halves every tick.
 *
 * The profile doc's Act 4 hunger (health −3 / min) is scaled by the same 6×
 * ADR-97 used for food (a game minute is 2 real seconds): −3 per 6 minutes,
 * so a starving player has a few real minutes to find food, not one.
 */
export interface SurvivalTuning {
  /** Awake game-minutes per food point lost. */
  foodMinutesPerPoint: number;
  /** Health lost per awake game-minute while food is 0 (0 = none). */
  starveHealthPerMinute: number;
  /** Health a night's sleep gives back. */
  sleepHealth: number;
  /** Food a night's sleep tops up to (0 = none: in Act 4 you eat from the stock). */
  sleepFoodReset: number;
}

export const SURVIVAL: Record<'gentle' | 'harsh', SurvivalTuning> = {
  gentle: { foodMinutesPerPoint: FOOD_MINUTES_PER_POINT, starveHealthPerMinute: 0, sleepHealth: SLEEP_HEALTH, sleepFoodReset: SLEEP_FOOD_RESET },
  harsh: { foodMinutesPerPoint: 4, starveHealthPerMinute: 0.5, sleepHealth: 15, sleepFoodReset: 0 },
};

export const tuningFor = (flags: Record<string, boolean>): SurvivalTuning => SURVIVAL[flags[ACT4_FLAG] ? 'harsh' : 'gentle'];
