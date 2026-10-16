import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { applyDisplaySettings } from '../core/display';
import { SETTINGS_MENU } from '../data';
import { platform } from '../platform';
import { useGameStore } from '../store';
import { SaveManager, type SlotId } from '../systems/SaveManager';
import { settings, useSettings, type Settings } from '../systems/SettingsManager';
import { hudScale } from '../ui/hud/layout';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import type { Direction } from '../ui/kit/focus';
import { choicePill, hudPlate, labelCard, blockRow, type UiState } from '../ui/kit/molecules';
import { bake, pxText, pxTextShadow } from '../ui/kit/phaser';
import { bitmap } from '../ui/kit/pixel';
import { measure, truncate, wrap } from '../ui/kit/text';
import { color, hex } from '../ui/tokens';
import { inRect, menuLayout, rowAt, rowBand, scrollFor, visibleRows, zone, type MenuLayout } from '../ui/menu/layout';
import {
  aboutLines, coerceLike, hintLine, pauseRows, readSetting, sectionRows, settingRows, slotConfirm, slotRows, stepValue,
  type InputHint, type MenuMode, type PauseAction, type RowView,
} from '../ui/menu/viewModel';
import { DEPTH, SCENE_KEYS } from '../utils/constants';
import type { SettingsMenuRow, SettingsMenuSection } from '../utils/types';
import type { MapScene } from './MapScene';
import type { TitleScene } from './TitleScene';
import type { WorldScene } from './WorldScene';

type Screen =
  | { id: 'pause' }
  | { id: 'settings' }
  | { id: 'section'; section: SettingsMenuSection }
  | { id: 'slots'; purpose: 'save' | 'load' | 'delete' }
  | { id: 'about' }
  | { id: 'confirm'; text: string; yes: () => void; destructive: boolean };

export interface MenuOpenOptions {
  mode?: MenuMode;
  /** Land on a screen other than the pause list (the phone's Settings app, the title's Load Game). */
  screen?: 'settings' | 'load';
  /** Another overlay (the phone) already paused the world and handed over. */
  fromOverlay?: boolean;
}

const CURSOR = ['#..', '##.', '###', '##.', '#..'];
const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/**
 * MenuScene — pause, settings, save, load, confirm dialogs and about (P6d,
 * ADR-119; settings_and_saveload §1–3). One scene, started by BootScene and
 * never stopped: it opens over a paused WorldScene (Esc, START, Android back,
 * the app going to the background, a tap on the HUD's clock, the phone's
 * Settings app) or over the TitleScene (Load Game, Settings).
 *
 * Every screen is a list of label cards; the chosen one inverts with a ▶.
 * Settings rows come from data/menus/settings.json and edit one atom each,
 * live. Draws at the HUD scale (Larger text = 2×). Keyboard, gamepad and
 * touch all drive the same list.
 */
