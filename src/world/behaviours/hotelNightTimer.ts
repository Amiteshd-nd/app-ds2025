import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { HOTEL_EXTRA_NIGHT, HOTEL_NIGHTS } from '../../utils/constants';
import { StatsManager } from '../../systems/StatsManager';
import type { Behaviour } from './index';

/** Counter the HUD shows while the hotel is paying; absent = not checked in. */
export const HOTEL_NIGHTS_LEFT = 'hotel_nights_left';
export const FLAG_CHECKED_IN = 'hotel_checked_in';
export const FLAG_NIGHTS_DONE = 'hotel_nights_done';
/** Set by the first real night in the hotel — the quest's "sleep" objective. */
export const FLAG_SLEPT_ONCE = 'hotel_slept_once';

/**
 * hotelNightTimer — the first timer the player meets (story 0.2, reveal #5
 * "time-limited stay"). Checking in (the receptionist's line sets
 * `hotel_checked_in`) starts a three-night countdown; every sleep in the
 * hotel bed spends one; at zero the stay is over and `hotel_nights_done`
 * opens the PG hunt. A behaviour, not WorldScene code: the district lists it.
 *
 * Fail-forward: the hotel never throws the player out mid-scene — the flag
 * is what the receptionist and the PG quest react to.
 */
export const hotelNightTimer: Behaviour = {
  attach() {
    const store = () => useGameStore.getState();

    const onFlag = ({ flag, value }: { flag: string; value: boolean }) => {
      if (flag !== FLAG_CHECKED_IN || !value) return;
      if (store().counters[HOTEL_NIGHTS_LEFT] === undefined) {
        store().setCounter(HOTEL_NIGHTS_LEFT, HOTEL_NIGHTS);
        gameEvents.emit('ui:toast', { text: `Company booking: ${HOTEL_NIGHTS} nights. Find a PG before it runs out.` });
      }
    };

    const onSlept = () => {
      const left = store().counters[HOTEL_NIGHTS_LEFT];
      if (left === undefined) return;
      if (left <= 0) {
        // Past checkout and still here: the receptionist's ₹1,800 rate. Never
        // a lock — if the wallet is short, the night is let go (fail-forward).
        if (store().flags.pg_signed) return;
        const paid = StatsManager.getInstance().spend(HOTEL_EXTRA_NIGHT, 'hotel_extra_night', 'Hotel Sri Lakshmi');
        gameEvents.emit('ui:toast', {
          text: paid
            ? `Hotel charged ₹${HOTEL_EXTRA_NIGHT.toLocaleString('en-IN')} for the night. Find a PG.`
            : 'Reception let the night go — "only once, ah". Find a PG.',
        });
        return;
      }
      const next = left - 1;
      store().setCounter(HOTEL_NIGHTS_LEFT, next);
      store().setFlag(FLAG_SLEPT_ONCE, true);
      if (next > 0) {
        gameEvents.emit('ui:toast', { text: `Morning. ${next} hotel night${next === 1 ? '' : 's'} left.` });
      } else {
        store().setFlag(FLAG_NIGHTS_DONE, true);
        gameEvents.emit('ui:toast', { text: 'Checkout day. The hotel will not extend.' });
      }
    };

    const offs = [gameEvents.on('flag:set', onFlag), gameEvents.on('time:slept', onSlept)];
    return () => offs.forEach((off) => off());
  },
};
