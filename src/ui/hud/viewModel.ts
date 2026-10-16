import type { GameClock, QuestState } from '../../store';
import { HUNGRY_AT } from '../../utils/constants';
import type { PlayerStats, QuestFile } from '../../utils/types';
import type { IconName } from '../kit/icons';
import { clockText, measure, rupees, truncate, wrap } from '../kit/text';
import type { TokenName } from '../tokens';
import type { HudGlyphName } from './glyphs';
import { HUD, SKY, TYPEWRITER_MS, type DialogueSpeed } from './layout';

/**
 * What the HUD shows, computed from the store — no pixels, no Phaser
 * (ADR-118). HudScene draws exactly this; tests check it.
 *
 * The rule from design_system §5 and the style board: minimal and contextual.
 * A meter appears only when it matters; the wallet only after money moved;
 * the objective collapses to its ★ once read; the location card says hello
 * on arrival and leaves.
 */

// ── Objective ────────────────────────────────────────────────────────────

/**
 * The one line under the ★: the first open, non-optional objective of the
 * oldest active quest (insertion order — the hotel's last step sits above a
 * PG hunt that started later). Null when nothing is open.
 */
export function objectiveLine(quests: QuestState, catalogue: Record<string, QuestFile>): string | null {
  for (const id of Object.keys(quests.active)) {
    const quest = catalogue[id];
    if (!quest) continue;
    const done = quests.active[id];
    const next = quest.objectives.find((o) => !o.optional && !done.includes(o.id)) ?? quest.objectives.find((o) => !done.includes(o.id));
    if (next) return next.text;
  }
  return null;
}

/** The objective text cut to its plate; mixed case (content, not a label). */
export const objectiveText = (line: string, maxTextW = HUD.objective.maxTextW): string => truncate(line, maxTextW);

// ── Clock ────────────────────────────────────────────────────────────────

export type SkyGlyph = Extract<HudGlyphName, 'sunrise' | 'sun' | 'sunset' | 'moon'>;

/** Sunrise 05–08, sun until 17, sunset until 19, moon otherwise. */
export function clockGlyph(minute: number): SkyGlyph {
  const m = ((minute % 1440) + 1440) % 1440;
  if (m >= SKY.night || m < SKY.sunrise) return 'moon';
  if (m < SKY.day) return 'sunrise';
  if (m < SKY.sunset) return 'sun';
  return 'sunset';
}

/** "DAY 3 · 08:41" — uppercase, a label. */
export const clockLabel = (clock: GameClock): string => `DAY ${clock.day} · ${clockText(clock.minute)}`;

// ── Location ─────────────────────────────────────────────────────────────

export interface LocationCard {
  /** UPPERCASE district name, truncated to its card. */
  name: string;
  /** First time here: the NEW tag in the ★ colour. */
  isNew: boolean;
}

export const locationCard = (districtName: string, firstVisit: boolean, maxTextW = HUD.locationMaxTextW): LocationCard => ({
  name: truncate(districtName.toUpperCase(), maxTextW, true),
  isNew: firstVisit,
});

// ── Wallet ───────────────────────────────────────────────────────────────

export interface WalletView {
  /** '₹34,980' */
  balance: string;
  /** '-₹20' / '+₹500' in the colour of its direction; absent when nothing moved. */
  tick?: { text: string; tone: TokenName };
}

export function walletView(balance: number, moved: number | null): WalletView {
  const view: WalletView = { balance: rupees(balance) };
  if (moved !== null && moved !== 0) view.tick = { text: rupees(moved, true), tone: moved < 0 ? 'phone.accent.alert' : 'phone.accent.upi' };
  return view;
}

// ── Meters ───────────────────────────────────────────────────────────────

export type MeterId = 'health' | 'food' | 'stress';
export interface Meter {
  id: MeterId;
  icon: Extract<HudGlyphName, 'heart' | 'bowl' | 'bolt'>;
  /** Filled blocks out of 5. */
  blocks: number;
  /** Drawn in the alert colour: the stat bites now. */
  critical: boolean;
}

/** Stats that show: health under 70, food under 50, stress above 0 — or all three when Settings say "always". */
export const METER_SHOWS = { health: 70, food: 50 } as const;
/** Stats that bite: health under 30, food under the hunger line (ADR-97), stress 70 and up. */
export const METER_BITES = { health: 30, food: HUNGRY_AT, stress: 70 } as const;

const blocksOf = (v: number): number => Math.max(0, Math.min(5, Math.ceil(v / 20)));

