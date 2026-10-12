/**
 * Keyboard / gamepad focus (ADR-114: full up/down/left/right/confirm/back
 * navigation on every UI surface). Pure: given the focusable boxes and a
 * direction, which one is next? Nearest box whose centre lies that way,
 * preferring boxes in line with the current one.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export function nextFocus(boxes: Box[], current: number, dir: Direction): number {
  const from = boxes[current];
  if (!from) return boxes.length ? 0 : -1;
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  let best = current, bestScore = Infinity;
  boxes.forEach((b, i) => {
    if (i === current) return;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const dx = bx - cx, dy = by - cy;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) return;
    // Off-axis distance counts double: rows and columns win over diagonals.
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}
