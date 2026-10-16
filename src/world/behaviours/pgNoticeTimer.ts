import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { PG_NOTICE_DAYS } from '../../utils/constants';
import type { Behaviour } from './index';

/** Set by Shanthamma's notice line (story 1.3 F3). */
export const FLAG_NOTICE_GIVEN = 'pg_notice_given';
/** Nights left on the notice; absent = no notice given. */
export const PG_NOTICE_DAYS_LEFT = 'pg_notice_days_left';
/** The week is up: the deposit comes back, the cot goes (story 1.4 opens). */
export const FLAG_NOTICE_DUE = 'pg_notice_due';

/**
 * pgNoticeTimer — Shanthamma's one-week notice (story 1.3). The same shape as
 * the hotel's three nights: a flag starts the countdown, every sleep spends a
 * night, zero sets `pg_notice_due`. Fail-forward: nothing is taken away by
 * this behaviour; the flag is what the hill flat (1.4) reacts to.
 */
export const pgNoticeTimer: Behaviour = {
  attach() {
    const store = () => useGameStore.getState();
    const onFlag = ({ flag, value }: { flag: string; value: boolean }) => {
      if (flag !== FLAG_NOTICE_GIVEN || !value) return;
      if (store().counters[PG_NOTICE_DAYS_LEFT] !== undefined) return;
      store().setCounter(PG_NOTICE_DAYS_LEFT, PG_NOTICE_DAYS);
      gameEvents.emit('ui:toast', { text: `Notice given. ${PG_NOTICE_DAYS} nights to find a place of your own.` });
    };
    const onSlept = () => {
      const left = store().counters[PG_NOTICE_DAYS_LEFT];
      if (left === undefined || left <= 0) return;
      const next = left - 1;
      store().setCounter(PG_NOTICE_DAYS_LEFT, next);
      if (next > 0) gameEvents.emit('ui:toast', { text: `${next} night${next === 1 ? '' : 's'} left at Shanthamma's.` });
      else {
        store().setFlag(FLAG_NOTICE_DUE, true);
        gameEvents.emit('ui:toast', { text: 'Notice is up. Shanthamma has your deposit ready.' });
      }
    };
    const offs = [gameEvents.on('flag:set', onFlag), gameEvents.on('time:slept', onSlept)];
    return () => offs.forEach((f) => f());
  },
};
