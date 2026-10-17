import { gameEvents } from '../core/events';

/** Ask the AudioSystem for a sound by token (ADR-139). Scenes call this — never `sound.play`. */
export const cue = (token: string, at?: { x: number; y: number }): void => gameEvents.emit('audio:cue', { token, ...(at ? { at } : {}) });
