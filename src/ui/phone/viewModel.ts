import { DISTRICTS } from '../../data';
import { useGameStore } from '../../store';
import type { GameClock, Transaction } from '../../store';
import type { ChatMessage, ChatThread, PhoneApp, PhotoDef, ReelClip } from '../../utils/types';
import type { IconName } from '../kit/icons';
import type { UiState } from '../kit/molecules';
import { clockText, measure, rupees, truncate, wrap } from '../kit/text';
import { HOME } from './layout';

/**
 * What the phone shows, computed from PhoneManager + store — no pixels, no
 * Phaser (ADR-114). PhoneScene draws exactly this; tests check it.
 */

export type AppView = PhoneApp & { unlocked: boolean };

export interface HomeTile {
  id: string;
  icon: IconName;
  /** UPPERCASE; null when locked (ADR-39: locked apps carry no label). */
  label: string | null;
  state: UiState;
  badge: number;
  hint?: string;
}

const DOCK_SLOTS = 4;
const GRID_SLOTS = HOME.cols * HOME.rows;

export function homeTiles(apps: AppView[], unread: number): { grid: HomeTile[]; dock: HomeTile[] } {
  const sorted = [...apps].sort((a, b) => a.order - b.order);
  const tile = (a: AppView): HomeTile => ({
    id: a.id,
    icon: a.icon as IconName,
    label: a.unlocked ? a.name.toUpperCase() : null,
    state: a.unlocked ? 'default' : 'locked',
    badge: a.id === 'chats' ? unread : 0,
    hint: a.hint,
  });
  return {
    dock: sorted.filter((a) => a.dock).slice(0, DOCK_SLOTS).map(tile),
    grid: sorted.filter((a) => !a.dock).slice(0, GRID_SLOTS).map(tile),
  };
}

/** Signal bars where the player stands: a zone's override (the hill's rooms), else the district's own value, else its parent's, else full. */
export function signalAt(districtId: string | null, override: number | null = useGameStore.getState().signalOverride): number {
  if (override !== null && override !== undefined) return Math.max(0, Math.min(4, override));
  let d = districtId ? DISTRICTS[districtId] : undefined;
  const flags = useGameStore.getState().flags;
  const byFlag = (d?.signalIf ?? []).filter((s) => flags[s.flag]).pop();
  if (byFlag) return Math.max(0, Math.min(4, byFlag.bars));
  for (let i = 0; d && i < 5; i++) {
    if (d.signal !== undefined) return Math.max(0, Math.min(4, d.signal));
    d = d.realworld && 'parent' in d.realworld ? DISTRICTS[d.realworld.parent] : undefined;
  }
  return 4;
}

export interface StatusBar {
  time: string;
  battery: number;
  /** Battery drawn in the alert colour at or under this. */
  batteryLow: boolean;
  bars: number;
  carrier: string;
}

/** Diegetic status bar: in-game clock, cosmetic battery, district signal, parody carrier. */
export function statusBar(clock: GameClock, battery: number, districtId: string | null): StatusBar {
  const b = Math.max(0, Math.min(100, Math.round(battery)));
  return { time: clockText(clock.minute), battery: b, batteryLow: b <= 15, bars: signalAt(districtId), carrier: 'NAMMA NET' };
}

export interface ChatRow {
  threadId: string;
  contact: string;
  preview: string;
  unread: number;
}

/** Chats list rows: newest first (PhoneManager's order), last line as a preview cut to fit. */
export function chatRows(threads: Array<{ thread: ChatThread; messages: ChatMessage[]; unread: number }>, width: number): ChatRow[] {
  return threads.map(({ thread, messages, unread }) => {
    const last = messages[messages.length - 1];
    const text = last ? `${last.from === 'me' ? 'You: ' : ''}${last.text}` : '';
    return { threadId: thread.id, contact: thread.contact, preview: truncate(text, width), unread };
  });
}

export interface Bubble {
  from: 'them' | 'me';
  lines: string[];
  w: number;
  h: number;
}

export const BUBBLE = { maxW: 132, padX: 6, padY: 5, lineH: 11, gap: 4 } as const;

/** Message bubbles, wrapped to the bubble width; them on the left, me on the right. */
export function bubbles(messages: ChatMessage[]): Bubble[] {
  return messages.map((m) => {
    const lines = wrap(m.text, BUBBLE.maxW - BUBBLE.padX * 2);
    const w = Math.max(...lines.map((l) => measure(l))) + BUBBLE.padX * 2;
    return { from: m.from, lines, w, h: lines.length * BUBBLE.lineH + BUBBLE.padY * 2 - 1 };
  });
}

/**
 * The window of bubbles that fits `height`, ending `fromEnd` bubbles before
 * the newest (scroll steps one whole bubble — stepped, no sub-pixel scroll).
 */
export function bubbleWindow(list: Bubble[], height: number, fromEnd: number): { start: number; end: number } {
  const end = Math.max(0, list.length - fromEnd);
  let used = 0, start = end;
  while (start > 0 && used + list[start - 1].h + (start < end ? BUBBLE.gap : 0) <= height) {
    used += list[start - 1].h + (start < end ? BUBBLE.gap : 0);
    start--;
  }
  return { start, end };
}

