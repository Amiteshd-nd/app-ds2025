import Phaser from 'phaser';
import { platform } from '../platform';
import { DialogueManager, type DialogueView } from '../systems/DialogueManager';
import { settings } from '../systems/SettingsManager';
import { DEPTH } from '../utils/constants';
import { HUD_GLYPHS } from './hud/glyphs';
import { DIALOGUE, layoutDialogue, onCard, pillAt, type DialogueLayout } from './hud/dialogue';
import { type DialogueSpeed } from './hud/layout';
import { revealedChars } from './hud/viewModel';
import { choicePill, labelCard, type UiState } from './kit/molecules';
import { bake, pxText, pxTextShadow } from './kit/phaser';
import { bitmap, roundRect } from './kit/pixel';
import { measure } from './kit/text';
import { hex, motion } from './tokens';

export interface DialogueBoxCallbacks {
  onClose?: (result: { dialogueId: string; triggeredQuests: string[] }) => void;
}

/**
 * DialogueBox — the in-canvas presentation of a DialogueManager conversation
 * (P6c, ADR-118; style board §5).
 *
 * A label card along the bottom; the speaker on a white pill over its top
 * edge; the line typed out at the Settings → Gameplay speed (skippable with
 * one press); the bill under negotiation in the ★ colour; the choices as
 * pills that flow and wrap, the chosen one inverted with a ▶; a blinking
 * chevron when there is more. Locked choices are shown dotted with their
 * reason, and refuse to confirm.
 *
 * All conversation logic lives in DialogueManager; this draws views and turns
 * keys and taps into choose / advance / end. Hosted by HudScene.
 */
export class DialogueBox {
  private scene: Phaser.Scene;
  private callbacks: DialogueBoxCallbacks;

  private root: Phaser.GameObjects.Container | null = null;
  private chrome!: Phaser.GameObjects.Image;
  private textLayer!: Phaser.GameObjects.Container;
  private chevron!: Phaser.GameObjects.Image;

  private view: DialogueView | null = null;
  private layout: DialogueLayout | null = null;
  private selected = 0;
  private revealStart = 0;
  private revealed = 0;
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  private bobTimer: Phaser.Time.TimerEvent | null = null;
  private bob = false;
  private detach: (() => void) | null = null;

  constructor(scene: Phaser.Scene, callbacks: DialogueBoxCallbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Top of the card in screen px while open (toasts move above it). */
  get top(): number | null {
    return this.layout?.y ?? null;
  }

  open(dialogueId: string, callbacks?: DialogueBoxCallbacks): void {
    if (this.isOpen) return;
    if (callbacks) this.callbacks = callbacks;
    this.build();
    this.attach();
    this.show(DialogueManager.getInstance().start(dialogueId));
  }

  /** Scene-shutdown path: end the conversation without firing callbacks. */
  forceClose(): void {
    if (!this.isOpen) return;
    if (DialogueManager.getInstance().isActive) DialogueManager.getInstance().end();
    this.teardown();
  }

  // ── Build / input ────────────────────────────────────────────────────────

  private build(): void {
    const key = bake(this.scene, 'dlg:chrome', 1, 1, () => {});
    this.chrome = this.scene.add.image(0, 0, key).setOrigin(0);
    this.textLayer = this.scene.add.container(0, 0);
    this.chevron = this.scene.add.image(0, 0, bake(this.scene, 'dlg:chevron', 5, 3, (g) => bitmap(g, HUD_GLYPHS.chevron, 0, 0, hex('hud.text')))).setOrigin(0).setVisible(false);
    this.root = this.scene.add.container(0, 0, [this.chrome, this.textLayer, this.chevron]).setDepth(DEPTH.DIALOGUE);

    const reduced = platform.display.prefersReducedMotion();
    this.bob = reduced; // static chevron under reduced motion: always on
    if (!reduced) {
      this.bobTimer = this.scene.time.addEvent({ delay: motion('m.hud.bob'), loop: true, callback: () => { this.bob = !this.bob; this.placeChevron(); } });
    }
  }

  private attach(): void {
    const onKey = (ev: KeyboardEvent) => this.onKey(ev);
    const onDown = (p: Phaser.Input.Pointer) => this.onPointer(p);
    this.scene.input.keyboard?.on('keydown', onKey);
    this.scene.input.on('pointerdown', onDown);
    this.detach = () => {
      this.scene.input.keyboard?.off('keydown', onKey);
      this.scene.input.off('pointerdown', onDown);
    };
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.view) return;
    switch (ev.code) {
      case 'ArrowUp': case 'KeyW': case 'ArrowLeft': case 'KeyA': this.move(-1); return;
      case 'ArrowDown': case 'KeyS': case 'ArrowRight': case 'KeyD': this.move(1); return;
      case 'Enter': case 'Space': case 'KeyE': this.confirm(); return;
      default: return;
    }
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (!this.view || !this.layout) return;
    const pill = pillAt(this.layout.pills, p.x, p.y);
    if (pill) {
      if (this.typing) { this.skip(); return; }
      this.selected = pill.index;
      this.render();
      this.confirm();
      return;
    }
    if (onCard(this.layout, p.x, p.y)) this.confirm();
  }

