import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { StatsManager } from '../../systems/StatsManager';
import { SALARY, SALARY_DAYS } from '../../utils/constants';
import type { Behaviour } from './index';

export const FLAG_FLAT_SIGNED = 'flat_signed';
/** Nights to the first salary; absent = not started. */
export const SALARY_DAYS_LEFT = 'salary_days_left';
export const FLAG_FIRST_SALARY = 'first_salary';

/**
 * salaryCountdown — "Salary is 12 days away" (story 1.4 F3, ADR-122). Starts
 * when the flat is signed (or on attach, if it already is), spends a day per
 * sleep with a toast at the milestones, and on day zero the salary lands in
 * the wallet through earn() — the UPI ledger shows it as "Salary".
 */
export const salaryCountdown: Behaviour = {
  attach() {
    const store = () => useGameStore.getState();
    const start = () => {
      if (store().counters[SALARY_DAYS_LEFT] !== undefined || store().flags[FLAG_FIRST_SALARY]) return;
      store().setCounter(SALARY_DAYS_LEFT, SALARY_DAYS);
      gameEvents.emit('ui:toast', { text: `Salary in ${SALARY_DAYS} days. Spend like it.` });
    };
    if (store().flags[FLAG_FLAT_SIGNED]) start();
    const onFlag = ({ flag, value }: { flag: string; value: boolean }) => { if (flag === FLAG_FLAT_SIGNED && value) start(); };
    const onSlept = () => {
      const left = store().counters[SALARY_DAYS_LEFT];
      if (left === undefined || left <= 0) return;
      const next = left - 1;
      store().setCounter(SALARY_DAYS_LEFT, next);
      if (next === 0) {
        StatsManager.getInstance().earn(SALARY, 'salary', 'Salary');
        store().setFlag(FLAG_FIRST_SALARY, true);
        gameEvents.emit('ui:toast', { text: 'Salary credited. First one.', icon: 'upi' });
      } else if (next === 7 || next === 3 || next === 1) {
        gameEvents.emit('ui:toast', { text: `Salary in ${next} day${next === 1 ? '' : 's'}.` });
      }
    };
    const offs = [gameEvents.on('flag:set', onFlag), gameEvents.on('time:slept', onSlept)];
    return () => offs.forEach((f) => f());
  },
};
