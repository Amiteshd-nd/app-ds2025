import { JODI_INDEX, jodiState, swipe } from '../systems/jodi';
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
import { measure, rupees, truncate, wrap } from '../ui/kit/text';
import { APP, HOME, LIST, PHONE, POP_OFFSETS, SAFE_BOTTOM, dockCell, gridCell, listRows, slideSteps } from '../ui/phone/layout';
import { paintDockBand, paintFrame, paintStatusIcons, paintWallpaper, STATUS_ICONS, WALLPAPER } from '../ui/phone/paint';
import { BUBBLE, bubbleWindow, bubbles, bufferingText, cameraView, chatRows, homeTiles, mapRows, noteDetail, reelState, signalAt, statusBar, upiRows, visibleReels, type HomeTile, type ReelState } from '../ui/phone/viewModel';
import { DISTRICTS, JODI_PROFILES, PHONE_APPS, REELS } from '../data';
import type { ReelClip } from '../utils/types';
import { hudLayout, hudScale } from '../ui/hud/layout';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import { useSettings } from '../systems/SettingsManager';
import type { MenuScene } from './MenuScene';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import type { MapScene } from './MapScene';
import type { WorldScene } from './WorldScene';
import { cue } from '../audio/cue';

type Route =
  | { app: 'home' }
  | { app: 'chats' }
  | { app: 'thread'; threadId: string }
  | { app: 'upi' }
  | { app: 'maps' }
  | { app: 'reels' }
  | { app: 'reel'; clipId: string; since: number }
  | { app: 'camera' }
  | { app: 'contacts' }
  | { app: 'notes' }
  | { app: 'jodi' }
  | { app: 'news' }
  | { app: 'stub'; appId: string };

interface Focusable extends Box {
  id: string;
  activate: () => void;
}

