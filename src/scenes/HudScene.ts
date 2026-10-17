import { CARRY_COUNTER, carryText } from '../systems/carry';
import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { QUESTS, getDistrict } from '../data';
import { pressInteract, setAxis } from '../input/InputMap';
import { platform } from '../platform';
import { useGameStore } from '../store';
import { FUEL_COUNTER } from '../systems/StatsManager';
import { settings, useSettings } from '../systems/SettingsManager';
import { DialogueBox, type DialogueBoxCallbacks } from '../ui/DialogueBox';
import { HUD_GLYPHS } from '../ui/hud/glyphs';
import { HUD, TOUCH, hudLayout, hudScale, plateWidth, stickZone, touchLayout, type HudLayout, type StickSize } from '../ui/hud/layout';
import {
  ToastQueue, clockGlyph, clockLabel, locationCard, meters, objectiveLine, objectiveText, promptLabel, stackRows, toastLayout, walletView,
  type InputMode, type Toast,
} from '../ui/hud/viewModel';
import { attachGamepad, PAD, STICK_DEAD, walkAxis } from '../ui/kit/gamepad';
import { ICONS } from '../ui/kit/icons';
import { blockRow, hudPlate, labelCard, speechBubble, tapZone, type UiState } from '../ui/kit/molecules';
import { bake, pxText, pxTextShadow } from '../ui/kit/phaser';
import { bitmap, bitmapHeight, bitmapWidth, roundRect, ring, type PixelCtx } from '../ui/kit/pixel';
import { measure } from '../ui/kit/text';
import { hex, motion, rgba, type TokenName } from '../ui/tokens';
import { GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import type { MenuScene } from './MenuScene';
import type { WorldScene } from './WorldScene';

export interface HudSceneData {
  /** First time in this district: the location card wears NEW. */
  firstVisit?: boolean;
}

/** A touch zone the Test Playground's thumb overlay points at. */
export interface TouchTarget {
  name: string;
  rect: { x: number; y: number; w: number; h: number };
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * HudScene — the in-canvas HUD (P6c, ADR-118; style board §5). Launched by
 * WorldScene above the world, below the phone and the map; hidden while an
 * overlay is open (store.overlay).
 *
 * Fixed layout, contextual content:
 *   top-left   ★ objective (one line, collapses to ★ after 4 s) · location
 *              card with NEW on arrival (5 s) · meters only when they matter
 *   top-right  clock with the sky glyph (tap: pause) · the settings gear
 *              (tap: pause, always shown — also in a minimal HUD) · the phone button
 *              (PhoneScene) · wallet + tick for 3 s after money moves · SAVED
 *   world      a speech-bubble prompt over the NPC in reach ("[E] TALK" / tap)
 *   bottom     one toast at a time (queue), above the dialogue card when up
 *   touch      joystick + context action button (Settings: side, size)
 *
 * Everything static is repainted from state into one texture on change;
 * only the prompt bubble, the joystick knob and the 1px bob move per frame.
 * Larger text (ADR-119) draws the plates at 2× on a 320×180 virtual canvas;
 * the touch controls and the dialogue card stay physical.
 */
export class HudScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.HUD;

  private firstVisit = false;
  private booted = false;
  private pendingDialogue: { id: string; callbacks: DialogueBoxCallbacks } | null = null;
  private dialogue!: DialogueBox;

  private L: HudLayout = HUD;
  private root!: Phaser.GameObjects.Container;
  private chrome!: Phaser.GameObjects.Image;
  private texts!: Phaser.GameObjects.Container;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleKey = '';
  private clockZone: Rect | null = null;
  private gearZone: Rect | null = null;
  private controls: { root: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Image; knob: Phaser.GameObjects.Image; action: Phaser.GameObjects.Container; stick: { cx: number; cy: number; r: number }; actionBox: { x: number; y: number; size: number } } | null = null;
  private actionKey = '';
  private stickPointer: number | null = null;
  private actionPointer: number | null = null;
  private padWalking = false;

  private toasts!: ToastQueue;
  private objective: string | null = null;
  private objectiveUntil = 0;
  private cardUntil = 0;
  private wallet: { moved: number; until: number } | null = null;
  private savedUntil = 0;
  /** A countdown under the clock ("500-D in 1:12"), from `ui:timer`; null = no plate (ADR-123). */
  private timer: string | null = null;
  /** The fuel gauge shows while standing at a bunk, and for a moment after a ride (ADR-126). */
  private fuelUntil = 0;
  private bob = false;
  private refreshTimer: Phaser.Time.TimerEvent | null = null;
  private off: Array<() => void> = [];

  constructor() {
    super(HudScene.KEY);
  }

  create(data: HudSceneData = {}): void {
    this.firstVisit = Boolean(data.firstVisit);
    this.off = [];
    this.stickPointer = null;
    this.actionPointer = null;
    this.padWalking = false;
    this.cameras.main.setRoundPixels(true);
    this.input.addPointer(2); // stick + action at once, plus the phone button

    const now = this.time.now;
    this.toasts = new ToastQueue(motion('m.hud.toast'));
    this.objective = null;
    this.objectiveUntil = 0;
    this.cardUntil = now + motion('m.hud.card.hold');
    this.wallet = null;
    this.savedUntil = 0;
    this.L = hudLayout(hudScale(settings().accessibility.largerText));

    this.chrome = this.add.image(0, 0, bake(this, 'hud:chrome', this.L.W, this.L.H, () => {})).setOrigin(0);
    this.texts = this.add.container(0, 0);
    this.bubble = this.add.container(0, 0).setVisible(false);
    this.root = this.add.container(0, 0, [this.chrome, this.texts, this.bubble]).setScale(this.L.k);
    this.dialogue = new DialogueBox(this);
    if (this.touchMode()) this.buildControls();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('gameout', this.releaseAll, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);

    this.off.push(
      useGameStore.subscribe((s, prev) => {
        if (s.overlay !== prev.overlay) this.setHidden(s.overlay !== null);
        if (s.quests !== prev.quests || s.clock !== prev.clock || s.stats !== prev.stats || s.flags !== prev.flags) this.render();
      }),
      useSettings.subscribe(() => { this.rescale(); this.rebuildControls(); this.render(); }),
      (() => { const h = () => this.rebuildControls(); this.registry.events.on('changedata-touchControls', h); return () => this.registry.events.off('changedata-touchControls', h); })(),
      gameEvents.on('ui:toast', (t) => this.toast(t)),
      gameEvents.on('wallet:spent', ({ amount }) => this.moved(-amount)),
      gameEvents.on('wallet:earned', ({ amount }) => this.moved(amount)),
      gameEvents.on('save:written', () => { this.savedUntil = this.time.now + motion('m.hud.saved'); this.render(); }),
      gameEvents.on('ui:timer', ({ text }) => { if (text !== this.timer) { this.timer = text; this.render(); } }),
      gameEvents.on('ui:carry', () => this.render()),
      gameEvents.on('fuel:show', () => { this.fuelUntil = this.time.now + motion('m.hud.wallet.hold'); this.render(); }),
      // Gamepad while walking: A talks (the dialogue card takes A itself while it is up).
      attachGamepad(this, { button: (b) => { if (b === PAD.A && !this.dialogueOpen && this.root.visible) pressInteract(); } }, () => this.alive),
    );
    if (!platform.display.prefersReducedMotion()) {
      this.time.addEvent({ delay: motion('m.hud.bob'), loop: true, callback: () => { this.bob = !this.bob; } });
    }
    // Both paths out: a scene stop (leaving the district) and a game destroy
    // (the React host unmounting, StrictMode's double mount, a hot reload).
    // A listener left behind would bake into a dead renderer.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

    this.booted = true;
    this.setHidden(useGameStore.getState().overlay !== null);
    this.render();
    if (this.pendingDialogue) { const p = this.pendingDialogue; this.pendingDialogue = null; this.openDialogue(p.id, p.callbacks); }
  }

  private shutdown(): void {
    if (!this.booted && !this.off.length) return; // already torn down by the other path
    this.dialogue?.forceClose();
    this.releaseAll();
    for (const f of this.off) f();
    this.off = [];
    this.refreshTimer?.remove();
    this.refreshTimer = null;
    this.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
    this.booted = false;
    this.pendingDialogue = null;
  }

  /** Alive and drawing: created, not shut down, and the game still has a renderer. */
  private get alive(): boolean {
    return this.booted && Boolean(this.sys?.isActive()) && Boolean(this.game?.renderer);
  }

  // ── Public: what WorldScene asks of the HUD ──────────────────────────────

  /** Run a conversation on the card. Queued if the scene has not finished creating yet (a trigger on frame one). */
  openDialogue(id: string, callbacks: DialogueBoxCallbacks): void {
    if (!this.booted) { this.pendingDialogue = { id, callbacks }; return; }
    this.releaseAll();
    this.dialogue.open(id, callbacks);
    this.render();
  }

  get dialogueOpen(): boolean {
    return this.dialogue?.isOpen ?? false;
  }

  /** Scene-shutdown path for WorldScene: drop the conversation silently. */
  closeDialogue(): void {
    this.pendingDialogue = null;
    this.dialogue?.forceClose();
  }

  /** The touch zones (game px) for the Test Playground's thumb overlay; empty on a keyboard. */
  touchTargets(): TouchTarget[] {
    if (!this.controls) return [];
    const z = stickZone(this.controls.stick);
    const a = tapZone(this.controls.actionBox.x, this.controls.actionBox.y, this.controls.actionBox.size, this.controls.actionBox.size);
    const side = settings().controls.joystickSide;
    return [
      { name: `Joystick (${side} thumb)`, rect: z },
      { name: `A button (${side === 'left' ? 'right' : 'left'} thumb)`, rect: a },
    ];
  }

  // ── State ────────────────────────────────────────────────────────────────

  private world(): WorldScene | null {
    return this.scene.isActive(SCENE_KEYS.WORLD) || this.scene.isPaused(SCENE_KEYS.WORLD) ? (this.scene.get(SCENE_KEYS.WORLD) as WorldScene) : null;
  }

  private touchMode(): boolean {
    return this.registry.get('touchControls') === 'always' || platform.input.coarsePointer();
  }

  private inputMode(): InputMode {
    return this.touchMode() ? 'touch' : 'keys';
  }

  /** Larger text toggled: new virtual canvas, redraw everything. */
  private rescale(): void {
    const k = hudScale(settings().accessibility.largerText);
    if (k === this.L.k) return;
    this.L = hudLayout(k);
    this.root.setScale(k);
    this.bubbleKey = '';
  }

  private setHidden(hidden: boolean): void {
    this.root.setVisible(!hidden);
    this.controls?.root.setVisible(!hidden && !this.dialogueOpen);
    if (hidden) this.releaseAll();
    else this.render(); // toasts waited while an overlay was up
  }

  private toast(t: Toast): void {
    this.toasts.push(t);
    this.render();
  }

  private moved(amount: number): void {
    this.wallet = { moved: amount, until: this.time.now + motion('m.hud.wallet.hold') };
    this.render();
  }

  // ── Render: plates + their text, from state ──────────────────────────────

  private render(): void {
    if (!this.alive) return;
    const L = this.L;
    const now = this.time.now;
    const store = useGameStore.getState();
    const prefs = settings();

    // Someone else's life (Ravi in the corridor, ADR-138): only the objective — no clock, wallet or meters of yours.
    const minimal = store.activeDistrict !== null && getDistrict(store.activeDistrict).hud === 'minimal';
    const line = objectiveLine(store.quests, QUESTS);
    if (line !== this.objective) { this.objective = line; this.objectiveUntil = now + motion('m.hud.objective.hold'); }
    const expanded = this.objective !== null && (!prefs.hud.objectiveAutoHide || now < this.objectiveUntil);
    const showCard = now < this.cardUntil && store.activeDistrict !== null;
    const fuelShown = store.flags.scooter_owned && (store.fuelContext || now < this.fuelUntil);
    const meterList = minimal ? [] : meters(store.stats, prefs.hud.meters as 'auto' | 'always', fuelShown ? (store.counters[FUEL_COUNTER] ?? 0) : null);
    const rows = stackRows({ objective: this.objective !== null, location: showCard, meters: meterList });
    const card = showCard ? locationCard(getDistrict(store.activeDistrict!).name, this.firstVisit, L.locationMaxTextW) : null;
    const objective = this.objective !== null ? objectiveText(this.objective, L.objective.maxTextW) : '';
    const clockText = clockLabel(store.clock);
    const sky = HUD_GLYPHS[clockGlyph(store.clock.minute)];
    const clockW = plateWidth(measure(clockText, true), bitmapWidth(sky));
    const clockX = L.right - clockW;
    this.clockZone = tapZone(clockX * L.k, L.pad * L.k, clockW * L.k, L.plateH * L.k);
    const gear = L.settingsButton;
    this.gearZone = tapZone(gear.x * L.k, gear.y * L.k, gear.size * L.k, gear.size * L.k);
    // The timer plate (a bus countdown) sits under the clock; the wallet moves down a row while it is up.
    // Boxes carried share the plate under the clock with a ride's countdown (story 2.4).
    const timer = [this.timer, carryText(store.counters[CARRY_COUNTER] ?? 0)].filter(Boolean).join(' · ') || null;
    const timerW = timer ? plateWidth(measure(timer, true), bitmapWidth(ICONS.bus)) : 0;
    const timerX = L.right - timerW;
    const timerY = L.pad + L.plateH + L.stackGap;
    const walletY = timer ? timerY + L.plateH + L.stackGap : L.pad + L.plateH + L.stackGap;
    const walletUp = !minimal && ((this.wallet && now < this.wallet.until) || prefs.hud.meters === 'always');
    const wallet = walletUp ? walletView(store.stats.wallet, this.wallet && now < this.wallet.until ? this.wallet.moved : null) : null;
    const walletW = wallet ? 6 + measure(wallet.balance, true) + (wallet.tick ? 8 + measure(wallet.tick.text, true) : 0) + 7 : 0;
    const walletX = L.right - walletW;
    const saved = now < this.savedUntil;
    const savedW = plateWidth(measure('SAVED', true), bitmapWidth(HUD_GLYPHS.saved));
    const savedX = L.W - L.pad - savedW;
    // Toasts wait while an overlay hides the HUD: they only advance when visible.
    const toast = this.root.visible ? this.toasts.tick(now) : null;
    const tl = toast ? toastLayout(toast, L.toast.maxTextW) : null;
    const dialogueTop = this.dialogue?.top ?? null;
    const toastX = tl ? Math.round(L.toast.cx - tl.w / 2) : 0;
    const toastY = tl ? (dialogueTop !== null ? Math.floor(dialogueTop / L.k) - 7 - tl.h - L.toast.gapAboveDialogue : Math.round(L.toast.cy - tl.h / 2)) : 0;

    bake(this, 'hud:chrome', L.W, L.H, (g) => {
      for (const row of rows) {
        if (row.kind === 'objective') {
          const w = expanded ? plateWidth(measure(objective), 7) : plateWidth(0, 7) - 5;
          hudPlate(g, L.pad, row.y, w, L.plateH);
          bitmap(g, HUD_GLYPHS.star, L.pad + 6, row.y + 6, hex('hud.star'));
        } else if (row.kind === 'location' && card) {
          const tw = measure(card.name, true);
          const w = 7 + tw + (card.isNew ? 6 + 25 + 3 : 8);
          labelCard(g, L.pad, row.y, w, L.plateH);
          if (card.isNew) roundRect(g, L.pad + 7 + tw + 6, row.y + 4, 25, 11, 2, hex('hud.star'));
        } else if (row.kind === 'meter' && row.meter) {
          const tone: TokenName = row.meter.critical ? 'phone.accent.alert' : 'hud.text';
          hudPlate(g, L.pad, row.y, L.meter.w, L.meter.h);
          bitmap(g, HUD_GLYPHS[row.meter.icon], L.pad + L.meter.iconX, row.y + 4, hex(tone));
          blockRow(g, L.pad + L.meter.blocksX, row.y + 5, row.meter.blocks, 5, { on: tone });
        }
      }
      // The settings gear: the phone button's plate, its icon centred (always up — the one visible way to pause on touch).
      hudPlate(g, gear.x, gear.y, gear.size, gear.size, 'default', 4);
      bitmap(g, ICONS.settings, gear.x + Math.round((gear.size - bitmapWidth(ICONS.settings)) / 2), gear.y + Math.round((gear.size - bitmapHeight(ICONS.settings)) / 2), hex('hud.text'));
      if (!minimal) {
        hudPlate(g, clockX, L.pad, clockW, L.plateH);
        bitmap(g, sky, clockX + 6, L.pad + 6, hex('hud.star'));
      }
      if (timer) {
        hudPlate(g, timerX, timerY, timerW, L.plateH);
        bitmap(g, ICONS.bus, timerX + 6, timerY + 5, hex('hud.star'));
      }
      if (wallet) hudPlate(g, walletX, walletY, walletW, L.plateH);
      if (saved) {
        hudPlate(g, savedX, L.saved.y, savedW, L.plateH);
        bitmap(g, HUD_GLYPHS.saved, savedX + 6, L.saved.y + 6, hex('hud.text'));
      }
      if (tl && toast) {
        hudPlate(g, toastX, toastY, tl.w, tl.h, 'default', 4);
        if (toast.icon) {
          const rows = ICONS[toast.icon];
          bitmap(g, rows, toastX + 6, toastY + Math.round((tl.h - bitmapHeight(rows)) / 2), hex('hud.text'));
        }
      }
    }, true);
    this.chrome.setTexture('hud:chrome');

    this.texts.removeAll(true);
    const add = (objs: Phaser.GameObjects.GameObject[]) => this.texts.add(objs);
    for (const row of rows) {
      if (row.kind === 'objective' && expanded) add(pxTextShadow(this, L.pad + 6 + 7 + 5, row.y + 6, objective));
      if (row.kind === 'location' && card) {
        add([pxText(this, L.pad + 7, row.y + 6, card.name, { bold: true })]);
        if (card.isNew) add([pxText(this, L.pad + 7 + measure(card.name, true) + 6 + 13, row.y + 6, 'NEW', { bold: true, tint: 'hud.plate', align: 'center' })]);
      }
    }
    if (!minimal) add(pxTextShadow(this, clockX + 6 + bitmapWidth(sky) + 5, L.pad + 6, clockText, { bold: true }));
    if (timer) add(pxTextShadow(this, timerX + 6 + bitmapWidth(ICONS.bus) + 5, timerY + 6, timer, { bold: true }));
    if (wallet) {
      const y = walletY + 6;
      add(pxTextShadow(this, walletX + 6, y, wallet.balance, { bold: true }));
      if (wallet.tick) add(pxTextShadow(this, L.right - 7, y, wallet.tick.text, { bold: true, tint: wallet.tick.tone, align: 'right' }));
    }
    if (saved) add([pxText(this, savedX + 6 + bitmapWidth(HUD_GLYPHS.saved) + 5, L.saved.y + 6, 'SAVED', { bold: true })]);
    if (tl && toast) {
      const tx = toastX + 6 + (toast.icon ? 20 : 0);
      tl.lines.forEach((l, i) => add(pxTextShadow(this, tx, toastY + 6 + i * 12, l)));
    }

    this.scheduleRefresh(now);
  }

  /** One timer for the next plate that leaves (objective collapse, card, wallet, SAVED, toast). */
  private scheduleRefresh(now: number): void {
    const deadlines = [this.objectiveUntil, this.cardUntil, this.wallet?.until ?? 0, this.savedUntil, this.fuelUntil, this.toasts.nextChange() ?? 0].filter((t) => t > now);
    this.refreshTimer?.remove();
    this.refreshTimer = null;
    if (!deadlines.length) return;
    this.refreshTimer = this.time.delayedCall(Math.min(...deadlines) - now + 1, () => this.render());
  }

  // ── Per frame: prompt bubble, joystick, gamepad walk, action label ───────

  update(): void {
    if (!this.alive || !this.root.visible) return;
    const world = this.world();
    const near = world && !this.dialogueOpen ? world.nearestInteractable() : null;
    this.placeBubble(world, near?.x ?? 0, near?.y ?? 0, near?.verb ?? null);
    if (this.controls) {
      this.controls.root.setVisible(!this.dialogueOpen);
      this.renderAction(near?.verb ?? null);
    }
    this.walkWithPad();
  }

  /** The left stick walks when no finger is on the on-screen stick. */
  private walkWithPad(): void {
    if (this.stickPointer !== null || this.dialogueOpen) return;
    const axis = walkAxis(this);
    if (!axis) return;
    const pushed = Math.hypot(axis.x, axis.y) >= STICK_DEAD * 0.6;
    if (pushed) { setAxis(axis.x, axis.y); this.padWalking = true; }
    else if (this.padWalking) { setAxis(0, 0); this.padWalking = false; }
  }

  private placeBubble(world: WorldScene | null, wx: number, wy: number, verb: string | null): void {
    if (!world || !verb) { this.bubble.setVisible(false); return; }
    const L = this.L;
    const mode = this.inputMode();
    const label = promptLabel(verb, mode);
    const key = `${mode}:${label}`;
    if (key !== this.bubbleKey) {
      this.bubbleKey = key;
      this.bubble.removeAll(true);
      const tapW = mode === 'touch' ? bitmapWidth(HUD_GLYPHS.tap) + 3 : 0;
      const w = 6 + tapW + measure(label, true) + 7;
      const h = L.prompt.h + L.prompt.tailH;
      const tex = bake(this, `hud:bubble:${key}`, w, h + 1, (g) => {
        speechBubble(g, 0, 0, w, L.prompt.h);
        if (mode === 'touch') bitmap(g, HUD_GLYPHS.tap, 6, 4, hex('hud.text'));
      });
      this.bubble.add(this.add.image(0, 0, tex).setOrigin(0));
      this.bubble.add(pxText(this, 6 + tapW, 5, label, { bold: true }));
      this.bubble.setData('w', w);
    }
    const cam = world.cameras.main;
    const w = this.bubble.getData('w') as number;
    const x = Phaser.Math.Clamp(Math.round((wx - cam.scrollX) / L.k - w / 2), 2, L.W - w - 2);
    const y = Math.max(2, Math.round((wy - cam.scrollY) / L.k) - L.prompt.h - L.prompt.tailH - L.prompt.lift - (this.bob ? 1 : 0));
    this.bubble.setPosition(x, y).setVisible(true);
  }

  // ── Touch controls (physical, never scaled) ──────────────────────────────

  private buildControls(): void {
    const prefs = settings().controls;
    const { stick, action } = touchLayout(prefs.joystickSide as 'left' | 'right', prefs.joystickSize as StickSize);
    const d = stick.r * 2;
    const ringTex = bake(this, `hud:stick:${stick.r}`, d, d, (g) => {
      roundRect(g, 0, 0, d, d, stick.r, rgba('hud.plate', 0.35));
      ring(g, 0, 0, d, d, stick.r, 2, hex('hud.border'));
    });
    const k = TOUCH.stick.knob * 2;
    const knobTex = bake(this, 'hud:knob', k, k, (g) => roundRect(g, 0, 0, k, k, TOUCH.stick.knob, rgba('hud.text', 0.55)));
    const ringImg = this.add.image(stick.cx, stick.cy, ringTex);
    const knob = this.add.image(stick.cx, stick.cy, knobTex);
    const actionRoot = this.add.container(action.x, action.y);
    const root = this.add.container(0, 0, [ringImg, knob, actionRoot]);
    this.controls = { root, ring: ringImg, knob, action: actionRoot, stick, actionBox: action };
    this.actionKey = '';
    this.renderAction(null);
  }

  /** Settings (side, size) or the input mode changed: controls come back as they should be now, or go away. */
  private rebuildControls(): void {
    if (!this.alive) return;
    this.releaseAll();
    this.controls?.root.destroy(true);
    this.controls = null;
    this.bubbleKey = ''; // the prompt's label follows the input mode
    if (this.touchMode()) this.buildControls();
  }

  /** The context action button reads the prompt's verb; empty and disabled when nothing is in reach. */
  private renderAction(verb: string | null): void {
    if (!this.controls) return;
    const state: UiState = this.actionPointer !== null ? 'pressed' : verb ? 'default' : 'disabled';
    const key = `${state}:${verb ?? ''}`;
    if (key === this.actionKey) return;
    this.actionKey = key;
    const s = this.controls.actionBox.size;
    const tex = bake(this, `hud:action:${state}`, s, s + 1, (g: PixelCtx) => { hudPlate(g, 0, 0, s, s, state, 12); });
    this.controls.action.removeAll(true);
    this.controls.action.add(this.add.image(0, 0, tex).setOrigin(0));
    if (verb) this.controls.action.add(pxText(this, s / 2, Math.round(s / 2) - 3 + (state === 'pressed' ? 1 : 0), verb, { bold: true, tint: state === 'pressed' ? 'hud.plate' : 'hud.text', align: 'center' }));
  }

  private inZone(p: Phaser.Input.Pointer, z: Rect): boolean {
    return p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.root.visible || this.dialogueOpen) return;
    // The gear (and the clock plate, ADR-119) are the touch ways into the pause menu; the phone button keeps its own corner.
    if (this.gearZone && this.inZone(p, this.gearZone)) {
      (this.scene.get(SCENE_KEYS.MENU) as MenuScene | null)?.open();
      return;
    }
    if (this.clockZone && this.inZone(p, this.clockZone) && p.x < GAME_WIDTH - 44) {
      (this.scene.get(SCENE_KEYS.MENU) as MenuScene | null)?.open();
      return;
    }
    if (!this.controls) return;
    const c = this.controls;
    if (this.stickPointer === null && this.inZone(p, stickZone(c.stick))) {
      this.stickPointer = p.id;
      this.moveStick(p);
      return;
    }
    const a = tapZone(c.actionBox.x, c.actionBox.y, c.actionBox.size, c.actionBox.size);
    if (this.actionPointer === null && this.inZone(p, a)) {
      this.actionPointer = p.id;
      if (settings().controls.haptics) platform.haptics.tap();
      pressInteract();
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickPointer) this.moveStick(p);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickPointer) this.releaseStick();
    if (p.id === this.actionPointer) this.actionPointer = null;
  }

  private moveStick(p: Phaser.Input.Pointer): void {
    if (!this.controls) return;
    const { cx, cy, r } = this.controls.stick;
    let dx = p.x - cx, dy = p.y - cy;
    const max = r - TOUCH.stick.knob / 2;
    const dist = Math.hypot(dx, dy);
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    this.controls.knob.setPosition(Math.round(cx + dx), Math.round(cy + dy));
    setAxis(dx / max, dy / max);
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.controls?.knob.setPosition(this.controls.stick.cx, this.controls.stick.cy);
    setAxis(0, 0);
  }

  /** A finger that leaves the canvas, a tab that loses focus, an overlay opening: the stick must never stay pushed. */
  private releaseAll(): void {
    this.releaseStick();
    this.actionPointer = null;
    if (this.padWalking) { setAxis(0, 0); this.padWalking = false; }
  }
}

export default HudScene;
