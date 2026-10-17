import type { Bus } from './data';

export interface AudioSettings { master: number; music: number; sfx: number; ambience: number; muted: boolean }

/**
 * Bus gains from Settings → Audio (audio plan v1 §2.5): master × the bus's
 * slider; `ui` follows SFX and `voice` follows master (four sliders exist);
 * mute silences everything. Sliders are 0–100.
 */
export function busGain(bus: Bus, s: AudioSettings): number {
  if (s.muted) return 0;
  const master = s.master / 100;
  switch (bus) {
    case 'music': return master * (s.music / 100);
    case 'ambience': return master * (s.ambience / 100);
    case 'sfx':
    case 'ui': return master * (s.sfx / 100);
    default: return master;
  }
}

/** −6 dB under dialogue; nothing under a sting or a card's cut. */
export const DUCK = { dialogue: 0.5, sting: 0 } as const;