/** The closed phone's button: the HUD's top-right corner (ADR-118), at the HUD's scale (ADR-119). */
const button = () => { const L = hudLayout(hudScale(settings().accessibility.largerText)); return { x: L.phoneButton.x * L.k, y: L.phoneButton.y * L.k, size: L.phoneButton.size, k: L.k }; };
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
      useSettings.subscribe(() => this.placeButton()),
      // The closed button hides under the map and the pause menu; it is the HUD's corner, not theirs.
      useGameStore.subscribe((s, prev) => { if (s.overlay !== prev.overlay && this.phase === 'closed') this.button.setVisible(s.overlay === null); }),
      // Gamepad (ADR-119): the same intents as the keys. Y opens the phone while walking.
      attachGamepad(this, {
        button: (b) => {
          if (this.phase === 'closed') { if (b === PAD.Y && useGameStore.getState().overlay === null) this.open(); return; }
          if (this.phase !== 'open') return;
          if (b === PAD.A) this.onKey({ code: 'Enter' } as KeyboardEvent);
          else if (b === PAD.B) this.onKey({ code: 'Escape' } as KeyboardEvent);
          else if (b === PAD.Y) this.close();
        },
        dir: (d) => { if (this.phase === 'open') this.move(d); },
      }),
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
    if (this.phase !== 'closed' || !world?.canOpenOverlay() || !world.allowsOverlays()) return;
    cue('a.phone.slide_up');
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
    cue('a.phone.slide_down');
    this.phase = 'moving';
    const steps = slideSteps(motion('m.phone.open.steps'), platform.display.prefersReducedMotion());
    // Same stepped rhythm, downwards.
    const down = steps.length > 1 ? steps.slice(0, -1).reverse().concat(GAME_HEIGHT) : [GAME_HEIGHT];
    this.slide(down, () => this.finishClose());
  }

  private finishClose(): void {
    this.stopReel();
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
    const s = button().size;
    bake(this, 'ph:button', s, s + 1, (g) => {
      hudPlate(g, 0, 0, s, s, 'default', 4);
      bitmap(g, ICONS.phone, 6, 6, hex('hud.text'));
      [2, 4, 6, 8].forEach((h, i) => rect(g, 18 + i * 2, 22 - h, 1, h, hex('hud.text')));
    });
    bake(this, 'ph:button:badge', 6, 6, (g) => roundRect(g, 0, 0, 6, 6, 2, hex('phone.accent.chat')));
    this.buttonPlate = this.add.image(0, 0, 'ph:button').setOrigin(0);
    this.buttonBadge = this.add.image(s - 8, 3, 'ph:button:badge').setOrigin(0);
    this.button = this.add.container(0, 0, [this.buttonPlate, this.buttonBadge]);
    this.placeButton();
    this.refreshButton();
  }

  /** Where the HUD's layout puts the button right now (Larger text moves and doubles it). */
  private placeButton(): void {
    const b = button();
    this.button.setPosition(b.x, b.y).setScale(b.k);
    // Not your phone in someone else's life (Ravi in the corridor, ADR-138).
    const district = useGameStore.getState().activeDistrict;
    this.button.setVisible(!(district && DISTRICTS[district]?.hud === 'minimal'));
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
        const bx = button().x;
        this.button.x = this.button.x === bx ? bx - 1 : bx;
      },
    });
    this.time.delayedCall(motion('m.phone.wiggle.step') * (n + 1), () => { this.button.x = button().x; });
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
    cue('a.phone.tap');
    if (id === 'home') this.go({ app: 'home' });
    else if (id === 'chats') this.go({ app: 'chats' });
    else if (id === 'upi') this.go({ app: 'upi' });
    else if (id === 'maps') this.handToMap();
    else if (id === 'settings') this.handToMenu();
    else if (id === 'reels') this.go({ app: 'reels' });
    else if (id === 'camera') this.go({ app: 'camera' });
    else if (id === 'contacts') this.go({ app: 'contacts' });
    else if (id === 'notes') this.go({ app: 'notes' });
    else if (id === 'dating') this.go({ app: 'jodi' });
    else if (id === 'news') this.go({ app: 'news' });
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

  /** Settings app → the pause menu's Settings screen (ADR-119); the menu takes over the pause. */
  private handToMenu(): void {
    const menu = this.scene.get(SCENE_KEYS.MENU) as MenuScene | null;
    if (!menu || !this.scene.isActive(SCENE_KEYS.MENU)) { this.go({ app: 'stub', appId: 'settings' }); return; }
    this.phase = 'closed';
    this.root.setVisible(false).setY(GAME_HEIGHT);
    this.dim.setVisible(false);
    const world = this.world();
    if (this.worldFx && world) world.cameras.main.postFX?.clear();
    this.worldFx = null;
    useGameStore.getState().setOverlay(null);
    this.hint = null;
    this.button.setVisible(true);
    menu.open({ screen: 'settings', fromOverlay: true });
  }

  private back(): void {
    if (this.route.app === 'reel') { this.stopReel(); this.go({ app: 'reels' }); return; }
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
    const scrolls = this.route.app === 'news' || this.route.app === 'thread' || this.route.app === 'upi' || this.route.app === 'maps' || this.route.app === 'reels' || this.route.app === 'camera' || this.route.app === 'contacts' || this.route.app === 'notes';
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
      // The button's touch zone is at least 44px square around the plate.
      const b = button();
      const size = b.size * b.k;
      const pad = Math.max(0, (44 - size) / 2);
      if (p.x >= b.x - pad && p.x < b.x + size + pad && p.y >= b.y - pad && p.y < b.y + size + pad) this.open();
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
      case 'reels': this.drawReels(); break;
      case 'reel': this.drawReel(this.route.clipId, this.route.since); break;
      case 'camera': this.drawCamera(); break;
      case 'contacts': this.drawContacts(); break;
      case 'notes': this.drawNotes(); break;
      case 'jodi': this.drawJodi(); break;
      case 'news': this.drawNews(); break;
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
    // "Server busy." (story 3.4, ADR-142): a banner while its flag is set; payments still go through.
    const notice = PHONE_APPS.find((a) => a.id === 'upi')?.noticeIf;
    if (notice && useGameStore.getState().flags[notice.flag]) this.text(mid, 44, notice.text, 'phone.accent.alert', { align: 'center' });
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

  // Reels (ADR-122) ───────────────────────────────────────────────────────

  private reelTimer: Phaser.Time.TimerEvent | null = null;
  private reelResolved = false;

  private drawReels(): void {
    this.drawChrome('reels', 'REELS', null, 'phone.accent.chat');
    const clips = visibleReels(REELS, useGameStore.getState().flags);
    const visible = listRows();
    this.clampScroll(clips.length - visible);
    clips.slice(this.scroll, this.scroll + visible).forEach((clip, k) => {
      const y = APP.contentTop + k * LIST.pitch;
      const id = `reel:${clip.id}`;
      const state = this.stateOf(id);
      const painted = this.pill(LIST.x, y, LIST.w, LIST.rowH, state);
      const seen = Boolean(useGameStore.getState().flags[`reels_${clip.id}_seen`]);
      this.text(LIST.x + 8, y + 8 + painted.dy, truncate(clip.title, LIST.w - 16, true), painted.ink, { bold: true });
      this.text(LIST.x + 8, y + 22 + painted.dy, truncate(`${clip.handle}${seen ? ' · seen' : clip.critical ? ' · NEW' : ''}`, LIST.w - 16), painted.ink);
      this.focusable(id, { x: LIST.x, y: y - 2, w: LIST.w, h: LIST.pitch }, () => this.openReel(clip.id));
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < clips.length }, APP.contentTop, APP.contentTop + visible * LIST.pitch - 4);
  }

  private openReel(clipId: string): void {
    this.stopReel();
    this.reelResolved = false;
    this.go({ app: 'reel', clipId, since: this.time.now });
    // The buffering dots and the 2-bar wait need a clock: redraw a few times a second while the clip is up.
    this.reelTimer = this.time.addEvent({ delay: 200, loop: true, callback: () => { if (this.phase === 'open' && this.route.app === 'reel') this.render(); } });
  }

  private stopReel(): void {
    this.reelTimer?.remove();
    this.reelTimer = null;
  }

  /** The signal test, resolved: a clip that plays or fails at a room's door checks that room off. */
  private resolveReel(clip: ReelClip, state: ReelState): void {
    if (this.reelResolved || state === 'buffering') return;
    this.reelResolved = true;
    const store = useGameStore.getState();
    if (state === 'playing' && !store.flags[`reels_${clip.id}_seen`]) store.setFlag(`reels_${clip.id}_seen`, true);
    if (store.signalZoneFlag && !store.flags[store.signalZoneFlag]) store.setFlag(store.signalZoneFlag, true);
    this.stopReel();
  }

  private drawReel(clipId: string, since: number): void {
    const clip = REELS.find((c) => c.id === clipId);
    this.drawChrome('reels', 'REELS', null, 'phone.accent.chat');
    if (!clip) { this.text(PHONE.screen.w / 2, 130, 'Clip gone.', 'phone.lcd.mid', { align: 'center' }); return; }
    const store = useGameStore.getState();
    const bars = signalAt(store.activeDistrict);
    const elapsed = this.time.now - since;
    const state = reelState(bars, elapsed);
    // The "video": a frame with the LCD's dark tone; playing shows the clip's card, buffering the spinner text.
    const fx = LIST.x, fy = APP.contentTop, fw = LIST.w, fh = 120;
    this.image(fx, fy, bake(this, `ph:reelframe:${state}`, fw, fh, (g) => {
      roundRect(g, 0, 0, fw, fh, 6, hex('phone.lcd.ink'));
      if (state === 'playing') { roundRect(g, 3, 3, fw - 6, fh - 6, 4, hex('phone.lcd.mid')); for (let i = 0; i < 6; i++) rect(g, 8 + i * 26, 60 + (i % 2) * 8, 18, 30 - (i % 3) * 6, hex('phone.lcd.bg')); }
    }));
    if (state === 'playing') {
      this.text(fx + 8, fy + 8, truncate(clip.title, fw - 16, true), 'phone.lcd.bg', { bold: true });
      this.text(fx + 8, fy + 22, truncate(clip.handle, fw - 16), 'phone.lcd.bg');
      this.text(fx + 8, fy + fh + 8, truncate(clip.caption, fw - 16), 'phone.lcd.ink');
    } else if (state === 'nosignal') {
      this.text(fx + fw / 2, fy + fh / 2 - 8, 'No network.', 'phone.lcd.bg', { bold: true, align: 'center' });
      this.text(fx + fw / 2, fy + fh / 2 + 6, 'Try near a window.', 'phone.lcd.mid', { align: 'center' });
    } else if (state === 'failed') {
      this.text(fx + fw / 2, fy + fh / 2 - 8, "Didn't load.", 'phone.lcd.bg', { bold: true, align: 'center' });
      this.text(fx + fw / 2, fy + fh / 2 + 6, 'One bar is a rumour of a network.', 'phone.lcd.mid', { align: 'center' });
    } else {
      this.text(fx + fw / 2, fy + fh / 2 - 3, bufferingText(elapsed), 'phone.lcd.bg', { bold: true, align: 'center' });
    }
    this.text(fx, fy + fh + 24, `Signal here: ${bars} bar${bars === 1 ? '' : 's'}`, 'phone.lcd.mid');
    this.resolveReel(clip, state);
  }

  // Camera / City Moments (ADR-123) ────────────────────────────────────────

  private drawCamera(): void {
    this.drawChrome('camera', 'CAMERA', null);
    const phone = PhoneManager.getInstance();
    const view = cameraView(useGameStore.getState().photoSpot, phone.photos());
    // The viewfinder: a dark frame with corner marks; the framed subject's name on it.
    const fx = LIST.x, fy = APP.contentTop, fw = LIST.w, fh = 70;
    this.image(fx, fy, bake(this, `ph:finder:${view.framed ? (view.framed.taken ? 'taken' : 'framed') : 'empty'}`, fw, fh, (g) => {
      roundRect(g, 0, 0, fw, fh, 6, hex('phone.lcd.ink'));
      const c = hex(view.framed && !view.framed.taken ? 'phone.lcd.bg' : 'phone.lcd.mid');
      for (const [cx, cy] of [[6, 6], [fw - 16, 6], [6, fh - 16], [fw - 16, fh - 16]] as const) {
        rect(g, cx, cy, 10, 2, c); rect(g, cx, cy, 2, 10, c);
        rect(g, cx, cy + 8, 10, 2, c); rect(g, cx + 8, cy, 2, 10, c);
      }
      if (view.framed) roundRect(g, fw / 2 - 20, fh / 2 - 12, 40, 24, 3, hex('phone.lcd.mid'));
    }));
    this.text(fx + fw / 2, fy + fh + 6, truncate(view.line, fw, true), view.canSnap ? 'phone.lcd.ink' : 'phone.lcd.mid', { bold: true, align: 'center' });
    const snapY = fy + fh + 20;
    if (view.canSnap) {
      const id = 'camera:snap';
      const painted = this.pill(LIST.x + 40, snapY, LIST.w - 80, 22, this.stateOf(id));
      this.text(PHONE.screen.w / 2, snapY + 7 + painted.dy, 'SNAP', painted.ink, { bold: true, align: 'center' });
      this.focusable(id, { x: LIST.x + 40, y: snapY - 11, w: LIST.w - 80, h: 44 }, () => { if (view.framed) { phone.takePhoto(view.framed.id); this.render(); } });
    }
    // City Moments: the sets' progress, then the gallery.
    let y = snapY + 30;
    for (const set of view.sets) this.text(LIST.x, y, `${set.set.toUpperCase()} · ${set.done}/${set.total}`, 'phone.lcd.mid'), (y += 12);
    const rows = view.gallery;
    const top = y + 4;
    const rowH = 26, pitch = 30;
    const visible = Math.max(1, Math.floor((APP.nav.y - 8 - top) / pitch));
    this.clampScroll(rows.length - visible);
    if (!rows.length) this.text(PHONE.screen.w / 2, top + 10, 'No photos yet.', 'phone.lcd.mid', { align: 'center' });
    rows.slice(this.scroll, this.scroll + visible).forEach((p, k) => {
      const ry = top + k * pitch;
      const painted = this.pill(LIST.x, ry, LIST.w, rowH, 'default');
      this.text(LIST.x + 8, ry + 4, truncate(p.title, LIST.w - 16, true), painted.ink, { bold: true });
      this.text(LIST.x + 8, ry + 15, truncate(p.caption, LIST.w - 16), painted.ink);
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, top, top + visible * pitch - 4);
  }

  // Contacts (ADR-123) ─────────────────────────────────────────────────────

  private drawContacts(): void {
    this.drawChrome('contacts', 'CONTACTS', null);
    const rows = PhoneManager.getInstance().contacts();
    const visible = listRows();
    this.clampScroll(rows.length - visible);
    rows.slice(this.scroll, this.scroll + visible).forEach((c, k) => {
      const y = APP.contentTop + k * LIST.pitch;
      const painted = this.pill(LIST.x, y, LIST.w, LIST.rowH, 'default');
      this.text(LIST.x + 8, y + 8, truncate(c.name.toUpperCase(), LIST.w - 16, true), painted.ink, { bold: true });
      const detail = c.status ? `${c.note ?? ''}${c.note ? ' · ' : ''}${c.status}` : c.note ?? '';
      if (detail) this.text(LIST.x + 8, y + 22, truncate(detail, LIST.w - 16), painted.ink);
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, APP.contentTop, APP.contentTop + visible * LIST.pitch - 4);
  }

  // Notes — the wishlist (ADR-123) ─────────────────────────────────────────

  private drawNotes(): void {
    this.drawChrome('notes', 'NOTES', null);
    const rows = PhoneManager.getInstance().notes();
    if (!rows.length) { this.text(PHONE.screen.w / 2, 130, 'Nothing noted yet.', 'phone.lcd.mid', { align: 'center' }); return; }
    const visible = listRows();
    this.clampScroll(rows.length - visible);
    rows.slice(this.scroll, this.scroll + visible).forEach((n, k) => {
      const y = APP.contentTop + k * LIST.pitch;
      const painted = this.pill(LIST.x, y, LIST.w, LIST.rowH, 'default');
      this.text(LIST.x + 8, y + 8, truncate(n.text, LIST.w - 16, true), painted.ink, { bold: true });
      const detail = noteDetail(n.price, n.toGo);
      if (detail) this.text(LIST.x + 8, y + 22, truncate(detail, LIST.w - 16), painted.ink);
    });
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, APP.contentTop, APP.contentTop + visible * LIST.pitch - 4);
  }

  // News — the weekly headlines (story 2.7, ADR-135) ────────────────────

  private newsOpen: string | null = null;

  private drawNews(): void {
    this.drawChrome('news', 'NEWS', null);
    const rows = PhoneManager.getInstance().news();
    if (!rows.length) { this.text(PHONE.screen.w / 2, 130, 'No news is good news.', 'phone.lcd.mid', { align: 'center' }); return; }
    const visible = listRows();
    this.clampScroll(rows.length - visible);
    let y = APP.contentTop;
    for (const n of rows.slice(this.scroll, this.scroll + visible)) {
      const id = `news:${n.id}`;
      const open = this.newsOpen === n.id;
      // Open: the whole headline (wrapped) and the two-line story; closed: one truncated line.
      const head = open ? wrap(n.headline, LIST.w - 16, true).slice(0, 2) : [truncate(n.headline, LIST.w - 16, true)];
      const lines = open ? wrap(n.body, LIST.w - 16).slice(0, 3) : [];
      const h = LIST.rowH + (head.length - 1) * 11 + lines.length * 11;
      const painted = this.pill(LIST.x, y, LIST.w, h, this.stateOf(id));
      this.text(LIST.x + 8, y + 6, truncate(`${n.date} · ${n.source.toUpperCase()}`, LIST.w - 16), painted.ink);
      head.forEach((l, k) => this.text(LIST.x + 8, y + 18 + k * 11, l, painted.ink, { bold: true }));
      lines.forEach((l, k) => this.text(LIST.x + 8, y + 31 + (head.length - 1) * 11 + k * 11, l, painted.ink));
      this.focusable(id, { x: LIST.x, y, w: LIST.w, h }, () => { this.newsOpen = open ? null : n.id; this.render(); });
      y += h + (LIST.pitch - LIST.rowH);
    }
    this.arrows({ up: this.scroll > 0, down: this.scroll + visible < rows.length }, APP.contentTop, y - 4);
  }

  // Jodi — the parody dating app (story 2.6, ADR-134) ────────────────────

  private drawJodi(): void {
    this.drawChrome('dating', 'JODI', null);
    const store = useGameStore.getState();
    const index = store.counters[JODI_INDEX] ?? 0;
    const state = jodiState(JODI_PROFILES, index, store.flags);
    const cx = PHONE.screen.w / 2, top = APP.contentTop;
    const button = (id: string, x: number, y: number, w: number, label: string, run: () => void) => {
      const painted = this.pill(x, y, w, 22, this.stateOf(id));
      this.text(x + w / 2, y + 7 + painted.dy, label, painted.ink, { bold: true, align: 'center' });
      this.focusable(id, { x, y: y - 11, w, h: 44 }, run);
    };
    if (state.kind === 'card') {
      const p = state.profile;
      if (this.textures.exists(p.portrait)) this.image(cx - 28, top + 2, p.portrait);
      this.text(cx, top + 66, p.name.toUpperCase(), 'phone.lcd.ink', { bold: true, align: 'center' });
      for (const [k, line] of wrap(p.line, LIST.w - 8).slice(0, 3).entries()) this.text(cx, top + 80 + k * 12, line, 'phone.lcd.mid', { align: 'center' });
      const decide = (like: boolean) => {
        const r = swipe(JODI_PROFILES, index, like);
        const s = useGameStore.getState();
        s.setCounter(JODI_INDEX, r.index);
        for (const f of ['dating_opened', ...r.flags]) s.setFlag(f, true);
        this.render();
      };
      const by = top + 122, bw = (LIST.w - 10) / 2;
      button('jodi:no', LIST.x, by, bw, 'NOPE', () => decide(false));
      button('jodi:yes', LIST.x + bw + 10, by, bw, 'LIKE', () => decide(true));
      this.text(cx, by + 30, `${state.index + 1} / ${JODI_PROFILES.length} near you`, 'phone.lcd.mid', { align: 'center' });
    } else if (state.kind === 'matched') {
      if (this.textures.exists(state.profile.portrait)) this.image(cx - 28, top + 2, state.profile.portrait);
      this.text(cx, top + 70, "IT'S A JODI!", 'phone.lcd.ink', { bold: true, align: 'center' });
      this.text(cx, top + 84, `You and ${state.profile.name.split(',')[0]} liked each other.`, 'phone.lcd.mid', { align: 'center' });
      button('jodi:chat', LIST.x + 20, top + 104, LIST.w - 40, 'OPEN CHAT', () => this.go({ app: 'thread', threadId: 'tanvi' }));
    } else if (state.kind === 'empty') {
      this.text(cx, top + 40, "That's everyone near you.", 'phone.lcd.ink', { bold: true, align: 'center' });
      this.text(cx, top + 54, 'Come back tomorrow.', 'phone.lcd.mid', { align: 'center' });
    }
    if (store.flags.app_settled && !store.flags.jodi_gone) {
      button('jodi:uninstall', LIST.x + 20, APP.nav.y - 40, LIST.w - 40, 'UNINSTALL JODI', () => {
        const s = useGameStore.getState();
        s.setFlag('jodi_deleted', true); s.setFlag('jodi_gone', true);
        this.go({ app: 'home' });
      });
    }
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
