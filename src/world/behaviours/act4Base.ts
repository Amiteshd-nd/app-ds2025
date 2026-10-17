import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { ACT4_FLAG } from '../../systems/stability';
import { StatsManager } from '../../systems/StatsManager';
import { baseNight } from '../../systems/trade';
import type { DistrictDef } from '../../utils/types';
import type { Behaviour } from './index';

/** Store flag: the base you last woke in — failing forward lands there (ADR-149). */
export const homeFlag = (districtId: string): string => `base_home:${districtId}`;
/** Store counter: nights slept at a base. */
export const baseNightsKey = (districtId: string): string => `base_nights:${districtId}`;
/** Food a breakfast from the stock gives. */
const BREAKFAST = 40;

/** Is this place a working base right now (Act 4, and its own flag)? */
export const baseActive = (d: DistrictDef, flags: Record<string, boolean>): boolean =>
  Boolean(d.base && flags[ACT4_FLAG] && (!d.base.requiresFlag || flags[d.base.requiresFlag]));

/**
 * act4Base (Act 4 plan §3.9, ADR-149) — a night at a base: one food, one
 * water, one fuel from the stock (`systems/trade.baseNight`). Breakfast if
 * there was food; thirst if there was no water; and if there was no fuel —
 * or this is the night the lamp fails — the lamp was dark: something tried
 * the door. Waking here makes it home. A place without a base costs nothing.
 */
export const act4Base: Behaviour = {
  attach({ district }) {
    if (!district.base) return;
    return gameEvents.on('time:slept', () => {
      const s = useGameStore.getState();
      if (!baseActive(district, s.flags)) return;
      const nights = (s.counters[baseNightsKey(district.id)] ?? 0) + 1;
      s.setCounter(baseNightsKey(district.id), nights);
      const night = baseNight(s.counters, nights, district.base!.lampFailsOnNight);
      for (const [c, n] of Object.entries(night.take)) s.setCounter(c, Math.max(0, (s.counters[c] ?? 0) + n));
      const stats = StatsManager.getInstance();
      const lines: string[] = [];
      if (night.ate) stats.adjust('food', BREAKFAST); else lines.push('Nothing to eat.');
      if (!night.drank) { stats.adjust('health', -10); lines.push('No water.'); }
      if (!night.lit) {
        stats.adjust('stress', 15);
        lines.push(night.failed ? 'The lamp failed in the night. Something tried the door.' : 'No fuel: the lamp was dark. Something tried the door.');
        s.setFlag(`base_dark:${district.id}`, true);
      }
      for (const f of Object.keys(s.flags)) if (f.startsWith('base_home:') && f !== homeFlag(district.id) && s.flags[f]) s.setFlag(f, false);
      s.setFlag(homeFlag(district.id), true);
      if (lines.length) gameEvents.emit('ui:toast', { text: lines.join(' ') });
    });
  },
};