export interface UpiRow {
  amount: string;
  label: string;
  tone: 'in' | 'out';
}

/** Gap between a ledger line's amount and its label, px. */
const UPI_GAP = 8;

/**
 * UPI ledger lines, newest first: signed amount (bold; green in, red out) +
 * who, the label cut to whatever the amount leaves of `rowWidth`.
 */
export function upiRows(transactions: Transaction[], rowWidth: number): UpiRow[] {
  return transactions.map((t) => {
    const amount = rupees(t.amount, true);
    return { amount, label: truncate(t.label, rowWidth - measure(amount, true) - UPI_GAP), tone: t.amount >= 0 ? 'in' : 'out' };
  });
}

export interface MapRow {
  districtId: string;
  label: string;
  state: 'here' | 'open' | 'locked' | 'destination';
  detail?: string;
}

/** Maps app (until the fullscreen map, P6b): the objective's destination pinned first, then places. */
export function mapRows(maps: {
  pins: Array<{ districtId: string; label: string; state: 'here' | 'open' | 'locked' }>;
  destination: { districtId: string; label: string; objective: string } | null;
}): MapRow[] {
  const rows: MapRow[] = [];
  const dest = maps.destination;
  if (dest) {
    // Already there: one row, not a destination and a "here" for the same place.
    const here = maps.pins.some((p) => p.districtId === dest.districtId && p.state === 'here');
    rows.push({ districtId: dest.districtId, label: dest.label, state: 'destination', detail: here ? `Here: ${dest.objective}` : dest.objective });
  }
  const order = { here: 0, open: 1, locked: 2 } as const;
  for (const p of [...maps.pins].sort((a, b) => order[a.state] - order[b.state])) {
    if (p.districtId === dest?.districtId) continue;
    rows.push({ districtId: p.districtId, label: p.label, state: p.state });
  }
  return rows;
}

// ── Reels (ADR-122) ───────────────────────────────────────────────────────

/** Clips the player can see: no `after`, or its flag set. Newest (last in data) first. */
export const visibleReels = (clips: ReelClip[], flags: Record<string, boolean>): ReelClip[] =>
  clips.filter((c) => !c.after || flags[c.after]).slice().reverse();

export type ReelState = 'nosignal' | 'buffering' | 'failed' | 'playing';

/** Bars until a clip plays: 2 bars buffer this long first. */
export const REEL_BUFFER_MS = 1500;
/** One bar: the clip buffers this long, then gives up — that is the test failing, visibly. */
export const REEL_GIVEUP_MS = 4000;

/**
 * The signal test (story 1.4): no bars = no network; one bar buffers and
 * gives up; two bars buffer, then play; three or more play at once.
 */
export function reelState(bars: number, elapsedMs: number): ReelState {
  if (bars <= 0) return 'nosignal';
  if (bars === 1) return elapsedMs >= REEL_GIVEUP_MS ? 'failed' : 'buffering';
  if (bars === 2) return elapsedMs >= REEL_BUFFER_MS ? 'playing' : 'buffering';
  return 'playing';
}

/** "Buffering", "Buffering.", "Buffering..", "Buffering..." — one step per 400 ms. */
export const bufferingText = (elapsedMs: number): string => `Buffering${'.'.repeat(Math.floor(elapsedMs / 400) % 4)}`;

// ── Camera / City Moments (ADR-123) ───────────────────────────────────────

export interface CameraView {
  /** What the viewfinder frames where the player stands, or null. */
  framed: (PhotoDef & { taken: boolean }) | null;
  /** The viewfinder's line: "IN FRAME: THE BANDSTAND" / "Nothing worth a photo here." */
  line: string;
  /** SNAP is offered (something framed and not yet taken). */
  canSnap: boolean;
  /** Gallery, newest-defined last; taken ones only. */
  gallery: Array<PhotoDef & { taken: boolean }>;
  /** "CUBBON · 2/5" per set that has at least one photo defined. */
  sets: Array<{ set: string; done: number; total: number }>;
}

export function cameraView(photoSpot: string | null, photos: Array<PhotoDef & { taken: boolean }>): CameraView {
  const framed = photoSpot ? photos.find((p) => p.id === photoSpot) ?? null : null;
  const sets = [...new Set(photos.map((p) => p.set).filter((s): s is string => s !== null))].map((set) => {
    const all = photos.filter((p) => p.set === set);
    return { set, done: all.filter((p) => p.taken).length, total: all.length };
  });
  return {
    framed,
    line: framed ? (framed.taken ? `${framed.title} · taken` : `IN FRAME: ${framed.title.toUpperCase()}`) : 'Nothing worth a photo here.',
    canSnap: Boolean(framed && !framed.taken),
    gallery: photos.filter((p) => p.taken),
    sets,
  };
}

/** "₹6,500 · ₹1,200 to go" / "₹6,500 · you can afford it" under a priced note. */
export function noteDetail(price: number | undefined, toGo: number | null): string | null {
  if (price === undefined || toGo === null) return null;
  return toGo > 0 ? `${rupees(price)} · ${rupees(toGo)} to go` : `${rupees(price)} · you can afford it`;
}
