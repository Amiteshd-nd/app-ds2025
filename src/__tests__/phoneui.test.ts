import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { StatsManager } from '../systems/StatsManager';
import { useSettings } from '../systems/SettingsManager';
import { useGameStore } from '../store';
import { MIN_TAP } from '../ui/kit/molecules';
import { measure } from '../ui/kit/text';
import { APP, HOME, LIST, PHONE, SAFE_BOTTOM, SCREEN_H, dockCell, gridCell, listRows, slideSteps } from '../ui/phone/layout';
import { bubbleWindow, bubbles, chatRows, homeTiles, mapRows, signalAt, statusBar, upiRows } from '../ui/phone/viewModel';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/constants';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  PhoneManager.resetInstance();
  QuestManager.resetInstance();
  ReputationManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
  useSettings.getState().reset();
});

describe('phone layout promises (ADR-114)', () => {
  it('sits centred, full height, inside the 640×360 canvas', () => {
    expect(PHONE.x * 2 + PHONE.w).toBe(GAME_WIDTH);
    expect(PHONE.y + PHONE.screen.y + SCREEN_H).toBe(GAME_HEIGHT);
  });

  it('every home cell and list row is a full touch target (≥ 44 game px ≈ 48pt)', () => {
    for (let i = 0; i < HOME.cols * HOME.rows; i++) {
      expect(gridCell(i).w).toBeGreaterThanOrEqual(MIN_TAP);
      expect(gridCell(i).h).toBeGreaterThanOrEqual(MIN_TAP);
    }
    for (let i = 0; i < 4; i++) expect(dockCell(i).h).toBeGreaterThanOrEqual(MIN_TAP);
    expect(LIST.pitch).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it('keeps everything tappable above the home-indicator strip', () => {
    expect(dockCell(0).y + dockCell(0).h).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(APP.nav.y + APP.nav.h).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(APP.contentTop + listRows() * LIST.pitch).toBeLessThanOrEqual(APP.nav.y);
  });

  it('slides up in 4 stepped moves, or one with reduced motion', () => {
    const steps = slideSteps(4, false);
    expect(steps).toHaveLength(4);
    expect(steps[3]).toBe(PHONE.y);
    expect(steps[0]).toBeLessThan(GAME_HEIGHT);
    for (const y of steps) expect(Number.isInteger(y)).toBe(true);
    expect(slideSteps(4, true)).toEqual([PHONE.y]);
  });
});

describe('phone view-models', () => {
  const phone = () => PhoneManager.getInstance();

  it('home: dock of 4, grid of the rest; locked apps carry no label; Chats wears the unread badge', () => {
    phone().deliver({ quiet: true });
    const { dock, grid } = homeTiles(phone().apps(), phone().unreadCount());
    expect(dock.map((t) => t.id)).toEqual(['maps', 'chats', 'upi', 'camera']);
    expect(grid.length).toBeLessThanOrEqual(12);
    const maps = dock[0];
    expect(maps).toMatchObject({ state: 'locked', label: null });
    expect(maps.hint).toBeTruthy();
    expect(dock[1]).toMatchObject({ label: 'CHATS', state: 'default', badge: 1 }); // Amma's "Landed? Call."
    useGameStore.getState().setFlag('divya_called', true);
    expect(homeTiles(phone().apps(), 0).dock[0]).toMatchObject({ state: 'default', label: 'MAPS' });
  });

  it('app labels fit their 46px cell', () => {
    const { dock, grid } = homeTiles(phone().apps().map((a) => ({ ...a, unlocked: true })), 0);
    for (const t of [...dock, ...grid]) expect(measure(t.label!), t.id).toBeLessThanOrEqual(HOME.cellW + 4);
  });

  it('status bar: game clock, battery, the district\'s signal, the parody carrier', () => {
    const s = statusBar({ day: 3, minute: 521 }, 12, 'airport');
    expect(s).toMatchObject({ time: '08:41', battery: 12, batteryLow: true, carrier: 'NAMMA NET' });
    expect(signalAt(null)).toBe(4);
    expect(signalAt('airport')).toBe(4);
  });

  it('chats list: newest first, previews cut to fit, "You:" for my last line', () => {
    phone().deliver({ quiet: true });
    useGameStore.getState().setFlag('divya_called', true);
    const rows = chatRows(phone().threadsView(), 100);
    expect(rows[0].threadId).toBe('divya');
    for (const r of rows) expect(measure(r.preview)).toBeLessThanOrEqual(100);
  });

  it('thread bubbles wrap inside the bubble and scroll one whole bubble at a time', () => {
    const list = bubbles([
      { id: 'a', from: 'them', text: 'Shanthamma here. Gate closes 10 PM sharp. No outside non-veg in the room.' },
      { id: 'b', from: 'me', text: 'Okay aunty.' },
      { id: 'c', from: 'them', text: 'Good.' },
    ]);
    for (const b of list) expect(b.w).toBeLessThanOrEqual(132);
    expect(bubbleWindow(list, 1000, 0)).toEqual({ start: 0, end: 3 });
    expect(bubbleWindow(list, 1000, 1)).toEqual({ start: 0, end: 2 });
    expect(bubbleWindow(list, list[2].h, 0)).toEqual({ start: 2, end: 3 });
  });

  it('UPI rows: signed Indian rupees, green in / red out, label fits beside the amount', () => {
    StatsManager.getInstance().spend(20, 'food', 'Chai Anna');
    StatsManager.getInstance().earn(500, 'gift', 'Amma');
    const rows = upiRows(phone().upi().transactions, 144);
    expect(rows[0]).toMatchObject({ amount: '+₹500', tone: 'in', label: 'Amma' });
    expect(rows[1]).toMatchObject({ amount: '-₹20', tone: 'out', label: 'Chai Anna' });
    for (const r of rows) expect(measure(r.amount, true) + 8 + measure(r.label)).toBeLessThanOrEqual(144);
  });

  it('maps rows: the destination first; when already there, one row instead of two', () => {
    const rows = mapRows({
      pins: [
        { districtId: 'a', label: 'A', state: 'here' },
        { districtId: 'b', label: 'B', state: 'locked' },
        { districtId: 'c', label: 'C', state: 'open' },
      ],
      destination: { districtId: 'a', label: 'A', objective: 'Buy food' },
    });
    expect(rows.map((r) => `${r.districtId}:${r.state}`)).toEqual(['a:destination', 'c:open', 'b:locked']);
    expect(rows[0].detail).toBe('Here: Buy food');
  });
});