  private move(direction: number): void {
    const count = this.view?.choices.length ?? 0;
    if (count === 0) return;
    this.selected = Phaser.Math.Wrap(this.selected + direction, 0, count);
    this.render();
  }

  private get typing(): boolean {
    return this.view !== null && this.revealed < this.view.text.length;
  }

  /** One press while the line is typing shows all of it. */
  private skip(): void {
    if (!this.view) return;
    this.revealed = this.view.text.length;
    this.typeTimer?.remove();
    this.typeTimer = null;
    this.render();
  }

  private confirm(): void {
    if (!this.view) return;
    if (this.typing) { this.skip(); return; }
    const dm = DialogueManager.getInstance();

    if (this.view.choices.length > 0) {
      if (!this.view.choices[this.selected]?.enabled) return; // locked — shown, not takeable
      this.show(dm.choose(this.selected));
      return;
    }
    if (this.view.canAdvance) {
      this.show(dm.advance());
      return;
    }
    // Terminal node: the end() emission is what progresses quests.
    const result = dm.end();
    this.teardown();
    this.callbacks.onClose?.(result);
  }

  // ── Views ────────────────────────────────────────────────────────────────

  private show(view: DialogueView): void {
    this.view = view;
    this.selected = view.choices.findIndex((c) => c.enabled);
    if (this.selected < 0) this.selected = 0;
    this.startTyping();
    this.render();
  }

