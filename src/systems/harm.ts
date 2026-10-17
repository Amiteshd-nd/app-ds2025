/**
 * Getting hurt, and what happens at zero (act4 doc §5, Act 4 plan §3.5 and
 * §8 Q4, ADR-145). Pure numbers and rules; the world applies them.
 *
 * A touch costs 20 health and 15 stress; a second touch within 5 s is a grab
 * (35 / 25). Getting away with them right behind you costs a little (5 / 10).
 * At 0 health in Act 4 you fail forward: you wake at your base the next
 * morning with half of what you carried, stress +20. A hit never infects you.
 */
export const HARM = {
  touch: { health: -20, stress: 15 },
  grab: { health: -35, stress: 25 },
  grabWindowMs: 5000,
  narrowEscape: { health: -5, stress: 10 },
  /** Closer than this (px) at the moment a chase is lost = a narrow escape. */
  narrowPx: 48,
  witness: { stress: 30 },
} as const;

export const FAIL_FORWARD = {
  stress: 20,
  /** Health you wake with before the night's sleep adds its share. */
  wakeHealth: 25,
} as const;

/** A touch or a grab, by when the last one landed. */
export function hitKind(lastHitAt: number | null, now: number): 'touch' | 'grab' {
  return lastHitAt !== null && now - lastHitAt <= HARM.grabWindowMs ? 'grab' : 'touch';
}

/**
 * What you lose when you fail forward: every second carried thing, counted
 * down the list (deterministic — no dice), never a key item.
 */
export function itemsLost(items: Array<{ id: string; count: number; key?: boolean }>): Array<{ id: string; count: number }> {
  const out: Array<{ id: string; count: number }> = [];
  let k = 0;
  for (const it of items) {
    if (it.key) continue;
    let lose = 0;
    for (let i = 0; i < it.count; i++, k++) if (k % 2 === 1) lose++;
    if (lose) out.push({ id: it.id, count: lose });
  }
  return out;
}
