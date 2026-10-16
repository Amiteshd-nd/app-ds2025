import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { StatsManager } from '../../systems/StatsManager';
import { LATE_STRESS, OFFICE_START_MINUTE } from '../../utils/constants';
import { clockText } from '../../ui/kit/text';
import type { Behaviour } from './index';

/** Set by the office gate's arrival zone (district trigger `setFlags`). */
export const FLAG_OFFICE_ARRIVED = 'office_arrived';
/** Outcome of the first clock-in: exactly one of these is set. */
export const FLAG_ON_TIME = 'on_time_first_day';
export const FLAG_LATE = 'late_first_day';

/**
 * officeClockIn — the lateness cost of story 1.1 ("reach office by 9:30").
 * The office gate's arrival zone sets `office_arrived`; this reads the clock
 * once and records on-time or late, with stress and a toast for the latter.
 * Divya's Monday dialogue and chat branch on the flags. Fires once per run.
 */
export const officeClockIn: Behaviour = {
  attach() {
    const onFlag = ({ flag, value }: { flag: string; value: boolean }) => {
      if (flag !== FLAG_OFFICE_ARRIVED || !value) return;
      const store = useGameStore.getState();
      if (store.flags[FLAG_ON_TIME] || store.flags[FLAG_LATE]) return;
      const { minute } = store.clock;
      if (minute <= OFFICE_START_MINUTE) {
        store.setFlag(FLAG_ON_TIME, true);
        gameEvents.emit('ui:toast', { text: `${clockText(minute)}. Made it.` });
      } else {
        store.setFlag(FLAG_LATE, true);
        StatsManager.getInstance().adjust('stress', LATE_STRESS);
        gameEvents.emit('ui:toast', { text: `${clockText(minute)}. Divya noticed.` });
      }
    };
    const off = gameEvents.on('flag:set', onFlag);
    return () => off();
  },
};
