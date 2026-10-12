import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, START_DISTRICT, TILE_SIZE } from '../utils/constants';
import {
  AGE_MAX,
  AGE_MIN,
  DEGREES,
  GENDERS,
  INDIAN_STATES,
  NAME_MAX,
  SKIN_TONES,
  defaultProfile,
  sheetForProfile,
  validateProfile,
} from '../utils/profile';
import { useGameStore } from '../store';
import { color, hex, GRID } from '../ui/tokens';
import { platform } from '../platform';
import type { PlayerProfile } from '../utils/types';
import type { WorldSceneData } from './WorldScene';

type FieldKind = 'text' | 'choice';

interface Field {
  key: keyof PlayerProfile | 'town' | 'state';
  label: string;
  kind: FieldKind;
  /** Choice fields cycle through these with ←/→ or a tap. */
  options?: readonly string[];
  /** Text fields cap at this many characters. */
  max?: number;
}

const FIELDS: Field[] = [
  { key: 'name', label: 'Name', kind: 'text', max: NAME_MAX },
  { key: 'gender', label: 'Gender', kind: 'choice', options: GENDERS },
  { key: 'age', label: 'Age', kind: 'choice', options: Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => String(AGE_MIN + i)) },
  { key: 'state', label: 'Home state', kind: 'choice', options: INDIAN_STATES },
  { key: 'town', label: 'Home town', kind: 'text', max: 18 },
  { key: 'college', label: 'College', kind: 'text', max: 24 },
  { key: 'degree', label: 'Degree', kind: 'choice', options: DEGREES },
  { key: 'skin', label: 'Skin tone', kind: 'choice', options: SKIN_TONES.map(String) },
];

// Layout on the 8px UI grid (design system §2). Rows are 24px tall so a tap
// target is ≥48px once the 640×360 canvas is scaled ×2 on a phone.
const PANEL_X = GRID * 6;
const PANEL_Y = GRID * 3;
const PANEL_W = GRID * 44;
const PANEL_H = GAME_HEIGHT - GRID * 6;
const ROW_H = GRID * 3;
const LABEL_X = PANEL_X + GRID * 2;
const VALUE_X = PANEL_X + GRID * 14;
const FIRST_ROW_Y = PANEL_Y + GRID * 7;
const FONT = '8px monospace';

/**
 * CharacterSelectScene — character creation as a pixel "offer letter"
 * (profile doc §1, P1_P2 §2.1).
 *
 * Fields write `player.profile`; age + gender + skin assign the sprite, which
 * the second screen shows walking in all four directions on a test tile.
 * Keyboard: ↑↓ / Tab move, ←→ cycle a choice, type into a text field, Enter
 * confirms. Pointer: tap a row to focus it, tap a choice to cycle it. Text
 * entry goes through one hidden DOM <input>, so phones get their on-screen
 * keyboard (mobile foundation §6, P1–P2 gate).
 */
