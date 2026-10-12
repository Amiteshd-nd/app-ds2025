import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { platform } from '../platform';
import { useGameStore } from '../store';
import { PhoneManager } from '../systems/PhoneManager';
import { settings } from '../systems/SettingsManager';
import { color, hex, motion, type TokenName } from '../ui/tokens';
import { ICONS, type IconName } from '../ui/kit/icons';
import { appTile, badge, dockBar, hudPlate, phonePill, APP_TILE, type Painted, type UiState } from '../ui/kit/molecules';
import { bitmap, bitmapHeight, bitmapWidth, rect, ring, roundRect, type PixelCtx } from '../ui/kit/pixel';
import { bake, pxText } from '../ui/kit/phaser';
import { nextFocus, type Box, type Direction } from '../ui/kit/focus';
import { measure, rupees, truncate } from '../ui/kit/text';
import { APP, HOME, LIST, PHONE, POP_OFFSETS, SAFE_BOTTOM, dockCell, gridCell, listRows, slideSteps } from '../ui/phone/layout';
import { paintDockBand, paintFrame, paintStatusIcons, paintWallpaper, STATUS_ICONS, WALLPAPER } from '../ui/phone/paint';
import { BUBBLE, bubbleWindow, bubbles, chatRows, homeTiles, mapRows, statusBar, upiRows, type HomeTile } from '../ui/phone/viewModel';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import type { MapScene } from './MapScene';
import type { WorldScene } from './WorldScene';

type Route =
  | { app: 'home' }
  | { app: 'chats' }
  | { app: 'thread'; threadId: string }
  | { app: 'upi' }
  | { app: 'maps' }
  | { app: 'stub'; appId: string };

interface Focusable extends Box {
  id: string;
  activate: () => void;
}

/** The closed phone's button (until P6c moves it into the new HUD's top-right corner). */
const BUTTON = { x: 604, y: 150, size: 28 } as const;
/** In-app navigation: the phone's own four destinations. */
const NAV: Array<{ id: 'home' | 'chats' | 'maps' | 'upi'; icon: IconName }> = [
  { id: 'home', icon: 'home' }, { id: 'chats', icon: 'chats' }, { id: 'maps', icon: 'maps' }, { id: 'upi', icon: 'upi' },
];
const UPI_ROWS = { top: 108, h: 22, pitch: 26 } as const;
const HINT_MS = 2500;
const DRAG_STEP = 18;

/** A PixelCtx that draws nothing — to read a molecule's Painted result for a cached texture. */
const NOOP: PixelCtx = { fillStyle: '', globalAlpha: 1, fillRect: () => {} };

/**
 * PhoneScene — the phone (P6a, ADR-114). Runs above WorldScene.
 *
 * Closed: a small phone button at the screen edge that wiggles on a buzz
 * (Do Not Disturb is respected upstream: PhoneManager only emits phone:buzz
 * when a buzz is allowed). Open: the world pauses and dims to half
 * saturation, the phone slides up in 4 stepped moves, and the home screen /
 * apps render from PhoneManager through pure view-models.
 *
 * Input: P toggles; arrows/WASD move focus; Enter/Space/E confirm; Esc or
 * Backspace (Android back) go back; touch taps, drags scroll, a tap on the
 * dimmed world closes. Every screen is redrawn from state on change.
 */
