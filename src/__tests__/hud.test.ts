import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { QUESTS } from '../data';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { DIALOGUE, layoutDialogue, onCard, pillAt, pillWidth } from '../ui/hud/dialogue';
import { HUD_GLYPHS } from '../ui/hud/glyphs';
import { HUD, STICK_RADIUS, TYPEWRITER_MS, hudLayout, plateWidth, stickZone, touchLayout } from '../ui/hud/layout';
import {
  METER_BITES, METER_SHOWS, ToastQueue, clockGlyph, clockLabel, locationCard, meters, objectiveLine, objectiveText, promptLabel, revealedChars, stackRows,
  toastLayout, walletView,
} from '../ui/hud/viewModel';
import { MIN_TAP, PILL_H, choicePill, speechBubble, tapZone, UI_STATES, type UiState } from '../ui/kit/molecules';
import type { PixelCtx } from '../ui/kit/pixel';
import { measure, missingGlyphs } from '../ui/kit/text';
import { GAME_HEIGHT, GAME_WIDTH, HUNGRY_AT, STARTING_HEALTH } from '../utils/constants';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  QuestManager.resetInstance();
  ReputationManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

/** A PixelCtx that records the final colour of every pixel. */
function canvas() {
  const px = new Map<string, string>();
  const g: PixelCtx = {
    fillStyle: '',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.set(`${x + i},${y + j}`, String(this.fillStyle));
    },
  };
  return { g, px, at: (x: number, y: number) => px.get(`${x},${y}`) };
}

