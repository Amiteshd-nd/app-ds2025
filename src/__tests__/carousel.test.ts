import { describe, expect, it } from 'vitest';
import { stadiumLength, stadiumPoint } from '../world/behaviours/carousel';

describe('beh_carousel — belt geometry', () => {
  const belt = { x: 100, y: 200, w: 400, h: 100 }; // straights of 300, radius 50

  it('runs the top straight left→right, then the bottom one right→left', () => {
    expect(stadiumPoint(belt, 0)).toEqual({ x: 150, y: 200 });
    expect(stadiumPoint(belt, 300)).toEqual({ x: 450, y: 200 });
    const bottomStart = stadiumPoint(belt, 300 + Math.PI * 50);
    expect(bottomStart.x).toBeCloseTo(450);
    expect(bottomStart.y).toBeCloseTo(300);
  });

  it('stays on the loop: the right turn passes the far edge, and it wraps', () => {
    const mid = stadiumPoint(belt, 300 + (Math.PI * 50) / 2);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(250);
    expect(stadiumLength(belt)).toBeCloseTo(600 + Math.PI * 100);
    const a = stadiumPoint(belt, 42), b = stadiumPoint(belt, 42 + stadiumLength(belt));
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });
});
