import { gameEvents } from '../../core/events';
import { mulberry32, seedOf } from '../../systems/rng';
import { useGameStore } from '../../store';
import type { Behaviour } from './index';

/**
 * clockEvents — "at 16:58, X happens" as data (story 4.1's plates, ADR-148):
 * a district lists `clockEvents: [{ at, set, toast?, cue? }]`; once the clock
 * reaches `at` while you are here (and the first `set` flag is not yet set),
 * the flags are set, the toast shows and the cue plays. `cueLoops` keep a
 * sound going from named spots while a flag is set and another is not — a
 * whole lane banging plates. Everything the event changes is data keyed on
 * those flags (people by `requiresFlag`/`unlessFlag`, packs by `requiresFlag`,
 * stability by `stabilityIf`). Seeded, so Movie Mode hears the same clangs.
 */
export const clockEvents: Behaviour = {
  attach({ scene, district }) {
    const events = district.clockEvents ?? [];
    const loops = district.cueLoops ?? [];
    if (!events.length && !loops.length) return;
    const rng = mulberry32(seedOf(`${district.id}:cues`));
    const nextAt = loops.map(() => 0);
    let now = 0;
    const point = (name: string) => (scene as unknown as { pointOf(n: string): { x: number; y: number } | null }).pointOf(name);
    const update = (_t: number, delta: number) => {
      now += delta;
      const s = useGameStore.getState();
      for (const e of events) {
        if (s.clock.minute < e.at || s.flags[e.set[0]]) continue;
        for (const f of e.set) s.setFlag(f, true);
        if (e.toast) gameEvents.emit('ui:toast', { text: e.toast, ...(e.icon ? { icon: e.icon } : {}) });
        if (e.cue) gameEvents.emit('audio:cue', { token: e.cue });
      }
      loops.forEach((l, i) => {
        if (!s.flags[l.whileFlag] || (l.untilFlag && s.flags[l.untilFlag]) || now < nextAt[i]) return;
        const at = point(l.at[Math.floor(rng() * l.at.length)]);
        gameEvents.emit('audio:cue', { token: l.token, ...(at ? { at } : {}) });
        nextAt[i] = now + l.everyMs[0] + rng() * (l.everyMs[1] - l.everyMs[0]);
      });
    };
    scene.events.on('update', update);
    return () => scene.events.off('update', update);
  },
};
