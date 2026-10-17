import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import type { Behaviour } from './index';

/**
 * sleepEvents — "the first sleep after X, Y happens" as data (ADR-132): a
 * district lists `sleepEvents: [{ after, set, toast? }]`; on a sleep there,
 * an event whose `after` flag is set and whose first `set` flag is not yet
 * set fires once — its flags are set and its toast shows. Everything the
 * event changes in the world is data keyed on those flags (the P11 rule).
 */
export const sleepEvents: Behaviour = {
  attach({ district }) {
    const events = district.sleepEvents ?? [];
    if (!events.length) return;
    const onSlept = () => {
      const store = useGameStore.getState();
      for (const e of events) {
        if (!store.flags[e.after] || store.flags[e.set[0]]) continue;
        for (const f of e.set) store.setFlag(f, true);
        if (e.toast) gameEvents.emit('ui:toast', { text: e.toast, ...(e.icon ? { icon: e.icon } : {}) });
      }
    };
    return gameEvents.on('time:slept', onSlept);
  },
};