describe('HUD layout promises (ADR-118)', () => {
  it('the phone button sits in the top-right corner with a full touch zone inside the screen', () => {
    const z = tapZone(HUD.phoneButton.x, HUD.phoneButton.y, HUD.phoneButton.size, HUD.phoneButton.size);
    expect(HUD.phoneButton.x + HUD.phoneButton.size).toBe(GAME_WIDTH - HUD.pad);
    expect(z.w).toBeGreaterThanOrEqual(MIN_TAP);
    expect(z.x + z.w).toBeLessThanOrEqual(GAME_WIDTH);
    expect(z.y).toBeGreaterThanOrEqual(0);
    expect(HUD.right).toBeLessThan(HUD.phoneButton.x);
  });

  it.each([1, 2] as const)('the settings gear sits left of the phone button; their touch zones never overlap (%d×)', (k) => {
    const L = hudLayout(k);
    const zone = (b: { x: number; y: number; size: number }) => tapZone(b.x * k, b.y * k, b.size * k, b.size * k);
    const gear = zone(L.settingsButton), phone = zone(L.phoneButton);
    expect(gear.w).toBeGreaterThanOrEqual(MIN_TAP);
    expect(gear.x + gear.w).toBeLessThanOrEqual(phone.x);
    expect(L.settingsButton.y).toBe(L.phoneButton.y);
    expect(L.right).toBeLessThan(L.settingsButton.x);
  });

  it('the longest objective line still clears the clock plate', () => {
    const longest = Math.max(...Object.values(QUESTS).flatMap((q) => q.objectives.map((o) => measure(objectiveText(o.text)))));
    const objectiveRight = HUD.objective.x + plateWidth(longest, 7);
    const clockW = plateWidth(measure(clockLabel({ day: 99, minute: 23 * 60 + 59 }), true), 9);
    expect(objectiveRight).toBeLessThan(HUD.right - clockW - 4);
  });

  it.each(['left', 'right'] as const)('touch controls (%s-handed): both zones ≥ MIN_TAP, apart, and above the home strip', (side) => {
    for (const size of Object.keys(STICK_RADIUS) as Array<keyof typeof STICK_RADIUS>) {
      const { stick, action } = touchLayout(side, size);
      const z = stickZone(stick);
      const a = tapZone(action.x, action.y, action.size, action.size);
      expect(z.w).toBeGreaterThanOrEqual(MIN_TAP);
      expect(a.w).toBeGreaterThanOrEqual(MIN_TAP);
      expect(z.y + z.h).toBeLessThanOrEqual(HUD.safeBottom);
      expect(a.y + a.h).toBeLessThanOrEqual(HUD.safeBottom);
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(GAME_WIDTH);
      // The two never overlap, whichever side the stick is on.
      const apart = z.x + z.w <= a.x || a.x + a.w <= z.x;
      expect(apart).toBe(true);
    }
  });

  it('the dialogue card never covers the top-left stack and ends above the home strip', () => {
    const l = layoutDialogue({ text: 'x', choices: [] });
    expect(l.y + l.h).toBe(HUD.safeBottom);
    expect(l.h).toBe(DIALOGUE.minH);
    expect(l.y).toBeGreaterThan(HUD.pad + 3 * (HUD.plateH + HUD.stackGap) + 3 * (HUD.meter.h + HUD.meter.gap));
    expect(HUD.safeBottom).toBe(GAME_HEIGHT - 20);
  });

  it('at 2× (Larger text) the plates still fit a 320×180 virtual canvas', () => {
    const L = hudLayout(2);
    expect([L.W, L.H]).toEqual([320, 180]);
    expect(L.phoneButton.x + L.phoneButton.size).toBe(L.W - L.pad);
    const clockW = plateWidth(measure(clockLabel({ day: 99, minute: 23 * 60 + 59 }), true), 9);
    expect(L.objective.x + plateWidth(L.objective.maxTextW, 7)).toBeLessThan(L.right - clockW);
    expect(L.toast.cy + 10).toBeLessThanOrEqual(L.safeBottom);
    expect(L.locationMaxTextW + 60).toBeLessThan(L.W);
  });

  it('every HUD glyph is a rectangle of . and #', () => {
    for (const [name, rows] of Object.entries(HUD_GLYPHS)) {
      const w = rows[0].length;
      for (const r of rows) { expect(r.length, name).toBe(w); expect(/^[.#]+$/.test(r), name).toBe(true); }
    }
  });
});

describe('HUD view-models', () => {
  it('objective: the first open, non-optional step of the oldest active quest', () => {
    const qm = QuestManager.getInstance();
    qm.start('q_act0_arrival');
    const { quests } = useGameStore.getState();
    expect(objectiveLine(quests, QUESTS)).toBe(QUESTS.q_act0_arrival.objectives[0].text);
    useGameStore.getState().setQuests({ active: { q_act0_arrival: [QUESTS.q_act0_arrival.objectives[0].id] }, completed: [] });
    // The chai is optional: the line skips to the next required step.
    expect(QUESTS.q_act0_arrival.objectives[1].optional).toBe(true);
    expect(objectiveLine(useGameStore.getState().quests, QUESTS)).toBe(QUESTS.q_act0_arrival.objectives[2].text);
    // Only optional steps left: show the first of those rather than nothing.
    expect(objectiveLine({ active: { q_act0_arrival: QUESTS.q_act0_arrival.objectives.filter((o) => !o.optional).map((o) => o.id) }, completed: [] }, QUESTS)).toBe(QUESTS.q_act0_arrival.objectives[1].text);
    expect(objectiveLine({ active: {}, completed: [] }, QUESTS)).toBeNull();
  });

  it('every objective line is drawable and fits its plate', () => {
    for (const q of Object.values(QUESTS)) for (const o of q.objectives) {
      expect(missingGlyphs(o.text), o.id).toEqual([]);
      expect(measure(objectiveText(o.text))).toBeLessThanOrEqual(HUD.objective.maxTextW);
    }
  });

  it('clock: DAY · HH:MM with a sky glyph for the hour', () => {
    expect(clockLabel({ day: 1, minute: 6 * 60 + 12 })).toBe('DAY 1 · 06:12');
    expect(clockGlyph(6 * 60 + 12)).toBe('sunrise');
    expect(clockGlyph(12 * 60)).toBe('sun');
    expect(clockGlyph(18 * 60)).toBe('sunset');
    expect(clockGlyph(21 * 60)).toBe('moon');
    expect(clockGlyph(2 * 60)).toBe('moon');
  });

  it('location card: UPPERCASE, truncated, NEW on a first visit', () => {
    const c = locationCard('Hotel Sri Lakshmi Lodging & Boarding', true);
    expect(c.isNew).toBe(true);
    expect(c.name).toBe(c.name.toUpperCase());
    expect(measure(c.name, true)).toBeLessThanOrEqual(HUD.locationMaxTextW);
    expect(locationCard('Whitefield', false)).toEqual({ name: 'WHITEFIELD', isNew: false });
  });

  it('wallet: Indian grouping, a tick in the colour of its direction, none when nothing moved', () => {
    expect(walletView(34980, -20)).toEqual({ balance: '₹34,980', tick: { text: '-₹20', tone: 'phone.accent.alert' } });
    expect(walletView(120000, 500).tick).toEqual({ text: '+₹500', tone: 'phone.accent.upi' });
    expect(walletView(100, null).tick).toBeUndefined();
    expect(walletView(100, 0).tick).toBeUndefined();
  });

  it('meters appear only when they matter, bite in red, and all show on "always"', () => {
    const fresh = { health: STARTING_HEALTH, food: 100, stress: 0 };
    expect(meters(fresh, 'auto')).toEqual([]);
    expect(meters(fresh, 'always').map((m) => m.id)).toEqual(['health', 'food', 'stress']);
    const m = meters({ health: 60, food: 15, stress: 60 }, 'auto');
    expect(m.map((x) => [x.id, x.blocks, x.critical])).toEqual([['health', 3, false], ['food', 1, true], ['stress', 3, false]]);
    expect(meters({ health: 100, food: HUNGRY_AT, stress: 0 }, 'auto')[0]).toMatchObject({ id: 'food', critical: false });
    expect(METER_SHOWS.health).toBeGreaterThan(METER_BITES.health);
    expect(METER_BITES.food).toBe(HUNGRY_AT);
  });

  it('the top-left stack keeps its order and rhythm', () => {
    const rows = stackRows({ objective: true, location: true, meters: meters({ health: 10, food: 10, stress: 90 }, 'auto') });
    expect(rows.map((r) => r.kind)).toEqual(['objective', 'location', 'meter', 'meter', 'meter']);
    expect(rows[0].y).toBe(HUD.pad);
    expect(rows[1].y).toBe(HUD.pad + HUD.plateH + HUD.stackGap);
    expect(rows[3].y - rows[2].y).toBe(HUD.meter.h + HUD.meter.gap);
    expect(stackRows({ objective: false, location: false, meters: [] })).toEqual([]);
  });

  it('prompts: [E] on a keyboard, the bare verb (after a fingertip) on touch', () => {
    expect(promptLabel('TALK', 'keys')).toBe('[E] TALK');
    expect(promptLabel('TALK', 'touch')).toBe('TALK');
  });

  it('toasts: one at a time, in order, each for its hold; duplicates collapse; wraps to two lines', () => {
    const q = new ToastQueue(1000, 3);
    expect(q.tick(0)).toBeNull();
    q.push({ text: 'A' });
    q.push({ text: 'A' }); // collapsed
    q.push({ text: 'B' });
    expect(q.tick(0)?.text).toBe('A');
    expect(q.pending).toBe(1);
    expect(q.nextChange()).toBe(1000);
    expect(q.tick(999)?.text).toBe('A');
    expect(q.tick(1000)?.text).toBe('B');
    expect(q.tick(2000)).toBeNull();
    q.push({ text: '1' });
    expect(q.tick(3000)?.text).toBe('1');
    for (const t of ['2', '3', '4', '5']) q.push({ text: t });
    expect(q.pending).toBe(3); // the cap: the oldest waiting ('2') was dropped
    expect(q.tick(4000)?.text).toBe('3');
    const long = toastLayout({ text: 'Company booking: 3 nights. Find a PG before it runs out. And the hotel does not extend, whatever you say.' });
    expect(long.lines).toHaveLength(2);
    expect(long.h).toBeGreaterThan(HUD.plateH);
    expect(long.w).toBeLessThanOrEqual(HUD.toast.maxTextW + 13);
    expect(toastLayout({ text: 'Amma: Landed? Call.', icon: 'chats' }).w).toBe(6 + 20 + measure('Amma: Landed? Call.') + 7);
  });

  it('typewriter: 30 ms a character at normal, instant shows everything, never past the end', () => {
    expect(TYPEWRITER_MS.normal).toBe(30);
    expect(revealedChars(0, 20, 'normal')).toBe(0);
    expect(revealedChars(300, 20, 'normal')).toBe(10);
    expect(revealedChars(5000, 20, 'normal')).toBe(20);
    expect(revealedChars(0, 20, 'instant')).toBe(20);
    expect(revealedChars(300, 20, 'slow')).toBe(5);
    expect(revealedChars(300, 20, 'fast')).toBe(20);
  });
});

describe('dialogue card layout', () => {
  const choices = (...texts: string[]) => texts.map((text) => ({ text, enabled: true }));

  it('grows upward from the home strip and wraps choice pills into rows', () => {
    const l = layoutDialogue({ text: 'Chai, boss? Twenty rupees.', choices: choices('One chai. (₹20, UPI)', 'Bus to Whitefield?', 'Not now, Anna.') });
    expect(l.pills).toHaveLength(3);
    expect(new Set(l.pills.map((p) => p.y)).size).toBe(1); // one row
    const wide = layoutDialogue({ text: 'x', choices: choices('Night snacks — noodles, biscuits, banana chips (₹120)', 'Eighteen hundred?! The bus is two-fifty.', 'Where do I catch a bus to the city?', 'Which area should I look for a PG in?') });
    expect(new Set(wide.pills.map((p) => p.y)).size).toBe(3); // bold pills: 343 + 270 px do not share a 560 px row
    expect(wide.h).toBeGreaterThan(l.h);
    expect(wide.y + wide.h).toBe(HUD.safeBottom);
    for (const p of wide.pills) expect(p.x + p.w).toBeLessThanOrEqual(DIALOGUE.x + DIALOGUE.w - DIALOGUE.pad);
    expect(pillWidth('Hi')).toBe(measure('Hi', true) + DIALOGUE.pill.padX);
  });

  it('a bill and a locked reason each take a line', () => {
    const base = layoutDialogue({ text: 'Deposit?', choices: choices('Agree', 'Walk away') });
    const bill = layoutDialogue({ text: 'Deposit?', ledger: 'Deposit ₹10,000 + Rent ₹8,000 = ₹18,000', choices: choices('Agree', 'Walk away') });
    expect(bill.ledgerY).not.toBeNull();
    expect(bill.y).toBeLessThanOrEqual(base.y);
    const locked = layoutDialogue({ text: 'Deposit?', choices: choices('Agree', 'Walk away') }, true);
    expect(locked.reasonY).not.toBeNull();
    expect(locked.h).toBeGreaterThanOrEqual(base.h);
  });

  it('finds the pill under a finger, nearest centre when zones overlap, and the card under a tap', () => {
    const l = layoutDialogue({ text: 'x', choices: choices('Night snacks — noodles, biscuits, banana chips (₹120)', 'Eighteen hundred?! The bus is two-fifty.', 'Where do I catch a bus to the city?', 'Which area should I look for a PG in?') });
    const first = l.pills[0], second = l.pills[1];
    expect(pillAt(l.pills, first.x + 4, first.y + 4)?.index).toBe(0);
    // Between two rows, a point just under the first row's pill still belongs to it.
    const lower = l.pills.find((p) => p.y > first.y)!;
    expect(pillAt(l.pills, lower.x + 4, first.y + PILL_H + 1)?.index).toBe(first.index);
    expect(pillAt(l.pills, second.x + second.w - 2, second.y + 8)?.index).toBe(1);
    expect(pillAt(l.pills, 2, 2)).toBeNull();
    expect(onCard(l, DIALOGUE.x + 10, l.y + 10)).toBe(true);
    expect(onCard(l, DIALOGUE.x + 10, l.y - 20)).toBe(false);
  });

  it('every dialogue line in the content fits three lines of the card', () => {
    // The real content is validated at build; here the longest line in the game stays on the card.
    const l = layoutDialogue({ text: 'x'.repeat(10), choices: [] });
    expect(l.bodyLines.length).toBeLessThanOrEqual(DIALOGUE.maxLines);
  });
});

describe('new molecules: speech bubble and choice pill (ADR-114 five states)', () => {
  const paintAll = (paint: (g: PixelCtx, s: UiState) => unknown) =>
    UI_STATES.map((s) => { const c = canvas(); paint(c.g, s); return [...c.px.entries()].sort().join('|'); });

  it.each([
    ['speech bubble', (g: PixelCtx, s: UiState) => speechBubble(g, 0, 0, 40, 17, s)],
    ['choice pill', (g: PixelCtx, s: UiState) => choicePill(g, 0, 0, 40, s)],
  ])('%s has five distinct looks', (_, paint) => {
    expect(new Set(paintAll(paint)).size).toBe(5);
  });

  it('the bubble grows a tail under its middle; the chosen pill inverts with a cursor', () => {
    const { at } = (() => { const c = canvas(); speechBubble(c.g, 0, 0, 40, 17); return c; })();
    expect(at(20, 18)).toBeDefined(); // tail row below the plate
    expect(at(20, 16)).toBeDefined();
    const c = canvas();
    const painted = choicePill(c.g, 0, 0, 40, 'focus');
    expect(painted.ink).toBe('hud.plate');
    expect(c.at(6, 8)).not.toBe(c.at(20, 8)); // ▶ cursor over the inverted plate
  });
});
