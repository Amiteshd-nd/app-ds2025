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
/** Store counter: nights slept (in a district with sleepEvents) since `after` was set. */
export const nightsKey = (after: string): string => `nights_since:${after}`;

export const sleepEvents: Behaviour = {
  attach({ district, playCard }) {
    const events = district.sleepEvents ?? [];
    if (!events.length) return;
    // "The n-th night after X" (2.7's four mornings, ADR-135): nights slept here since X, one counter per X.
    const counted = [...new Set(events.filter((e) => e.nights).map((e) => e.after))];
    const onSlept = () => {
      const store = useGameStore.getState();
      for (const after of counted) if (store.flags[after]) store.setCounter(nightsKey(after), (store.counters[nightsKey(after)] ?? 0) + 1);
      for (const e of events) {
        if (!store.flags[e.after] || store.flags[e.set[0]]) continue;
        if (e.nights && (useGameStore.getState().counters[nightsKey(e.after)] ?? 0) < e.nights) continue;
        for (const f of e.set) store.setFlag(f, true);
        for (const f of e.clear ?? []) store.setFlag(f, false);
        // A night cut short (Ravi's message at 00:50): the clock goes back to that minute of the new day.
        if (e.wakeAt !== undefined) store.setClock({ day: store.clock.day, minute: e.wakeAt });
        if (e.toast) gameEvents.emit('ui:toast', { text: e.toast, ...(e.icon ? { icon: e.icon } : {}) });
        // A morning that opens on a card (ACT 3 — FEVER, ADR-136): it plays over the wake fade.
        if (e.card) playCard?.(e.card);
      }
    };
    return gameEvents.on('time:slept', onSlept);
  },
};