export class MenuScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.MENU;

  private phase: 'closed' | 'open' = 'closed';
  private mode: MenuMode = 'world';
  private stack: Screen[] = [];
  private selected = 0;
  private scroll = 0;
  private lastInput: InputHint = 'keys';
  private L: MenuLayout = menuLayout(1);

  private dim!: Phaser.GameObjects.Rectangle;
  private root!: Phaser.GameObjects.Container;
  private chrome!: Phaser.GameObjects.Image;
  private texts!: Phaser.GameObjects.Container;
  private rows: RowView[] = [];
  private worldFx: Phaser.FX.ColorMatrix | null = null;
  private off: Array<() => void> = [];

  constructor() {
    super(MenuScene.KEY);
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    this.dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, color('hud.plate'), 0.55).setOrigin(0).setVisible(false).setDepth(DEPTH.UI);
    this.chrome = this.add.image(0, 0, bake(this, 'menu:chrome', 1, 1, () => {})).setOrigin(0);
    this.texts = this.add.container(0, 0);
    this.root = this.add.container(0, 0, [this.chrome, this.texts]).setVisible(false).setDepth(DEPTH.UI + 1);

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onPointer, this);
    this.off.push(
      attachGamepad(this, {
        button: (b) => this.onPad(b),
        dir: (d) => { this.lastInput = 'pad'; if (this.phase === 'open') this.move(d); },
      }),
      platform.lifecycle.onBackButton(() => { if (this.phase === 'open') this.back(); else this.open(); }),
      // Backgrounded: autosave and sit on the pause menu (mobile foundation rule 11).
      platform.lifecycle.onPause(() => { if (this.phase === 'closed' && this.world()) this.open(); }),
      useSettings.subscribe(() => { if (this.phase === 'open') this.render(); }),
    );
    const teardown = () => {
      for (const f of this.off) f();
      this.off = [];
      this.input.keyboard?.off('keydown', this.onKey, this);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  // ── Open / close ─────────────────────────────────────────────────────────

  private world(): WorldScene | null {
    return this.scene.isActive(SCENE_KEYS.WORLD) || this.scene.isPaused(SCENE_KEYS.WORLD) ? (this.scene.get(SCENE_KEYS.WORLD) as WorldScene) : null;
  }

  private title(): TitleScene | null {
    return this.scene.isActive(SCENE_KEYS.TITLE) ? (this.scene.get(SCENE_KEYS.TITLE) as TitleScene) : null;
  }

  get isOpen(): boolean {
    return this.phase === 'open';
  }

  open(opts: MenuOpenOptions = {}): void {
    if (this.phase !== 'closed') return;
    const world = this.world();
    const mode: MenuMode = opts.mode ?? (world ? 'world' : 'title');
    if (mode === 'world') {
      if (!world) return;
      if (!opts.fromOverlay && !world.canOpenOverlay()) return;
      if (!this.scene.isPaused(SCENE_KEYS.WORLD)) this.scene.pause(SCENE_KEYS.WORLD);
      // Pausing is an autosave moment (settings_and_saveload §2; background = rule 11).
      world.saveNow();
      const fx = world.cameras.main.postFX?.addColorMatrix();
      if (fx) { fx.saturate(-0.5); fx.brightness(0.7, true); this.worldFx = fx; }
    } else if (!this.title() && useGameStore.getState().activeScene !== SCENE_KEYS.TITLE) {
      return;
    }
    this.mode = mode;
    this.phase = 'open';
    useGameStore.getState().setOverlay('menu');
    this.scene.bringToTop(SCENE_KEYS.MENU);
    this.scene.bringToTop(SCENE_KEYS.ORIENTATION);
    this.stack = mode === 'world' || !opts.screen ? [{ id: 'pause' }] : [];
    if (opts.screen === 'settings') this.stack.push({ id: 'settings' });
    if (opts.screen === 'load') this.stack.push({ id: 'slots', purpose: 'load' });
    if (!this.stack.length) this.stack.push({ id: 'pause' });
    this.selected = 0;
    this.scroll = 0;
    if (settings().controls.haptics) platform.haptics.impact('light');
    this.dim.setVisible(true);
    this.root.setVisible(true);
    this.render();
  }

  close(): void {
    if (this.phase !== 'open') return;
    this.phase = 'closed';
    this.stack = [];
    this.dim.setVisible(false);
    this.root.setVisible(false);
    this.texts.removeAll(true);
    const world = this.world();
    if (this.worldFx && world) world.cameras.main.postFX?.clear();
    this.worldFx = null;
    useGameStore.getState().setOverlay(null);
    if (this.mode === 'world' && world && this.scene.isPaused(SCENE_KEYS.WORLD)) world.overlayClosed();
  }

  // ── Screens ──────────────────────────────────────────────────────────────

  private get screen(): Screen {
    return this.stack[this.stack.length - 1];
  }

  private push(s: Screen): void {
    this.stack.push(s);
    this.selected = s.id === 'confirm' ? (s.destructive ? 1 : 0) : 0;
    this.scroll = 0;
    this.render();
  }

  private back(): void {
    if (this.stack.length <= 1) { this.close(); return; }
    this.stack.pop();
    this.selected = 0;
    this.scroll = 0;
    this.render();
  }

  private rowsFor(s: Screen): RowView[] {
    switch (s.id) {
      case 'pause': return pauseRows(this.mode);
      case 'settings': return sectionRows(SETTINGS_MENU);
      case 'section': return settingRows(s.section, settings());
      case 'slots': return slotRows(SaveManager.getInstance().summaries(), s.purpose);
      case 'about': return [];
      case 'confirm': return [{ id: 'yes', label: 'YES', kind: 'item' }, { id: 'no', label: 'NO', kind: 'item' }];
    }
  }

  private titleFor(s: Screen): string {
    switch (s.id) {
      case 'pause': return this.mode === 'world' ? 'PAUSED' : 'BANGALORE TIMES';
      case 'settings': return 'SETTINGS';
      case 'section': return s.section.title;
      case 'slots': return s.purpose === 'save' ? 'SAVE' : s.purpose === 'load' ? 'LOAD' : 'DELETE A SAVE';
      case 'about': return 'ABOUT';
      case 'confirm': return 'ARE YOU SURE?';
    }
  }

  private activate(): void {
    const s = this.screen;
    const row = this.rows[this.selected];
    if (s.id === 'confirm') { if (this.selected === 0) s.yes(); else this.back(); return; }
    if (s.id === 'about') { this.back(); return; }
    if (!row || row.disabled || row.kind === 'note') return;
    if (settings().controls.haptics) platform.haptics.tap();
    switch (s.id) {
      case 'pause': return this.pauseAction(row.id as PauseAction);
      case 'settings': {
        const section = SETTINGS_MENU.sections.find((x) => x.id === row.id);
        if (section) this.push({ id: 'section', section });
        return;
      }
      case 'section': {
        const def = s.section.rows[Number(row.id.split(':')[1])];
        if (def.kind === 'action') return this.settingsAction(def.action);
        this.adjust(1);
        return;
      }
      case 'slots': return this.slotAction(s.purpose, row.id as SlotId);
    }
  }

  private pauseAction(action: PauseAction): void {
    switch (action) {
      case 'resume': this.close(); return;
      case 'settings': this.push({ id: 'settings' }); return;
      case 'save': this.push({ id: 'slots', purpose: 'save' }); return;
      case 'load': this.push({ id: 'slots', purpose: 'load' }); return;
      case 'map': this.handToMap(); return;
      case 'quit':
        this.push({ id: 'confirm', text: 'Quit to the title? The autosave is kept.', destructive: true, yes: () => this.quitToTitle() });
        return;
    }
  }

  private settingsAction(action: 'resetSettings' | 'deleteSave' | 'about'): void {
    if (action === 'about') { this.push({ id: 'about' }); return; }
    if (action === 'deleteSave') { this.push({ id: 'slots', purpose: 'delete' }); return; }
    this.push({ id: 'confirm', text: 'Reset every setting to its default?', destructive: true, yes: () => { useSettings.getState().reset(); this.applyDisplay(); this.back(); } });
  }

  private slotAction(purpose: 'save' | 'load' | 'delete', slot: SlotId): void {
    const summaries = SaveManager.getInstance().summaries();
    const summary = summaries.find((x) => x.slot === slot);
    const run = () => {
      if (purpose === 'save') {
        const world = this.world();
        if (!world) return;
        SaveManager.getInstance().save(world.savePosition(), slot);
        gameEvents.emit('ui:toast', { text: `Saved to ${slot === 'autosave' ? 'the autosave' : `slot ${slot.replace('slot', '')}`}.` });
        this.close();
      } else if (purpose === 'delete') {
        SaveManager.getInstance().clear(slot);
        this.back();
      } else {
        this.loadSlot(slot);
      }
    };
    const question = purpose === 'save' && summary?.empty ? null : slotConfirm(purpose, slot, this.mode);
    if (question) this.push({ id: 'confirm', text: question, destructive: purpose !== 'load', yes: run });
    else run();
  }

  /** Load a slot: hydrate the store and restart the world at the saved spot — from play or from the title. */
  private loadSlot(slot: SlotId): void {
    const sm = SaveManager.getInstance();
    const data = sm.load(slot);
    if (!data || !sm.restore(slot)) return;
    const { districtId, x, y } = data.player.position;
    const title = this.title();
    this.close();
    if (this.mode === 'title' && title) { title.startWorldAt({ districtId, x, y }); return; }
    this.scene.stop(SCENE_KEYS.WORLD);
    this.scene.start(SCENE_KEYS.WORLD, { districtId, x, y });
  }

  private quitToTitle(): void {
    this.close();
    // WorldScene's shutdown autosaves and stops its overlays; the title comes up after.
    this.scene.stop(SCENE_KEYS.WORLD);
    this.scene.start(SCENE_KEYS.TITLE);
  }

  /** Pause → Map: the map takes over the pause (ADR-113), like the phone's Maps app. */
  private handToMap(): void {
    const map = this.scene.get(SCENE_KEYS.MAP) as MapScene | null;
    if (!map || !this.scene.isActive(SCENE_KEYS.MAP)) return;
    this.phase = 'closed';
    this.stack = [];
    this.dim.setVisible(false);
    this.root.setVisible(false);
    this.texts.removeAll(true);
    const world = this.world();
    if (this.worldFx && world) world.cameras.main.postFX?.clear();
    this.worldFx = null;
    useGameStore.getState().setOverlay(null);
    map.open(true);
  }

  /** ◀ ▶ on a settings row: step the atom and persist. */
  private adjust(dir: -1 | 1): void {
    const s = this.screen;
    if (s.id === 'confirm') { this.selected = this.selected === 0 ? 1 : 0; this.render(); return; }
    if (s.id !== 'section') return;
    const row = this.rows[this.selected];
    if (!row || row.kind === 'note' || row.kind === 'action') return;
    const def = s.section.rows[Number(row.id.split(':')[1])] as Extract<SettingsMenuRow, { setting: string }>;
    const [section, key] = def.setting.split('.') as [keyof Settings, string];
    const current = readSetting(settings(), def.setting);
    const sample = readSetting(useSettings.getState().settings, def.setting);
    const next = coerceLike(sample, stepValue(def, current, dir));
    (useSettings.getState().set as (s: string, k: string, v: unknown) => void)(section, key, next);
    if (section === 'display') this.applyDisplay();
    this.render();
  }

  private applyDisplay(): void {
    applyDisplaySettings(this.game, settings().display);
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onKey(ev: KeyboardEvent): void {
    this.lastInput = 'keys';
    if (this.phase === 'closed') {
      if (ev.code === 'Escape' && useGameStore.getState().overlay === null && this.world()) this.open();
      return;
    }
    switch (ev.code) {
      case 'Escape': case 'Backspace': this.back(); return;
      case 'Enter': case 'Space': case 'KeyE': this.activate(); return;
      case 'ArrowUp': case 'KeyW': this.move('up'); return;
      case 'ArrowDown': case 'KeyS': this.move('down'); return;
      case 'ArrowLeft': case 'KeyA': this.move('left'); return;
      case 'ArrowRight': case 'KeyD': this.move('right'); return;
    }
  }

  private onPad(button: number): void {
    this.lastInput = 'pad';
    if (this.phase === 'closed') {
      if (button === PAD.START && useGameStore.getState().overlay === null && this.world()) this.open();
      return;
    }
    if (button === PAD.A) this.activate();
    else if (button === PAD.B) this.back();
    else if (button === PAD.START) this.close();
  }

  private move(dir: Direction): void {
    const s = this.screen;
    if (s.id === 'confirm') { if (dir === 'left' || dir === 'right') this.adjust(dir === 'left' ? -1 : 1); return; }
    if (dir === 'left' || dir === 'right') { this.adjust(dir === 'left' ? -1 : 1); return; }
    const n = this.rows.length;
    if (!n) return;
    // Skip notes: they are not selectable.
    let i = this.selected;
    for (let step = 0; step < n; step++) {
      i = Phaser.Math.Wrap(i + (dir === 'up' ? -1 : 1), 0, n);
      if (this.rows[i].kind !== 'note') break;
    }
    this.selected = i;
    this.render();
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'open') return;
    this.lastInput = 'touch';
    const L = this.L;
    const v = { x: p.x / L.k, y: p.y / L.k };
    const s = this.screen;
    if (inRect(v, zone(L, L.back))) { this.back(); return; }
    if (s.id === 'confirm') {
      const pills = this.confirmPills();
      const hit = pills.findIndex((r) => inRect(v, zone(L, r)));
      if (hit >= 0) { this.selected = hit; this.activate(); }
      return;
    }
    if (s.id === 'about') return;
    const pitch = s.id === 'slots' ? L.slot.pitch : L.rows.pitch;
    const i = rowAt(L, this.rows.length, this.scroll, pitch, v.x, v.y);
    if (i === null || this.rows[i].kind === 'note') return;
    this.selected = i;
    if (this.rows[i].kind === 'slider') {
      // Left half steps down, right half steps up.
      this.adjust(v.x < L.rows.x + L.rows.w / 2 ? -1 : 1);
      return;
    }
    this.render();
    this.activate();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private confirmPills(): Array<{ x: number; y: number; w: number; h: number }> {
    const L = this.L;
    const cx = L.W / 2, top = Math.round((L.H - L.confirm.h) / 2);
    const yesW = measure('YES', true) + 22, noW = measure('NO', true) + 22;
    const y = top + L.confirm.h - 17 - 8;
    return [
      { x: Math.round(cx - yesW - 6), y, w: yesW, h: 17 },
      { x: Math.round(cx + 6), y, w: noW, h: 17 },
    ];
  }

  private render(): void {
    if (this.phase !== 'open') return;
    const k = hudScale(settings().accessibility.largerText);
    this.L = menuLayout(k);
    const L = this.L;
    this.root.setScale(k);
    const s = this.screen;
    this.rows = this.rowsFor(s);
    const pitch = s.id === 'slots' ? L.slot.pitch : L.rows.pitch;
    const rowH = s.id === 'slots' ? L.slot.h : L.rows.h;
    const visible = visibleRows(L, pitch);
    if (this.selected >= this.rows.length) this.selected = Math.max(0, this.rows.length - 1);
    // Notes are read, not chosen: the cursor starts on the first real row.
    if (this.rows[this.selected]?.kind === 'note') { const i = this.rows.findIndex((r) => r.kind !== 'note'); if (i >= 0) this.selected = i; }
    this.scroll = scrollFor(this.selected, this.scroll, visible);
    const shown = this.rows.slice(this.scroll, this.scroll + visible);
    const title = this.titleFor(s);
    const titleW = 7 + measure(title, true) + 8;
    const confirm = s.id === 'confirm' ? s : null;
    const about = s.id === 'about' ? aboutLines(VERSION) : null;
    const pills = this.confirmPills();
    const cTop = Math.round((L.H - L.confirm.h) / 2), cX = Math.round((L.W - L.confirm.w) / 2);

    bake(this, 'menu:chrome', L.W, L.H, (g) => {
      labelCard(g, L.title.x, L.title.y, titleW, L.title.h, 'focus');
      // BACK plate (top-right) — on the pause list it reads RESUME / CLOSE.
      hudPlate(g, L.back.x, L.back.y, L.back.w, L.back.h);
      if (confirm) {
        hudPlate(g, cX, cTop, L.confirm.w, L.confirm.h, 'default', 4);
        pills.forEach((r, i) => choicePill(g, r.x, r.y, r.w, i === this.selected ? 'focus' : 'default'));
        return;
      }
      if (about) {
        hudPlate(g, L.rows.x, L.rows.y, L.rows.w + 36, about.length * 12 + 16, 'default', 4);
        return;
      }
      shown.forEach((row, j) => {
        const i = j + this.scroll;
        const b = rowBand(L, i, this.scroll, pitch, rowH);
        if (row.kind === 'note') return;
        const state: UiState = row.disabled ? 'disabled' : i === this.selected ? 'focus' : 'default';
        labelCard(g, b.x, b.y, L.rows.w, rowH, state);
        if (i === this.selected && !row.disabled) bitmap(g, CURSOR, b.x + 6, b.y + 6, hex('hud.plate'));
        if (row.kind === 'slider' && row.blocks !== undefined) {
          const bx = b.x + L.rows.w - 8 - measure(row.value ?? '', true) - 6 - 68;
          blockRow(g, bx, b.y + 7, row.blocks, 10, { on: state === 'focus' ? 'hud.plate' : 'hud.text', off: state === 'focus' ? 'hud.border' : 'phone.bezel.edge', state });
        }
      });
    }, true);
    this.chrome.setTexture('menu:chrome');

    this.texts.removeAll(true);
    const add = (objs: Phaser.GameObjects.GameObject[]) => this.texts.add(objs);
    add([pxText(this, L.title.x + 7, L.title.y + 6, title, { bold: true, tint: 'hud.plate' })]);
    add([pxText(this, L.back.x + L.back.w / 2, L.back.y + 6, s.id === 'pause' && this.mode === 'world' ? 'RESUME' : s.id === 'pause' ? 'CLOSE' : '◀ BACK', { bold: true, align: 'center' })]);

    if (confirm) {
      const lines = wrap(confirm.text, L.confirm.w - 20);
      lines.forEach((l, i) => add(pxTextShadow(this, L.W / 2, cTop + 10 + i * 12, l, { align: 'center' })));
      pills.forEach((r, i) => add([pxText(this, r.x + 15, r.y + 5, i === 0 ? 'YES' : 'NO', { bold: true, tint: i === this.selected ? 'hud.plate' : 'hud.text' })]));
    } else if (about) {
      about.forEach((l, i) => add([pxText(this, L.rows.x + 10, L.rows.y + 8 + i * 12, l, { bold: i === 0, tint: i === 0 ? 'hud.star' : 'hud.text' })]));
    } else {
      shown.forEach((row, j) => {
        const i = j + this.scroll;
        const b = rowBand(L, i, this.scroll, pitch, rowH);
        if (row.kind === 'note') { add([pxText(this, b.x + 7, b.y + 6, truncate(row.label, L.rows.w + 20), { tint: 'hud.border' })]); return; }
        const focus = i === this.selected && !row.disabled;
        const ink = row.disabled ? 'hud.border' : focus ? 'hud.plate' : 'hud.text';
        const labelX = b.x + (focus ? 15 : 7);
        const labelMax = L.rows.w - (focus ? 15 : 7) - (row.value ? L.valueW + 12 : 8);
        add([pxText(this, labelX, b.y + 6, truncate(row.label, labelMax, true), { bold: true, tint: ink })]);
        if (row.detail) add([pxText(this, b.x + 7, b.y + 18, truncate(row.detail, L.rows.w - 14), { tint: row.disabled ? 'hud.border' : focus ? 'hud.plate' : 'hud.border' })]);
        if (row.value !== undefined) {
          const text = row.kind === 'choice' && focus ? `◀ ${row.value} ▶` : row.value;
          add([pxText(this, b.x + L.rows.w - 8, b.y + 6, text, { bold: true, tint: ink, align: 'right' })]);
        }
      });
      if (this.rows.length > visible) add([pxText(this, L.rows.x + L.rows.w + 20, L.rows.y + 6, this.scroll > 0 ? '▲' : '', { tint: 'hud.border' }), pxText(this, L.rows.x + L.rows.w + 20, L.rows.y + (visible - 1) * pitch + 6, this.scroll + visible < this.rows.length ? '▼' : '', { tint: 'hud.border' })]);
    }
    const hint = hintLine(s.id === 'confirm' ? 'confirm' : s.id === 'section' ? 'settings' : 'list', this.lastInput);
    if (hint) add([pxText(this, L.pad, L.hintY, hint, { tint: 'hud.border' })]);
  }
}

export default MenuScene;