export class PhoneScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.PHONE;

  private phase: 'closed' | 'moving' | 'open' = 'closed';
  private route: Route = { app: 'home' };
  private focusId: string | null = null;
  private focusVisible = false;
  private pressedId: string | null = null;
  private scroll = 0;
  private hint: string | null = null;
  private hintTimer: Phaser.Time.TimerEvent | null = null;
  private pops: Record<string, number> = {};
  private focusables: Focusable[] = [];
  private drag: { y: number; moved: boolean } | null = null;

  private dim!: Phaser.GameObjects.Rectangle;
  private root!: Phaser.GameObjects.Container;
  private screenLayer!: Phaser.GameObjects.Container;
  private button!: Phaser.GameObjects.Container;
  private buttonPlate!: Phaser.GameObjects.Image;
  private buttonBadge!: Phaser.GameObjects.Image;
  private worldFx: Phaser.FX.ColorMatrix | null = null;
  private off: Array<() => void> = [];

  constructor() {
    super(PhoneScene.KEY);
  }

  create(): void {
    this.phase = 'closed';
    this.pops = {};
    this.off = [];
    this.cameras.main.setRoundPixels(true);

    bake(this, 'ph:frame', PHONE.w, PHONE.h, paintFrame);
    bake(this, 'ph:dockband', PHONE.screen.w, SAFE_BOTTOM + PHONE.gestureBar - HOME.dockY, paintDockBand);

    this.dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, color('phone.bezel'), 0.35).setOrigin(0).setVisible(false);
    this.root = this.add.container(PHONE.x, GAME_HEIGHT).setVisible(false);
    this.root.add(this.add.image(0, 0, 'ph:frame').setOrigin(0));
    this.screenLayer = this.add.container(PHONE.screen.x, PHONE.screen.y);
    this.root.add(this.screenLayer);
    this.buildButton();

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.off.push(
      gameEvents.on('phone:buzz', () => this.buzz()),
      gameEvents.on('phone:message', () => { this.refreshButton(); if (this.phase === 'open') this.render(); }),
      gameEvents.on('phone:app-unlocked', ({ appId }) => this.popApp(appId)),
      gameEvents.on('time:advanced', () => { if (this.phase === 'open') this.render(); }),
      platform.lifecycle.onBackButton(() => { if (this.phase === 'open') this.back(); }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.off.forEach((f) => f());
      this.off = [];
      if (this.phase !== 'closed') this.finishClose();
      this.input.keyboard?.off('keydown', this.onKey, this);
    });
  }

  // ── Open / close ─────────────────────────────────────────────────────────

  private world(): WorldScene | null {
    return this.scene.isActive(SCENE_KEYS.WORLD) || this.scene.isPaused(SCENE_KEYS.WORLD)
      ? (this.scene.get(SCENE_KEYS.WORLD) as WorldScene)
      : null;
  }

  open(): void {
    const world = this.world();
    if (this.phase !== 'closed' || !world?.canOpenOverlay()) return;
    this.phase = 'moving';
    this.route = { app: 'home' };
    this.focusId = null;
    this.scroll = 0;
    this.scene.pause(SCENE_KEYS.WORLD);
    useGameStore.getState().setOverlay('phone');
    // c.state.desat50: the world behind is half-desaturated and dimmed.
    const fx = world.cameras.main.postFX?.addColorMatrix();
    if (fx) { fx.saturate(-0.5); fx.brightness(0.7, true); this.worldFx = fx; }
    this.dim.setVisible(true);
    this.button.setVisible(false);
    if (settings().controls.haptics) platform.haptics.impact('light');
    this.render();
    this.root.setVisible(true);
    this.slide(slideSteps(motion('m.phone.open.steps'), platform.display.prefersReducedMotion()), () => { this.phase = 'open'; });
  }

  close(): void {
    if (this.phase !== 'open') return;
    this.phase = 'moving';
    const steps = slideSteps(motion('m.phone.open.steps'), platform.display.prefersReducedMotion());
    // Same stepped rhythm, downwards.
    const down = steps.length > 1 ? steps.slice(0, -1).reverse().concat(GAME_HEIGHT) : [GAME_HEIGHT];
    this.slide(down, () => this.finishClose());
  }

  private finishClose(): void {
    this.phase = 'closed';
    this.root.setVisible(false).setY(GAME_HEIGHT);
    this.dim.setVisible(false);
    const world = this.world();
    // The world camera carries no other post FX, so clearing removes exactly the phone's.
    if (this.worldFx && world) world.cameras.main.postFX?.clear();
    this.worldFx = null;
    useGameStore.getState().setOverlay(null);
    this.hint = null;
    this.button.setVisible(true);
    this.refreshButton();
    if (world && this.scene.isPaused(SCENE_KEYS.WORLD)) world.overlayClosed();
  }

  /** Move the phone through `ys`, one stepped move per tick (motion tokens: 4 moves / 250 ms). */
  private slide(ys: number[], done: () => void): void {
    const stepMs = motion('m.phone.open') / Math.max(1, ys.length);
    if (ys.length === 1) { this.root.setY(ys[0]); done(); return; }
    ys.forEach((y, i) => this.time.delayedCall(stepMs * (i + 1), () => {
      this.root.setY(y);
      if (i === ys.length - 1) done();
    }));
  }

  // ── Closed button ────────────────────────────────────────────────────────

  private buildButton(): void {
    const s = BUTTON.size;
    bake(this, 'ph:button', s, s + 1, (g) => {
      hudPlate(g, 0, 0, s, s, 'default', 4);
      bitmap(g, ICONS.phone, 6, 6, hex('hud.text'));
      [2, 4, 6, 8].forEach((h, i) => rect(g, 18 + i * 2, 22 - h, 1, h, hex('hud.text')));
    });
    bake(this, 'ph:button:badge', 6, 6, (g) => roundRect(g, 0, 0, 6, 6, 2, hex('phone.accent.chat')));
    this.buttonPlate = this.add.image(0, 0, 'ph:button').setOrigin(0);
    this.buttonBadge = this.add.image(s - 8, 3, 'ph:button:badge').setOrigin(0);
    this.button = this.add.container(BUTTON.x, BUTTON.y, [this.buttonPlate, this.buttonBadge]);
    this.refreshButton();
  }

  private refreshButton(): void {
    this.buttonBadge?.setVisible(PhoneManager.getInstance().unreadCount() > 0);
  }

  /** A buzz: haptic tap; while closed the button wiggles ±1px at the screen edge. */
  private buzz(): void {
    if (settings().controls.haptics) platform.haptics.tap();
    this.refreshButton();
    if (this.phase !== 'closed' || platform.display.prefersReducedMotion()) return;
    const n = motion('m.phone.wiggle.count');
    this.time.addEvent({
      delay: motion('m.phone.wiggle.step'),
      repeat: n - 1,
      callback: () => {
        this.button.x = this.button.x === BUTTON.x ? BUTTON.x - 1 : BUTTON.x;
      },
    });
    this.time.delayedCall(motion('m.phone.wiggle.step') * (n + 1), () => { this.button.x = BUTTON.x; });
  }

  /** Newly unlocked app: a stepped pop on its tile (300 ms), if the home screen is up. */
  private popApp(appId: string): void {
    if (this.phase !== 'open' || this.route.app !== 'home' || platform.display.prefersReducedMotion()) return;
    const step = motion('m.phone.pop') / POP_OFFSETS.length;
    POP_OFFSETS.forEach((dy, i) => this.time.delayedCall(step * i, () => {
      this.pops[appId] = dy;
      if (this.phase === 'open') this.render();
    }));
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  private go(route: Route): void {
    this.route = route;
    this.focusId = null;
    this.scroll = 0;
    this.render();
  }

  private openApp(id: string): void {
    if (id === 'home') this.go({ app: 'home' });
    else if (id === 'chats') this.go({ app: 'chats' });
    else if (id === 'upi') this.go({ app: 'upi' });
    else if (id === 'maps') this.handToMap();
    else this.go({ app: 'stub', appId: id });
  }

  /**
   * Maps opens the fullscreen map (ADR-113): the phone steps aside without
   * resuming the world, and the map takes over the pause.
   */
  private handToMap(): void {
    const map = this.scene.get(SCENE_KEYS.MAP) as MapScene | null;
    if (!map || !this.scene.isActive(SCENE_KEYS.MAP)) { this.go({ app: 'maps' }); return; }
    this.phase = 'closed';
    this.root.setVisible(false).setY(GAME_HEIGHT);
    this.dim.setVisible(false);
    const world = this.world();
    if (this.worldFx && world) world.cameras.main.postFX?.clear();
    this.worldFx = null;
    useGameStore.getState().setOverlay(null);
    this.hint = null;
    this.button.setVisible(true);
    map.open(true);
  }

  private back(): void {
    if (this.route.app === 'thread') this.go({ app: 'chats' });
    else if (this.route.app === 'home') this.close();
    else this.go({ app: 'home' });
  }

  private showHint(text: string): void {
    this.hint = text;
    this.hintTimer?.remove();
    this.hintTimer = this.time.delayedCall(HINT_MS, () => { this.hint = null; if (this.phase === 'open') this.render(); });
    this.render();
  }

  private onKey(ev: KeyboardEvent): void {
    if (this.phase === 'closed') {
      if (ev.code === 'KeyP') this.open();
      return;
    }
    if (this.phase !== 'open') return;
    const dirs: Record<string, Direction> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    if (ev.code === 'KeyP') this.close();
    else if (ev.code === 'Escape' || ev.code === 'Backspace') this.back();
    else if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'KeyE') {
      this.focusVisible = true;
      this.focusables.find((f) => f.id === this.focusId)?.activate();
    } else if (dirs[ev.code]) this.move(dirs[ev.code]);
  }

  /** Arrow keys: scroll a scrolling screen, else move focus. */
  private move(dir: Direction): void {
    this.focusVisible = true;
    const inNav = this.focusId?.startsWith('nav:');
    const scrolls = this.route.app === 'thread' || this.route.app === 'upi' || this.route.app === 'maps';
    if (scrolls && (dir === 'up' || dir === 'down')) { this.scrollBy(dir === 'up' ? -1 : 1); return; }
    if (this.route.app === 'chats' && !inNav && (dir === 'up' || dir === 'down')) {
      const rows = this.focusables.filter((f) => f.id.startsWith('thread:'));
      const i = rows.findIndex((f) => f.id === this.focusId);
      const total = chatRows(PhoneManager.getInstance().threadsView(), 1).length;
      if (dir === 'down' && i === rows.length - 1 && this.scroll + rows.length < total) { this.scroll++; this.focusId = `@last`; this.render(); return; }
      if (dir === 'up' && i === 0 && this.scroll > 0) { this.scroll--; this.focusId = `@first`; this.render(); return; }
    }
    const i = this.focusables.findIndex((f) => f.id === this.focusId);
    const next = nextFocus(this.focusables, Math.max(0, i), dir);
    if (next >= 0) this.focusId = this.focusables[next].id;
    this.render();
  }

  /** Thread: steps of one bubble (towards older = up). UPI/Maps: one row. */
  private scrollBy(delta: number): void {
    if (this.route.app === 'thread') this.scroll = Math.max(0, this.scroll - delta);
    else this.scroll = Math.max(0, this.scroll + delta);
    this.render(); // render clamps
  }

  private toLocal(p: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: p.x - PHONE.x - PHONE.screen.x, y: p.y - this.root.y - PHONE.screen.y };
  }

  private hit(p: Phaser.Input.Pointer): Focusable | undefined {
    const { x, y } = this.toLocal(p);
    return this.focusables.find((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.phase === 'closed') {
      // The button's touch zone is 44px square around the 28px plate.
      const pad = (44 - BUTTON.size) / 2;
      if (p.x >= BUTTON.x - pad && p.x < BUTTON.x + BUTTON.size + pad && p.y >= BUTTON.y - pad && p.y < BUTTON.y + BUTTON.size + pad) this.open();
      return;
    }
    if (this.phase !== 'open') return;
    const insidePhone = p.x >= PHONE.x && p.x < PHONE.x + PHONE.w;
    if (!insidePhone) { this.close(); return; }
    this.focusVisible = false;
    this.drag = { y: p.y, moved: false };
    const f = this.hit(p);
    this.pressedId = f?.id ?? null;
    if (f) this.render();
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'open' || !this.drag || !p.isDown) return;
    const dy = p.y - this.drag.y;
    if (Math.abs(dy) < DRAG_STEP) return;
    this.drag = { y: p.y, moved: true };
    this.pressedId = null;
    if (this.route.app === 'chats') {
      const total = chatRows(PhoneManager.getInstance().threadsView(), 1).length;
      this.scroll = Math.max(0, Math.min(Math.max(0, total - listRows()), this.scroll + (dy < 0 ? 1 : -1)));
      this.render();
    } else this.scrollBy(dy < 0 ? (this.route.app === 'thread' ? -1 : 1) : (this.route.app === 'thread' ? 1 : -1));
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'open') return;
    const pressed = this.pressedId;
    const dragged = this.drag?.moved;
    this.pressedId = null;
    this.drag = null;
    const f = this.hit(p);
    if (pressed && !dragged && f?.id === pressed) { this.focusId = f.id; f.activate(); }
    else if (pressed) this.render();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private stateOf(id: string, base: UiState = 'default'): UiState {
    if (base === 'locked' || base === 'disabled') return base;
    if (this.pressedId === id) return 'pressed';
    if (this.focusVisible && this.focusId === id) return 'focus';
    return base;
  }

  private focusable(id: string, box: Box, activate: () => void): void {
    this.focusables.push({ id, ...box, activate });
  }

  private render(): void {
    this.screenLayer.removeAll(true);
    this.focusables = [];
    const store = useGameStore.getState();
    const status = statusBar(store.clock, store.stats.battery, store.activeDistrict);
    this.drawStatus(status.time, status.bars, status.battery, status.batteryLow, this.route.app === 'home' ? status.carrier : null);

    switch (this.route.app) {
      case 'home': this.drawHome(); break;
      case 'chats': this.drawChats(); break;
      case 'thread': this.drawThread(this.route.threadId); break;
      case 'upi': this.drawUpi(); break;
      case 'maps': this.drawMaps(); break;
      case 'stub': this.drawStub(this.route.appId); break;
    }
    if (this.hint) this.drawHint(this.hint);

    // Resolve the focus: a default per screen, or the first/last row after a list scroll.
    const ids = this.focusables.map((f) => f.id);
    let want = this.focusId;
    if (want === '@last') want = [...ids].reverse().find((id) => id.startsWith('thread:')) ?? null;
    if (want === '@first') want = ids.find((id) => id.startsWith('thread:')) ?? null;
    if (!want || !ids.includes(want)) want = this.defaultFocus(ids);
    if (want !== this.focusId) { this.focusId = want; if (this.focusVisible) this.render(); }
  }

  private defaultFocus(ids: string[]): string | null {
    const current = this.route.app === 'stub' ? null : `nav:${this.route.app === 'thread' ? 'chats' : this.route.app}`;
    const firstContent = ids.find((id) => !id.startsWith('nav:'));
    return firstContent ?? (current && ids.includes(current) ? current : ids[0] ?? null);
  }

  private text(x: number, y: number, s: string, tint: TokenName, opts: { bold?: boolean; k?: 1 | 2; align?: 'left' | 'center' | 'right' } = {}): void {
    this.screenLayer.add(pxText(this, x, y, s, { ...opts, tint }));
  }

  private image(x: number, y: number, key: string): void {
    this.screenLayer.add(this.add.image(x, y, key).setOrigin(0));
  }

  private drawStatus(time: string, bars: number, battery: number, low: boolean, carrier: string | null): void {
    this.text(10, 3, time, 'phone.lcd.ink', { bold: true });
    const key = bake(this, `ph:status:${bars}:${battery}:${low}`, STATUS_ICONS.w, STATUS_ICONS.h, (g) => paintStatusIcons(g, bars, battery, low));
    this.image(PHONE.screen.w - 48, 2, key);
    if (carrier) this.text(PHONE.screen.w / 2, 17, carrier, 'phone.lcd.mid', { align: 'center' });
  }

  // Home ──────────────────────────────────────────────────────────────────

  private drawHome(): void {
    const phone = PhoneManager.getInstance();
    const { grid, dock } = homeTiles(phone.apps(), phone.unreadCount());
    const cracked = Boolean(useGameStore.getState().flags.phone_cracked);
    this.image(0, HOME.wallpaperY, bake(this, `ph:wallpaper:${cracked}`, WALLPAPER.w, WALLPAPER.h, (g) => paintWallpaper(g, cracked)));

    grid.forEach((tile, i) => {
      const cell = gridCell(i);
      this.drawTile(tile, cell.x + HOME.tileX, cell.y + HOME.tileY, cell);
    });

    // Page dots: one page for now.
    this.image(PHONE.screen.w / 2 - 2, HOME.dotsY, bake(this, 'ph:dot', 4, 4, (g) => rect(g, 0, 0, 4, 4, hex('phone.lcd.ink'))));

    this.image(0, HOME.dockY, 'ph:dockband');
    dock.forEach((tile, i) => {
      const cell = dockCell(i);
      const x = cell.x + HOME.tileX;
      if (tile.label) this.image(x - 4, HOME.dockTileY + 37, bake(this, 'ph:labelbg', 40, 11, (g) => roundRect(g, 0, 0, 40, 11, 3, hex('phone.lcd.bg'))));
      this.drawTile(tile, x, HOME.dockTileY, cell);
    });
  }

  private drawTile(tile: HomeTile, x: number, y: number, cell: Box): void {
    const id = `app:${tile.id}`;
    const state = this.stateOf(id, tile.state);
    const dy = this.pops[tile.id] ?? 0;
    const key = bake(this, `ph:tile:${tile.icon}:${state}`, APP_TILE, APP_TILE + 2, (g) => appTile(g, 0, 0, tile.icon, state));
    this.image(x, y + dy, key);
    if (tile.label) this.text(x + APP_TILE / 2, y + 39, tile.label, 'phone.lcd.ink', { align: 'center' });
    if (tile.badge > 0) this.drawBadge(x + 24, y - 4, tile.badge);
    this.focusable(id, cell, () => {
      if (tile.state === 'locked') this.showHint(tile.hint ?? 'Not yet.');
      else this.openApp(tile.id);
    });
  }

  private drawBadge(x: number, y: number, n: number): void {
    const label = n > 9 ? '9+' : String(n);
    const w = Math.max(9, measure(label) + 3);
    this.image(x - 1, y - 1, bake(this, `ph:badge:${w}`, w + 2, 13, (g) => badge(g, 1, 1, w)));
    this.text(x + Math.round(w / 2), y + 2, label, 'phone.lcd.bg', { align: 'center' });
  }

  private drawHint(text: string): void {
    const y = this.route.app === 'home' ? HOME.dotsY - 30 : APP.nav.y - 30;
    const w = LIST.w;
    this.image(LIST.x, y, bake(this, `ph:pill:${w}x22:focus`, w, 24, (g) => phonePill(g, 0, 0, w, 22, 'focus')));
    this.text(LIST.x + w / 2, y + 8, truncate(text, w - 16), 'phone.lcd.bg', { align: 'center' });
  }

  // App chrome ────────────────────────────────────────────────────────────

  private drawChrome(icon: IconName, title: string, active: 'home' | 'chats' | 'maps' | 'upi' | null, accent?: TokenName): void {
    const { x, y, size } = APP.glyph;
    const glyph = ICONS[icon];
    this.image(x, y, bake(this, `ph:glyph:${icon}:${accent ?? 'ink'}`, size + 2, size + 2, (g) => {
      roundRect(g, 0, 0, size + 2, size + 2, 4, hex('phone.lcd.ink'));
      roundRect(g, 2, 2, size - 2, size - 2, 2, hex('phone.lcd.bg'));
      bitmap(g, glyph, Math.floor((size + 2 - bitmapWidth(glyph)) / 2), Math.floor((size + 2 - bitmapHeight(glyph)) / 2), hex(accent ?? 'phone.lcd.ink'));
    }));
    const t = APP.title;
    this.image(t.x, t.y, bake(this, `ph:pill:${t.w}x${t.h}:default`, t.w, t.h + 2, (g) => phonePill(g, 0, 0, t.w, t.h, 'default')));
    this.text(t.x + t.w / 2, t.y + 8, truncate(title, t.w - 16, true), 'phone.lcd.ink', { bold: true, align: 'center' });
    this.drawNav(active);
  }

  private drawNav(active: 'home' | 'chats' | 'maps' | 'upi' | null): void {
    const n = APP.nav;
    this.image(n.x, n.y, bake(this, `ph:nav:${n.w}x${n.h}`, n.w, n.h + 2, (g) => dockBar(g, 0, 0, n.w, n.h)));
    const apps = PhoneManager.getInstance().apps();
    const cellW = Math.floor(n.w / NAV.length);
    NAV.forEach((item, i) => {
      const unlocked = item.id === 'home' || apps.find((a) => a.id === item.id)?.unlocked !== false;
      const id = `nav:${item.id}`;
      const state = this.stateOf(id, unlocked ? 'default' : 'locked');
      const variant = !unlocked ? 'locked' : state === 'focus' || state === 'pressed' ? 'focus' : item.id === active ? 'active' : 'idle';
      const cx = n.x + i * cellW + Math.floor(cellW / 2);
      const glyph = ICONS[item.icon];
      const gw = bitmapWidth(glyph), gh = bitmapHeight(glyph);
      this.image(cx - 10, n.y + 3, bake(this, `ph:navicon:${item.icon}:${variant}`, 20, 24, (g) => {
        if (variant === 'focus') ring(g, 0, 0, 20, 24, 4, 1, hex('phone.lcd.bg'));
        const c = hex(variant === 'idle' || variant === 'locked' ? 'phone.lcd.mid' : 'phone.lcd.bg');
        bitmap(g, glyph, Math.floor((20 - gw) / 2), Math.floor((20 - gh) / 2), c, 1, variant === 'locked' ? (a, b) => (a + b) % 2 === 0 : undefined);
        if (variant === 'active') rect(g, 4, 21, 12, 2, c);
      }));
      this.focusable(id, { x: n.x + i * cellW, y: n.y - 7, w: cellW, h: 44 }, () => {
        if (!unlocked) { this.showHint(apps.find((a) => a.id === item.id)?.hint ?? 'Not yet.'); return; }
        this.openApp(item.id);
      });
    });
  }

  private clampScroll(max: number): void {
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, max)));
  }

  private arrows(more: { up: boolean; down: boolean }, top: number, bottom: number): void {
    if (more.up) this.text(PHONE.screen.w - 14, top - 9, '▲', 'phone.lcd.mid');
    if (more.down) this.text(PHONE.screen.w - 14, bottom + 2, '▼', 'phone.lcd.mid');
  }

  // Chats ─────────────────────────────────────────────────────────────────

  private drawChats(): void {
    this.drawChrome('chats', 'CHATS', 'chats');
    const phone = PhoneManager.getInstance();
    const rows = chatRows(phone.threadsView(), LIST.w - 16);
    if (!rows.length) { this.text(PHONE.screen.w / 2, 120, 'No messages yet.', 'phone.lcd.mid', { align: 'center' }); return; }
    const visible = listRows();
    this.clampScroll(rows.length - visible);
    rows.slice(this.scroll, this.scroll + visible).forEach((row, k) => {
      const y = APP.contentTop + k * LIST.pitch;
      const id = `thread:${row.threadId}`;
      const state = this.stateOf(id);
      const painted = this.pill(LIST.x, y, LIST.w, LIST.rowH, state);
      const right = row.unread ? measure(String(row.unread)) + 12 : 0;
      this.text(LIST.x + 8, y + 8 + painted.dy, truncate(row.contact, LIST.w - 16 - right, true), painted.ink, { bold: true });
      this.text(LIST.x + 8, y + 22 + painted.dy, truncate(row.preview, LIST.w - 16), painted.ink);
      if (row.unread) this.drawBadge(LIST.x + LIST.w - 8 - Math.max(9, measure(String(row.unread)) + 3), y + 6 + painted.dy, row.unread);
      this.focusable(id, { x: LIST.x, y: y - 2, w: LIST.w, h: LIST.pitch }, () => {
        phone.markRead(row.threadId);
        this.refreshButton();
        this.go({ app: 'thread', threadId: row.threadId });
      });
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, APP.contentTop, APP.contentTop + visible * LIST.pitch - 4);
  }

  private drawThread(threadId: string): void {
    const view = PhoneManager.getInstance().threadsView().find((t) => t.thread.id === threadId);
    this.drawChrome('contacts', view?.thread.contact.toUpperCase() ?? 'CHAT', 'chats');
    if (!view) return;
    const list = bubbles(view.messages);
    const top = APP.contentTop, height = APP.nav.y - 8 - top;
    this.clampScroll(list.length - 1);
    const { start, end } = bubbleWindow(list, height, this.scroll);
    let y = top + height - list.slice(start, end).reduce((h, b, i) => h + b.h + (i ? BUBBLE.gap : 0), 0);
    for (let i = start; i < end; i++) {
      const b = list[i];
      const x = b.from === 'me' ? PHONE.screen.w - 10 - b.w : 10;
      const mine = b.from === 'me';
      this.image(x, y, bake(this, `ph:bubble:${b.from}:${b.w}x${b.h}`, b.w, b.h, (g) => {
        roundRect(g, 0, 0, b.w, b.h, 5, hex('phone.lcd.ink'));
        if (!mine) roundRect(g, 1, 1, b.w - 2, b.h - 2, 4, hex('phone.lcd.bg'));
      }));
      b.lines.forEach((line, j) => this.text(x + BUBBLE.padX, y + BUBBLE.padY + j * BUBBLE.lineH, line, mine ? 'phone.lcd.bg' : 'phone.lcd.ink'));
      y += b.h + BUBBLE.gap;
    }
    this.arrows({ up: start > 0, down: this.scroll > 0 }, top + 6, APP.nav.y - 16);
  }

  // UPI ───────────────────────────────────────────────────────────────────

  private drawUpi(): void {
    this.drawChrome('upi', 'NAMMA PAY', 'upi', 'phone.accent.upi');
    const { balance, transactions } = PhoneManager.getInstance().upi();
    const mid = PHONE.screen.w / 2;
    this.text(mid, 56, 'BALANCE', 'phone.lcd.mid', { align: 'center' });
    this.text(mid, 68, rupees(Math.max(0, balance)), 'phone.lcd.ink', { k: 2, align: 'center' });
    this.text(12, 96, 'RECENT', 'phone.lcd.mid');
    this.image(52, 99, bake(this, 'ph:rule', PHONE.screen.w - 64, 1, (g) => rect(g, 0, 0, PHONE.screen.w - 64, 1, hex('phone.lcd.mid'))));
    const w = LIST.w;
    const rows = upiRows(transactions, w - 20);
    if (!rows.length) { this.text(mid, 130, 'No payments yet.', 'phone.lcd.mid', { align: 'center' }); return; }
    const visible = Math.floor((APP.nav.y - 8 - UPI_ROWS.top) / UPI_ROWS.pitch);
    this.clampScroll(rows.length - visible);
    rows.slice(this.scroll, this.scroll + visible).forEach((row, k) => {
      const y = UPI_ROWS.top + k * UPI_ROWS.pitch;
      this.pill(LIST.x, y, w, UPI_ROWS.h, 'default');
      this.text(LIST.x + 10, y + 7, row.amount, row.tone === 'in' ? 'phone.accent.upi' : 'phone.accent.alert', { bold: true });
      this.text(LIST.x + w - 10, y + 7, row.label, 'phone.lcd.ink', { align: 'right' });
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, UPI_ROWS.top, UPI_ROWS.top + visible * UPI_ROWS.pitch - 4);
  }

  // Maps (list until the fullscreen map, P6b) ─────────────────────────────

  private drawMaps(): void {
    this.drawChrome('maps', 'MAPS', 'maps');
    const rows = mapRows(PhoneManager.getInstance().maps());
    const visible = listRows();
    this.clampScroll(rows.length - visible);
    const mark = { destination: '★', here: '▶', open: '○', locked: '' } as const;
    rows.slice(this.scroll, this.scroll + visible).forEach((row, k) => {
      const y = APP.contentTop + k * LIST.pitch;
      const painted = this.pill(LIST.x, y, LIST.w, LIST.rowH, row.state === 'locked' ? 'locked' : 'default');
      const prefix = mark[row.state];
      const title = `${prefix ? `${prefix} ` : ''}${row.label.toUpperCase()}`;
      this.text(LIST.x + 8, y + 8, truncate(title, LIST.w - 16, true), painted.ink, { bold: true });
      const detail = row.state === 'destination' ? row.detail ?? '' : row.state === 'here' ? 'You are here' : row.state === 'locked' ? 'Not open to you yet' : '';
      if (detail) this.text(LIST.x + 8, y + 22, truncate(detail, LIST.w - 16), painted.ink);
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, APP.contentTop, APP.contentTop + visible * LIST.pitch - 4);
  }

  private drawStub(appId: string): void {
    const app = PhoneManager.getInstance().apps().find((a) => a.id === appId);
    this.drawChrome((app?.icon ?? 'notes') as IconName, (app?.name ?? appId).toUpperCase(), null);
    this.text(PHONE.screen.w / 2, 130, 'Nothing here yet.', 'phone.lcd.mid', { align: 'center' });
  }

  private pill(x: number, y: number, w: number, h: number, state: UiState): Painted {
    this.image(x, y, bake(this, `ph:pill:${w}x${h}:${state}`, w, h + 2, (g) => phonePill(g, 0, 0, w, h, state)));
    return phonePill(NOOP, 0, 0, w, h, state);
  }
}


export default PhoneScene;
