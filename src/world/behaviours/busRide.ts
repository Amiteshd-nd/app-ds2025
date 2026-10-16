import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import type { Behaviour } from './index';

/** "Cubbon Park · 0:18" — the ride's countdown on the HUD. */
export const rideTimerText = (label: string, secondsLeft: number): string => {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `${label} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * busRide — a ride that ends on its own (story 1.5 F3, ADR-123). The bus
 * interior lists `ride: { seconds, exit, flag, label }`: the countdown runs
 * only while the player is free (a conversation with a passenger holds it),
 * then the flag is set (the door's `requiresFlag`) and the scene leaves
 * through the exit. Clear the flag on attach so a reload mid-ride still rides.
 */
export const busRide: Behaviour = {
  attach({ scene, district, playerFree, leave }) {
    const ride = district.ride;
    if (!ride) return;
    const store = () => useGameStore.getState();
    if (store().flags[ride.flag]) store().setFlag(ride.flag, false);
    let left = ride.seconds;
    let lastText: string | null = null;
    let done = false;
    const update = (_t: number, delta: number) => {
      if (done) return;
      if (playerFree()) left -= delta / 1000;
      const text = rideTimerText(ride.label, left);
      if (text !== lastText) { lastText = text; gameEvents.emit('ui:timer', { text }); }
      if (left <= 0) {
        done = true;
        store().setFlag(ride.flag, true);
        gameEvents.emit('ui:timer', { text: null });
        gameEvents.emit('ui:toast', { text: `${ride.label}. Everybody down.`, icon: 'bus' });
        leave(ride.exit);
      }
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      gameEvents.emit('ui:timer', { text: null });
    };
  },
};