  private startTyping(): void {
    if (!this.view) return;
    this.typeTimer?.remove();
    this.typeTimer = null;
    const speed = platform.display.prefersReducedMotion() ? 'instant' : (settings().gameplay.dialogueSpeed as DialogueSpeed);
    this.revealStart = this.scene.time.now;
    this.revealed = revealedChars(0, this.view.text.length, speed);
    if (this.revealed >= this.view.text.length) return;
    this.typeTimer = this.scene.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (!this.view) return;
        const n = revealedChars(this.scene.time.now - this.revealStart, this.view.text.length, speed);
        if (n === this.revealed) return;
        this.revealed = n;
        this.renderText();
        if (n >= this.view.text.length) { this.typeTimer?.remove(); this.typeTimer = null; this.render(); }
      },
    });
  }

  private pillState(i: number): UiState {
    const choice = this.view!.choices[i];
    if (!choice.enabled) return i === this.selected ? 'disabled' : 'locked';
    return i === this.selected ? 'focus' : 'default';
  }

  /** Card, speaker pill and choice pills: baked once per view/selection. */
  private render(): void {
    if (!this.view || !this.root) return;
    const view = this.view;
    const lockedSelected = view.choices.length > 0 && !view.choices[this.selected]?.enabled;
    const layout = layoutDialogue(view, lockedSelected);
    this.layout = layout;

    const speaker = view.speaker.toUpperCase();
    const speakerW = measure(speaker, true) + 2 * DIALOGUE.speaker.padX;
    const h = layout.h + DIALOGUE.speaker.lift;
    const top = layout.y - DIALOGUE.speaker.lift;
    bake(this.scene, 'dlg:chrome', DIALOGUE.x + DIALOGUE.w + 40, h, (g) => {
      labelCard(g, DIALOGUE.x, DIALOGUE.speaker.lift, DIALOGUE.w, layout.h);
      roundRect(g, DIALOGUE.x + 8, 0, speakerW, DIALOGUE.speaker.h, 4, hex('hud.text'));
      // Choices arrive with the end of the line, not before it.
      if (!this.typing) for (const pill of layout.pills) choicePill(g, pill.x, pill.y - top, pill.w, this.pillState(pill.index));
    }, true);
    this.chrome.setTexture('dlg:chrome').setPosition(0, top);
    this.renderText();
  }

  /** Every string on the card; rebuilt on each typewriter step. */
  private renderText(): void {
    if (!this.view || !this.layout) return;
    const view = this.view, layout = this.layout;
    this.textLayer.removeAll(true);
    const add = (objs: Phaser.GameObjects.GameObject[]) => this.textLayer.add(objs);

    const speaker = view.speaker.toUpperCase();
    add([pxText(this.scene, DIALOGUE.x + 8 + DIALOGUE.speaker.padX, layout.y - DIALOGUE.speaker.lift + 4, speaker, { bold: true, tint: 'hud.plate' })]);

    // Body: the revealed prefix, wrapped like the full line so words never jump.
    let left = this.revealed;
    layout.bodyLines.forEach((line, i) => {
      if (left <= 0) return;
      const shown = line.slice(0, left);
      left -= line.length + 1; // the space the wrap ate
      add(pxTextShadow(this.scene, DIALOGUE.x + DIALOGUE.pad, layout.bodyY + i * DIALOGUE.lineH, shown));
    });

    if (view.ledger && layout.ledgerY !== null && !this.typing) {
      add(pxTextShadow(this.scene, DIALOGUE.x + DIALOGUE.pad, layout.ledgerY, view.ledger, { bold: true, tint: 'hud.star' }));
    }

    if (!this.typing) {
      for (const pill of layout.pills) {
        const choice = view.choices[pill.index];
        const state = this.pillState(pill.index);
        const ink = state === 'focus' ? 'hud.plate' : state === 'default' ? 'hud.text' : 'hud.border';
        add([pxText(this.scene, pill.x + 15, pill.y + 5, choice.text, { bold: true, tint: ink })]);
      }
      const locked = view.choices[this.selected];
      if (layout.reasonY !== null && locked && !locked.enabled && locked.lockedReason) {
        add([pxText(this.scene, DIALOGUE.x + DIALOGUE.pad, layout.reasonY, locked.lockedReason, { tint: 'hud.border' })]);
      }
    }
    this.placeChevron();
  }

  /** The "more" chevron blinks at the corner when a press continues or closes the line. */
  private placeChevron(): void {
    if (!this.view || !this.layout) { this.chevron.setVisible(false); return; }
    const more = !this.typing && this.view.choices.length === 0;
    this.chevron.setVisible(more && this.bob).setPosition(this.layout.cornerX, this.layout.cornerY + (this.bob ? 0 : 1));
  }

  private teardown(): void {
    this.detach?.();
    this.detach = null;
    this.typeTimer?.remove();
    this.typeTimer = null;
    this.bobTimer?.remove();
    this.bobTimer = null;
    this.root?.destroy(true);
    this.root = null;
    this.view = null;
    this.layout = null;
    this.selected = 0;
  }
}
