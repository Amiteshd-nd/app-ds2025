import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { nightsKey } from './sleepEvents';
import type { Behaviour } from './index';

/** "Discharge · 2 nights" → "Discharge · today" (story 3.4, ADR-142). */
export const countdownText = (label: string, left: number): string => (left > 0 ? `${label} · ${left} night${left === 1 ? '' : 's'}` : `${label} · today`);

/**
 * countdown — the hotel's three-night plate, as data (story 3.4 echoes 0.2,
 * ADR-142): a district names `countdown: { after, nights, label }`; once
 * `after` is set, the HUD's timer plate shows the nights left, counted by the
 * same nights-since counter `sleepEvents` keeps (list `sleepEvents` before
 * `countdown`, so the counter has moved when the plate redraws). No flags of its own.
 */
export const countdown: Behaviour = {
  attach({ district }) {
    const c = district.countdown;
    if (!c) return;
    const show = () => {
      const s = useGameStore.getState();
      if (!s.flags[c.after]) return;
      const left = Math.max(0, c.nights - (s.counters[nightsKey(c.after)] ?? 0));
      gameEvents.emit('ui:timer', { text: countdownText(c.label, left) });
    };
    show();
    const offs = [gameEvents.on('flag:set', show), gameEvents.on('time:slept', show)];
    return () => { for (const off of offs) off(); gameEvents.emit('ui:timer', { text: null }); };
  },
};
