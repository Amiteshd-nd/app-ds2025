import type { DialogueChoiceView } from '../../systems/DialogueManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../utils/constants';
import { MIN_TAP } from '../kit/molecules';
import { measure, wrap } from '../kit/text';
import { HUD } from './layout';

/**
 * Dialogue card geometry (P6c, ADR-118): a label card along the bottom with
 * the speaker on a white pill over its top edge, the line in mixed case,
 * the bill under negotiation on its own line, and the choices as pills that
 * flow left to right and wrap into rows. The card grows upward to fit.
 * Pure: HudScene paints it, tests measure it.
 */
export const DIALOGUE = {
  x: HUD.pad,
  w: GAME_WIDTH - 2 * HUD.pad - 36, // room for the card's dotted trail on the right
  bottom: HUD.safeBottom,
  pad: 14,
  /** Body line pitch: 7px caps + 7 air. */
  lineH: 14,
  minH: 86,
  pill: { h: 17, padX: 22, gap: 8 },
  rowGap: 4,
  speaker: { h: 15, padX: 7, lift: 7 },
  /** Lines of body text per card at most — content stays ≤ 40 chars a line by the design system, so two is plenty. */
  maxLines: 3,
} as const;

export interface PillBox {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DialogueLayout {
  y: number;
  h: number;
  bodyLines: string[];
  bodyY: number;
  ledgerY: number | null;
  pills: PillBox[];
  /** The chevron / hint corner. */
  cornerX: number;
  cornerY: number;
  /** Where a locked choice's reason is written. */
  reasonY: number | null;
}

/** Pill width: text plus room for the ▶ cursor, fixed so rows do not reflow as the selection moves. */
export const pillWidth = (text: string): number => measure(text, true) + DIALOGUE.pill.padX;

/** Lay the card out for a node's text, bill and choices. */
export function layoutDialogue(view: { text: string; ledger?: string; choices: Pick<DialogueChoiceView, 'text' | 'enabled'>[] }, hasLockedSelected = false): DialogueLayout {
  const innerW = DIALOGUE.w - 2 * DIALOGUE.pad;
  const bodyLines = wrap(view.text, innerW).slice(0, DIALOGUE.maxLines);

  // Choices flow into rows.
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  view.choices.forEach((c, i) => {
    const w = pillWidth(c.text);
    if (row.length && used + DIALOGUE.pill.gap + w > innerW) { rows.push(row); row = []; used = 0; }
    row.push(i);
    used += (row.length > 1 ? DIALOGUE.pill.gap : 0) + w;
  });
  if (row.length) rows.push(row);

  let h = DIALOGUE.pad + bodyLines.length * DIALOGUE.lineH;
  const bodyY = DIALOGUE.pad;
  let ledgerY: number | null = null;
  if (view.ledger) { ledgerY = h + 2; h += DIALOGUE.lineH + 2; }
  let choicesY = 0;
  if (rows.length) {
    choicesY = h + 6;
    h = choicesY + rows.length * (DIALOGUE.pill.h + DIALOGUE.rowGap) - DIALOGUE.rowGap;
  }
  let reasonY: number | null = null;
  if (hasLockedSelected) { reasonY = h + 6; h = reasonY + 7; }
  h = Math.max(DIALOGUE.minH, h + 12);
  const y = DIALOGUE.bottom - h;

  const pills: PillBox[] = [];
  rows.forEach((indices, r) => {
    let x = DIALOGUE.x + DIALOGUE.pad;
    for (const i of indices) {
      const w = pillWidth(view.choices[i].text);
      pills.push({ index: i, x, y: y + choicesY + r * (DIALOGUE.pill.h + DIALOGUE.rowGap), w, h: DIALOGUE.pill.h });
      x += w + DIALOGUE.pill.gap;
    }
  });

  return {
    y, h, bodyLines, bodyY: y + bodyY,
    ledgerY: ledgerY === null ? null : y + ledgerY,
    pills,
    cornerX: DIALOGUE.x + DIALOGUE.w - 18,
    cornerY: y + h - 12,
    reasonY: reasonY === null ? null : y + reasonY,
  };
}

/**
 * The pill under a finger: pills are 17px tall, so zones grown to MIN_TAP
 * overlap between rows — inside its zone, the pill whose drawn rectangle is
 * nearest the finger wins (0 when the finger is on the pill itself).
 */
export function pillAt(pills: PillBox[], px: number, py: number): PillBox | null {
  let best: PillBox | null = null;
  let bestD = Infinity;
  for (const p of pills) {
    const zw = Math.max(p.w, MIN_TAP), zh = Math.max(p.h, MIN_TAP);
    const zx = p.x - (zw - p.w) / 2, zy = p.y - (zh - p.h) / 2;
    if (px < zx || px >= zx + zw || py < zy || py >= zy + zh) continue;
    const dx = Math.max(p.x - px, 0, px - (p.x + p.w)), dy = Math.max(p.y - py, 0, py - (p.y + p.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** True when the point is on the card (a tap there advances the line). */
export const onCard = (layout: DialogueLayout, px: number, py: number): boolean =>
  px >= DIALOGUE.x && px < DIALOGUE.x + DIALOGUE.w + 36 && py >= layout.y - DIALOGUE.speaker.lift && py < Math.min(GAME_HEIGHT, layout.y + layout.h);