export function meters(stats: Pick<PlayerStats, 'health' | 'food' | 'stress'>, mode: 'auto' | 'always'): Meter[] {
  const out: Meter[] = [];
  if (mode === 'always' || stats.health < METER_SHOWS.health) out.push({ id: 'health', icon: 'heart', blocks: blocksOf(stats.health), critical: stats.health < METER_BITES.health });
  if (mode === 'always' || stats.food < METER_SHOWS.food) out.push({ id: 'food', icon: 'bowl', blocks: blocksOf(stats.food), critical: stats.food < METER_BITES.food });
  if (mode === 'always' || stats.stress > 0) out.push({ id: 'stress', icon: 'bolt', blocks: blocksOf(stats.stress), critical: stats.stress >= METER_BITES.stress });
  return out;
}

// ── Top-left stack ───────────────────────────────────────────────────────

export interface StackRow {
  kind: 'objective' | 'location' | 'meter';
  y: number;
  h: number;
  meter?: Meter;
}

/** Plates stack down the left edge, each `stackGap` under the one above, in a fixed order. */
export function stackRows(parts: { objective: boolean; location: boolean; meters: Meter[] }): StackRow[] {
  const rows: StackRow[] = [];
  let y = HUD.pad;
  const push = (kind: StackRow['kind'], h: number, meter?: Meter) => {
    rows.push({ kind, y, h, meter });
    y += h + (kind === 'meter' ? HUD.meter.gap : HUD.stackGap);
  };
  if (parts.objective) push('objective', HUD.plateH);
  if (parts.location) push('location', HUD.plateH);
  for (const m of parts.meters) push('meter', HUD.meter.h, m);
  return rows;
}

// ── Prompt ───────────────────────────────────────────────────────────────

export type InputMode = 'keys' | 'touch';

/** '[E] TALK' on a keyboard; 'TALK' after a fingertip glyph on touch. */
export const promptLabel = (verb: string, input: InputMode): string => (input === 'keys' ? `[E] ${verb}` : verb);

// ── Toasts ───────────────────────────────────────────────────────────────

export interface Toast {
  text: string;
  icon?: IconName;
}

export interface ToastLayout {
  lines: string[];
  w: number;
  h: number;
}

/** Wrap to two lines at most; the plate grows to fit. */
export function toastLayout(toast: Toast, maxTextW = HUD.toast.maxTextW): ToastLayout {
  const iconW = toast.icon ? 16 + 4 : 0;
  const lines = wrap(toast.text, maxTextW - iconW).slice(0, 2);
  const textW = Math.max(...lines.map((l) => measure(l)));
  return { lines, w: 6 + iconW + textW + 7, h: lines.length === 1 ? HUD.plateH : HUD.plateH + 12 };
}

/**
 * One toast at a time, each for `holdMs`; the rest wait their turn
 * (settings_and_saveload §2: "Toast 'Saved'" — many systems speak at once on
 * arrival, so they queue instead of stacking). Identical consecutive lines
 * collapse; the queue never grows past `max`.
 */
export class ToastQueue {
  private queue: Toast[] = [];
  private current: { toast: Toast; until: number } | null = null;

  constructor(private holdMs: number, private max = 8) {}

  /** Enqueue. Nothing shows until the next tick(), so a toast raised while the HUD is hidden waits for it. */
  push(toast: Toast): void {
    const last = this.queue[this.queue.length - 1] ?? this.current?.toast;
    if (last && last.text === toast.text) return;
    if (this.queue.length >= this.max) this.queue.shift();
    this.queue.push(toast);
  }

  /** The toast to show at `now`, or null. Call every frame or on a timer. */
  tick(now: number): Toast | null {
    if (this.current && now >= this.current.until) this.current = null;
    this.advance(now);
    return this.current?.toast ?? null;
  }

  /** When the current toast leaves (ms); null when nothing is up. */
  nextChange(): number | null {
    return this.current?.until ?? null;
  }

  get pending(): number {
    return this.queue.length;
  }

  private advance(now: number): void {
    if (this.current || !this.queue.length) return;
    this.current = { toast: this.queue.shift()!, until: now + this.holdMs };
  }
}

// ── Typewriter ───────────────────────────────────────────────────────────

/** Characters revealed `elapsedMs` into a line at a given speed (design system §7: 30 ms/char, skippable). */
export function revealedChars(elapsedMs: number, total: number, speed: DialogueSpeed): number {
  const per = TYPEWRITER_MS[speed];
  if (per <= 0) return total;
  return Math.max(0, Math.min(total, Math.floor(elapsedMs / per)));
}
