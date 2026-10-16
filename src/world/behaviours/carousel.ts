import { depthForZY } from '../../core/depth';
import { LAYERS } from '../../utils/constants';
import { findObject } from '../Zones';
import type { Behaviour } from './index';

/** Luggage props imported by scripts/import-props.mjs. */
const LUGGAGE = Array.from({ length: 12 }, (_, i) => `luggage_${String(i + 1).padStart(2, '0')}`);
/** Belt speed, px/s, and how many bags ride it. */
const SPEED = 20;
const COUNT = 9;

export interface Stadium { x: number; y: number; w: number; h: number }

/**
 * A point on a stadium loop (two straights joined by half circles) at
 * distance `d` along it, clockwise from the top-left of the top straight.
 * Pure — the belt's geometry, tested on its own.
 */
export function stadiumPoint({ x, y, w, h }: Stadium, d: number): { x: number; y: number } {
  const r = h / 2;
  const straight = Math.max(0, w - h);
  const arc = Math.PI * r;
  const total = 2 * straight + 2 * arc;
  let t = ((d % total) + total) % total;
  const left = x + r, right = x + r + straight, cy = y + r;
  if (t < straight) return { x: left + t, y };
  t -= straight;
  if (t < arc) { const a = -Math.PI / 2 + t / r; return { x: right + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
  t -= arc;
  if (t < straight) return { x: right - t, y: y + h };
  t -= straight;
  const a = Math.PI / 2 + t / r;
  return { x: left + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export const stadiumLength = ({ w, h }: Stadium): number => 2 * Math.max(0, w - h) + Math.PI * h;

/**
 * beh_carousel — luggage riding the baggage carousel. The district map holds
 * a `carousel_belt` zone (the belt's centre-line rectangle); bags are spaced
 * along it and moved each frame, depth-sorted by their bottom edge so the
 * player stands behind or in front of them like anything else. Reduced
 * motion: the bags sit still on the belt.
 */
export const beh_carousel: Behaviour = {
  attach({ scene, map, reducedMotion }) {
    const zone = findObject(map, LAYERS.spawns, 'carousel_belt');
    if (!zone?.width || !zone.height) {
      console.error('[beh_carousel] no carousel_belt zone in this map');
      return;
    }
    const belt: Stadium = { x: zone.x ?? 0, y: zone.y ?? 0, w: zone.width, h: zone.height };
    const length = stadiumLength(belt);
    const keys = LUGGAGE.filter((k) => scene.textures.exists(k));
    if (!keys.length) return;

    // Uneven gaps, like real luggage coming off a flight.
    const bags = Array.from({ length: COUNT }, (_, i) => {
      const image = scene.add.image(0, 0, keys[(i * 5) % keys.length]).setOrigin(0.5, 0.75);
      return { image, d: (i / COUNT) * length + ((i * 37) % 23) };
    });
    const place = () => {
      for (const bag of bags) {
        const p = stadiumPoint(belt, bag.d);
        bag.image.setPosition(Math.round(p.x), Math.round(p.y));
        bag.image.setDepth(depthForZY(bag.image.y + bag.image.displayHeight * 0.25));
      }
    };
    place();
    if (reducedMotion) return () => bags.forEach((b) => b.image.destroy());

    const update = (_time: number, delta: number) => {
      for (const bag of bags) bag.d += (SPEED * delta) / 1000;
      place();
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      bags.forEach((b) => b.image.destroy());
    };
  },
};
