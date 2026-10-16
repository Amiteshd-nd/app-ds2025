import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import type { Behaviour } from './index';
import { FLAG_METRO_FREE_DAY, FLAG_METRO_OPEN, FLAG_SCOOTER_DECIDED } from './metroFlags';

/**
 * metroOpening — the world event (story 2.2 F1, ADR-05/127). Listed by the
 * district you sleep in: the first sleep after the scooter decision opens the
 * Purple Line's Whitefield stretch (`metro_open`) with rides free till the
 * next sleep (`metro_free_day`). Everything else is data on the flags: the
 * street swaps its barricade for the station mouth, Sameer's chat and the
 * reel arrive, the station district unlocks, Maps charges ₹0.
 */
export const metroOpening: Behaviour = {
  attach() {
    const store = () => useGameStore.getState();
    const onSlept = () => {
      const flags = store().flags;
      if (!flags[FLAG_METRO_OPEN]) {
        if (!flags[FLAG_SCOOTER_DECIDED]) return;
        store().setFlag(FLAG_METRO_OPEN, true);
        store().setFlag(FLAG_METRO_FREE_DAY, true);
        gameEvents.emit('ui:toast', { text: 'Purple Line: the Whitefield stretch opens today. Rides free till midnight.', icon: 'maps' });
      } else if (flags[FLAG_METRO_FREE_DAY]) {
        store().setFlag(FLAG_METRO_FREE_DAY, false);
      }
    };
    return gameEvents.on('time:slept', onSlept);
  },
};
