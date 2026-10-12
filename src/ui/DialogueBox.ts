import Phaser from 'phaser';
import { DialogueManager, type DialogueView } from '../systems/DialogueManager';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../utils/constants';

const MIN_PANEL_HEIGHT = 104;
const PAD = 10;
/** Enough for a negotiation: three counter-offers, agree, walk away — and one spare. */
const MAX_CHOICES = 6;
const CHOICE_GAP = 2;

export interface DialogueBoxCallbacks {
  onClose?: (result: { dialogueId: string; triggeredQuests: string[] }) => void;
}

/**
 * DialogueBox — the in-scene presentation of a DialogueManager conversation.
 *
 * All conversation logic (traversal, effects, gating) lives in the manager;
 * this class only renders views and translates keys into choose/advance/end.
 * UP/DOWN select, E/ENTER/SPACE confirm. Locked choices are drawn greyed with
 * their unlock reason and refuse to confirm.
 */
export class DialogueBox {
  private scene: Phaser.Scene;
  private callbacks: DialogueBoxCallbacks;

  private container: Phaser.GameObjects.Container | null = null;
  private speakerText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private ledgerText!: Phaser.GameObjects.Text;
  private panel!: Phaser.GameObjects.Rectangle;

  private view: DialogueView | null = null;
  private selected = 0;
  private detachKeys: (() => void) | null = null;

  constructor(scene: Phaser.Scene, callbacks: DialogueBoxCallbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(dialogueId: string): void {
    if (this.isOpen) return;
    this.build();
    this.attachKeys();
    this.show(DialogueManager.getInstance().start(dialogueId));
  }

  /** Scene-shutdown path: end the conversation without firing callbacks. */
  forceClose(): void {
    if (!this.isOpen) return;
    if (DialogueManager.getInstance().isActive) DialogueManager.getInstance().end();
    this.teardown();
  }

  private build(): void {
    // Positions are laid out in render(): the panel grows with the line, the
    // bill under negotiation and however many choices the node offers.
    this.panel = this.scene.add.rectangle(0, 0, GAME_WIDTH - 12, MIN_PANEL_HEIGHT, 0x0f172a, 0.94).setOrigin(0, 0);
    this.panel.setStrokeStyle(1, 0x3b82f6);

    this.speakerText = this.scene.add.text(0, 0, '', {
      font: 'bold 8px monospace', color: '#93c5fd',
    });
    this.bodyText = this.scene.add.text(0, 0, '', {
      font: '8px monospace', color: '#f8fafc',
      wordWrap: { width: GAME_WIDTH - 2 * PAD - 16 },
      lineSpacing: 3,
    });
    this.ledgerText = this.scene.add.text(0, 0, '', {
      font: 'bold 8px monospace', color: '#fbbf24',
    });
    this.hintText = this.scene.add
      .text(0, 0, '', {
        font: '7px monospace', color: '#64748b',
      })
      .setOrigin(1, 0.5);

    this.choiceTexts = Array.from({ length: MAX_CHOICES }, () =>
      this.scene.add.text(0, 0, '', {
        font: '8px monospace', color: '#94a3b8',
        wordWrap: { width: GAME_WIDTH - 2 * PAD - 30 },
      }),
    );

    this.container = this.scene.add.container(0, 0, [
      this.panel, this.speakerText, this.bodyText, this.ledgerText, this.hintText, ...this.choiceTexts,
    ]);
    this.container.setDepth(DEPTH.DIALOGUE);
    // Pin to the camera, not the world. Scroll factor is per-child for
    // containers, so set it on each element.
    this.container.iterate((child: Phaser.GameObjects.GameObject) =>
      (child as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0),
    );
  }

  private attachKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;

    const up = () => this.move(-1);
    const down = () => this.move(1);
    const confirm = () => this.confirm();

    keyboard.on('keydown-UP', up);
    keyboard.on('keydown-DOWN', down);
    keyboard.on('keydown-E', confirm);
    keyboard.on('keydown-ENTER', confirm);
    keyboard.on('keydown-SPACE', confirm);

    this.detachKeys = () => {
      keyboard.off('keydown-UP', up);
      keyboard.off('keydown-DOWN', down);
      keyboard.off('keydown-E', confirm);
      keyboard.off('keydown-ENTER', confirm);
      keyboard.off('keydown-SPACE', confirm);
    };
  }

  private move(direction: number): void {
    const count = this.view?.choices.length ?? 0;
    if (count === 0) return;
    this.selected = Phaser.Math.Wrap(this.selected + direction, 0, count);
    this.render();
  }

  private confirm(): void {
    if (!this.view) return;
    const dm = DialogueManager.getInstance();

    if (this.view.choices.length > 0) {
      if (!this.view.choices[this.selected].enabled) return; // locked — shown, not takeable
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

  private show(view: DialogueView): void {
    this.view = view;
    this.selected = view.choices.findIndex((c) => c.enabled);
    if (this.selected < 0) this.selected = 0;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    this.speakerText.setText(this.view.speaker.toUpperCase());
    this.bodyText.setText(this.view.text);
    this.ledgerText.setText(this.view.ledger ?? '');

    this.choiceTexts.forEach((text, i) => {
      const choice = this.view!.choices[i];
      if (!choice) {
        text.setText('');
        return;
      }
      const cursor = i === this.selected ? '>' : ' ';
      if (choice.enabled) {
        text.setText(`${cursor} ${choice.text}`);
        text.setColor(i === this.selected ? '#f8fafc' : '#94a3b8');
      } else {
        text.setText(`${cursor} ${choice.text}  [${choice.lockedReason}]`);
        text.setColor('#475569');
      }
    });

    if (this.view.choices.length > 0) this.hintText.setText('↑↓ choose · E confirm');
    else this.hintText.setText(this.view.canAdvance ? 'E to continue ▸' : 'E to close ■');

    this.layout();
  }

  /** Stack line → bill → choices, then size the panel to fit, anchored to the bottom. */
  private layout(): void {
    const count = this.view?.choices.length ?? 0;
    let y = 21;
    const bodyY = y;
    y += this.bodyText.height + 6;
    const ledgerY = y;
    if (this.view?.ledger) y += this.ledgerText.height + 6;
    const choiceYs: number[] = [];
    for (let i = 0; i < count; i++) {
      choiceYs.push(y);
      y += this.choiceTexts[i].height + CHOICE_GAP;
    }
    const height = Math.max(MIN_PANEL_HEIGHT, y + 16);
    const top = GAME_HEIGHT - height - 6;

    this.panel.setPosition(6, top).setSize(GAME_WIDTH - 12, height);
    this.panel.setStrokeStyle(1, 0x3b82f6);
    this.speakerText.setPosition(PAD + 6, top + 7);
    this.bodyText.setPosition(PAD + 6, top + bodyY);
    this.ledgerText.setPosition(PAD + 6, top + ledgerY);
    this.choiceTexts.forEach((text, i) => text.setPosition(PAD + 14, top + (choiceYs[i] ?? 0)));
    this.hintText.setPosition(GAME_WIDTH - PAD - 8, top + height - 9);
  }

  private teardown(): void {
    this.detachKeys?.();
    this.detachKeys = null;
    this.container?.destroy(true);
    this.container = null;
    this.view = null;
    this.selected = 0;
  }
}
