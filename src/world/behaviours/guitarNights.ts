import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import type { Behaviour } from './index';

export const FLAG_GUITAR_IN_STOCK = 'guitar_in_stock';
export const FLAG_GUITAR_PLAYED_TONIGHT = 'guitar_played_tonight';
const FLAG_METRO_DONE = 'act2_metro_done';

/**
 * guitarNights — story 2.3's two night rules (ADR-131), listed by the flat:
 * the first sleep after the metro ride is "Tuesday" — the shop's new stock is
 * in (`guitar_in_stock`; the shop's text, the note and the Maps stop follow
 * from the flag) — and every sleep clears `guitar_played_tonight`, so the
 * guitar offers one session a night.
 */
export const guitarNights: Behaviour = {
  attach() {
    const store = () => useGameStore.getState();
    const onSlept = () => {
      const flags = store().flags;
      if (flags[FLAG_GUITAR_PLAYED_TONIGHT]) store().setFlag(FLAG_GUITAR_PLAYED_TONIGHT, false);
      if (!flags[FLAG_GUITAR_IN_STOCK] && flags[FLAG_METRO_DONE]) {
        store().setFlag(FLAG_GUITAR_IN_STOCK, true);
        gameEvents.emit('ui:toast', { text: 'Guitar shop: "Tuesday. Spruce top kept aside."', icon: 'chats' });
      }
    };
    return gameEvents.on('time:slept', onSlept);
  },
};
