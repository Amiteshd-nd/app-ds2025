import { gameEvents } from '../core/events';
import { useGameStore } from '../store';

/**
 * Carrying flat-pack (story 2.4, ADR-132): boxes take slots. Three is
 * comfortable, four is possible (the ride home gets harder), five is "Not
 * enough space". The count lives in a store counter so it survives a save
 * and a district change; the HUD shows it while it is above zero.
 */
export const CARRY_COUNTER = 'carry';
export const CARRY_COMFORT = 3;
export const CARRY_LIMIT = 4;
export const FLAG_CARRY_OVERLOADED = 'carry_overloaded';

export const carried = (): number => useGameStore.getState().counters[CARRY_COUNTER] ?? 0;

/** Would `slots` more boxes go past the hard limit? */
export const carryRefuses = (slots: number): boolean => slots > 0 && carried() + slots > CARRY_LIMIT;

/** Add (or with `clear`, drop) boxes; past the comfortable three the overloaded flag is set. */
export function carry(slots: number, clear = false): void {
  const store = useGameStore.getState();
  const next = clear ? 0 : Math.max(0, carried() + slots);
  store.setCounter(CARRY_COUNTER, next);
  if (next > CARRY_COMFORT) store.setFlag(FLAG_CARRY_OVERLOADED, true);
  else if (clear && store.flags[FLAG_CARRY_OVERLOADED]) store.setFlag(FLAG_CARRY_OVERLOADED, false);
  gameEvents.emit('ui:carry', { slots: next });
}

/** "BOXES 2/3" for the HUD; null when empty hands. */
export const carryText = (n = carried()): string | null => (n > 0 ? `BOXES ${n}/${CARRY_COMFORT}` : null);