export class CharacterSelectScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.CHARACTER_SELECT;

  private profile!: PlayerProfile;
  private focused = 0;
  private rows: Array<{ label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Rectangle; swatch?: Phaser.GameObjects.Rectangle }> = [];
  private hint!: Phaser.GameObjects.Text;
  private error!: Phaser.GameObjects.Text;
  private textInput: HTMLInputElement | null = null;
  private cursorOn = true;
  private cursorTimer: Phaser.Time.TimerEvent | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private stage: 'form' | 'preview' = 'form';

  constructor() {
    super(CharacterSelectScene.KEY);
  }

  create(): void {
    this.profile = { ...defaultProfile(), hometown: { ...defaultProfile().hometown } };
    this.focused = 0;
    this.rows = [];
    this.stage = 'form';

    useGameStore.getState().setActiveScene(CharacterSelectScene.KEY);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor(hex('ui.bg'));
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.cleanup, this);

    this.buildForm();
    this.attachInput();
    this.focus(0);
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  private buildForm(): void {
    // The letter: cream paper with a shaded edge, the way an offer letter
    // sits on a desk.
    this.add.rectangle(PANEL_X + 2, PANEL_Y + 2, PANEL_W, PANEL_H, color('ui.paper.edge')).setOrigin(0);
    this.add.rectangle(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, color('ui.paper')).setOrigin(0)
      .setStrokeStyle(1, color('ui.line'));

    this.add.text(PANEL_X + GRID * 2, PANEL_Y + GRID, 'OFFER LETTER', {
      font: 'bold 10px monospace', color: hex('ui.text.ink'),
    });
    this.add.text(PANEL_X + GRID * 2, PANEL_Y + GRID * 3, 'Dear candidate, please confirm your details.', {
      font: FONT, color: hex('ui.text.dim'),
    });
    this.add.text(PANEL_X + PANEL_W - GRID * 2, PANEL_Y + GRID, 'Whitefield · Bengaluru', {
      font: FONT, color: hex('ui.text.dim'),
    }).setOrigin(1, 0);

    FIELDS.forEach((field, i) => {
      const y = FIRST_ROW_Y + i * ROW_H;
      const bg = this.add.rectangle(PANEL_X + GRID, y, PANEL_W - GRID * 2, ROW_H, color('ui.paper'), 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onRowTap(i));

      const label = this.add.text(LABEL_X, y + GRID, field.label, { font: FONT, color: hex('ui.text.ink') });
      const value = this.add.text(VALUE_X, y + GRID, '', { font: FONT, color: hex('ui.text.ink') });
      // Underline, the "fill here" line of a paper form.
      this.add.rectangle(VALUE_X, y + ROW_H - 4, PANEL_W - GRID * 16, 1, color('ui.paper.edge')).setOrigin(0);

      const row: (typeof this.rows)[number] = { label, value, bg };
      if (field.key === 'skin') {
        row.swatch = this.add.rectangle(VALUE_X + GRID * 4, y + GRID - 1, GRID * 2, GRID + 2, color('skin.3')).setOrigin(0)
          .setStrokeStyle(1, color('ui.line'));
      }
      this.rows.push(row);
    });

    this.error = this.add.text(LABEL_X, PANEL_Y + PANEL_H - GRID * 4, '', { font: FONT, color: hex('ui.bad') });
    this.hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - GRID * 1.5, '', { font: '7px monospace', color: hex('ui.text') })
      .setOrigin(0.5);

    this.cursorTimer = this.time.addEvent({
      delay: 500, loop: true,
      callback: () => { this.cursorOn = !this.cursorOn; this.render(); },
    });
    this.render();
  }

  private get(field: Field): string {
    switch (field.key) {
      case 'state': return this.profile.hometown.state;
      case 'town': return this.profile.hometown.town;
      case 'age': return String(this.profile.age);
      case 'skin': return String(this.profile.skin);
      default: return String(this.profile[field.key]);
    }
  }

  private set(field: Field, value: string): void {
    switch (field.key) {
      case 'state': this.profile.hometown.state = value; break;
      case 'town': this.profile.hometown.town = value; break;
      case 'age': this.profile.age = Number(value); break;
      case 'skin': this.profile.skin = Number(value) as PlayerProfile['skin']; break;
      case 'gender': this.profile.gender = value as PlayerProfile['gender']; break;
      case 'degree': this.profile.degree = value as PlayerProfile['degree']; break;
      case 'name': this.profile.name = value; break;
      case 'college': this.profile.college = value; break;
    }
  }

  private render(): void {
    if (this.stage !== 'form') return;
    FIELDS.forEach((field, i) => {
      const row = this.rows[i];
      const active = i === this.focused;
      row.bg.setFillStyle(color('ui.focus'), active ? 0.35 : 0);
      row.label.setColor(hex(active ? 'ui.text.ink' : 'ui.text.dim'));

      let text = this.get(field);
      if (field.kind === 'choice') {
        text = active ? `‹ ${text} ›` : text;
      } else if (active) {
        text = `${text}${this.cursorOn ? '_' : ' '}`;
      } else if (!text) {
        text = '·········';
      }
      row.value.setText(text);
      row.value.setColor(hex(field.kind === 'text' && !this.get(field) && !active ? 'ui.text.dim' : 'ui.text.ink'));
      if (row.swatch) {
        row.swatch.setFillStyle(color(`skin.${this.profile.skin}` as 'skin.1'));
        row.swatch.x = VALUE_X + (active ? GRID * 5 : GRID * 2);
      }
    });

    const field = FIELDS[this.focused];
    this.hint.setText(
      field.kind === 'text'
        ? '↑↓ next field · type to fill · Enter to sign'
        : '↑↓ next field · ←→ change · Enter to sign',
    );
  }

  private focus(i: number): void {
    this.focused = Phaser.Math.Wrap(i, 0, FIELDS.length);
    const field = FIELDS[this.focused];
    if (this.textInput) {
      if (field.kind === 'text') {
        this.textInput.value = this.get(field);
        this.textInput.maxLength = field.max ?? NAME_MAX;
        this.textInput.focus({ preventScroll: true });
      } else {
        this.textInput.blur();
      }
    }
    this.render();
  }

  private cycle(delta: number): void {
    const field = FIELDS[this.focused];
    if (field.kind !== 'choice' || !field.options) return;
    const options = field.options;
    const index = Math.max(0, options.indexOf(this.get(field)));
    this.set(field, options[Phaser.Math.Wrap(index + delta, 0, options.length)]);
    this.render();
  }

  private onRowTap(i: number): void {
    if (this.stage !== 'form') return;
    if (i === this.focused && FIELDS[i].kind === 'choice') this.cycle(1);
    else this.focus(i);
  }

  // ── Input plumbing ───────────────────────────────────────────────────────
  private attachInput(): void {
    // One hidden <input> carries all text entry: desktop keystrokes land in
    // it, and tapping a text row focuses it, which is what summons a phone's
    // on-screen keyboard. It sits inside the canvas host, visually gone.
    const host = this.game.canvas.parentElement ?? document.body;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Character form text field');
    input.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;pointer-events:none';
    host.appendChild(input);
    this.textInput = input;

    input.addEventListener('input', () => {
      const field = FIELDS[this.focused];
      if (field.kind !== 'text') return;
      // Letters, digits, spaces, dots and apostrophes — enough for any Indian
      // name, town or college; nothing that breaks a dialogue line.
      const clean = input.value.replace(/[^\p{L}\p{N} .'&-]/gu, '').slice(0, field.max ?? NAME_MAX);
      if (clean !== input.value) input.value = clean;
      this.set(field, clean);
      this.render();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (this.stage === 'preview') {
        if (e.key === 'Enter' || e.key === ' ') this.start();
        if (e.key === 'Escape' || e.key === 'Backspace') this.backToForm();
        return;
      }
      switch (e.key) {
        case 'ArrowDown': case 'Tab': e.preventDefault(); this.focus(this.focused + (e.shiftKey ? -1 : 1)); break;
        case 'ArrowUp': e.preventDefault(); this.focus(this.focused - 1); break;
        case 'ArrowLeft': if (FIELDS[this.focused].kind === 'choice') this.cycle(-1); break;
        case 'ArrowRight': if (FIELDS[this.focused].kind === 'choice') this.cycle(1); break;
        case 'Enter': e.preventDefault(); this.sign(); break;
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private cleanup(): void {
    this.cursorTimer?.destroy();
    this.cursorTimer = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.textInput?.remove();
    this.textInput = null;
  }

  // ── Sign → preview → start ───────────────────────────────────────────────
  private sign(): void {
    const problems = validateProfile(this.profile);
    if (problems.length) {
      this.error.setText(problems[0]);
      this.focus(0);
      return;
    }
    this.profile.name = this.profile.name.trim();
    useGameStore.getState().setProfile(this.profile);
    this.textInput?.blur();
    this.showPreview();
  }

  /**
   * Acceptance for P2: the assigned sprite walking in four directions on a
   * test tile, so the user audits the sheet in the engine, not in a viewer.
   */
  private showPreview(): void {
    this.stage = 'preview';
    this.cursorTimer?.destroy();
    this.cursorTimer = null;
    this.children.removeAll();
    this.rows = [];

    const sheet = sheetForProfile(this.profile);
    const cx = GAME_WIDTH / 2;
    const tileY = GAME_HEIGHT / 2 + GRID * 2;

    this.add.text(cx, GRID * 4, `${this.profile.name}, ${this.profile.age} · ${this.profile.hometown.town || this.profile.hometown.state}`, {
      font: 'bold 10px monospace', color: hex('ui.text'),
    }).setOrigin(0.5);
    this.add.text(cx, GRID * 4 + 14, `${this.profile.degree} · ${this.profile.college || 'college'} · sheet ${sheet}`, {
      font: '7px monospace', color: hex('ui.text.dim'),
    }).setOrigin(0.5);

    // A strip of test tiles from the street set, one sprite per direction.
    const dirs = ['down', 'left', 'right', 'up'] as const;
    const spacing = TILE_SIZE * 2;
    const startX = cx - spacing * 1.5;
    for (let i = -1; i <= 4; i++) {
      this.add.rectangle(startX + i * spacing - TILE_SIZE, tileY - TILE_SIZE / 2, spacing, TILE_SIZE, color('ground.paver'))
        .setOrigin(0).setStrokeStyle(1, color('ground.paver.shade'));
    }
    dirs.forEach((dir, i) => {
      const x = startX + i * spacing;
      const sprite = this.add.sprite(x, tileY - TILE_SIZE / 2 - 10, sheet);
      const walk = `${sheet}-walk-${dir}`;
      if (this.anims.exists(walk)) sprite.play(walk);
      this.add.text(x, tileY + TILE_SIZE, dir, { font: '7px monospace', color: hex('ui.text.dim') }).setOrigin(0.5);
    });

    const button = this.add.rectangle(cx, GAME_HEIGHT - GRID * 6, GRID * 20, GRID * 4, color('ui.focus'))
      .setStrokeStyle(1, color('ui.line'))
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => this.start());
    this.add.text(cx, GAME_HEIGHT - GRID * 6, 'FLY TO BENGALURU', { font: 'bold 9px monospace', color: hex('ui.text.ink') }).setOrigin(0.5);
    this.add.text(cx, GAME_HEIGHT - GRID * 2, 'Enter / tap to start · Esc to edit', { font: '7px monospace', color: hex('ui.text.dim') }).setOrigin(0.5);
  }

  private backToForm(): void {
    this.scene.restart();
  }

  private start(): void {
    if (this.stage !== 'preview') return;
    this.stage = 'form'; // guard against double-fire during the fade
    void platform.audio.unlock();
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(SCENE_KEYS.WORLD, { districtId: START_DISTRICT } satisfies WorldSceneData);
    });
  }
}

export default CharacterSelectScene;
