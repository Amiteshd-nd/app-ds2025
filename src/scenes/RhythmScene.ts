import Phaser from 'phaser';
import { platform } from '../platform';
import { attachGamepad, PAD } from '../ui/kit/gamepad';
import { choicePill, hudPlate, MIN_TAP } from '../ui/kit/molecules';
import { bake, pxText, pxTextShadow } from '../ui/kit/phaser';
import { rect, roundRect, ring, type PixelCtx } from '../ui/kit/pixel';
import { hex } from '../ui/tokens';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import {
  COUNT_IN_BARS, HIT_WINDOW_MS, beatMs, hits, notesFor, passShare, passed, press, songMs, sweep,
  type RhythmLesson, type RhythmNote,
} from '../systems/rhythm';
import { cue } from '../audio/cue';

export interface RhythmSceneData {
  lesson: RhythmLesson;
  /** A free strum: no pass mark, the card says so. */
  free: boolean;
  flags: Record<string, boolean>;
}

export type RhythmPhase = 'intro' | 'count' | 'play' | 'result';

/** What `rhythm:done` carries back to WorldScene. */
export interface RhythmResult {
  ok: boolean | 'quit';
  hits: number;
  total: number;
}

/** The bot's (and the tests') read of the lane — Movie Mode presses E from this, never by poking the notes. */
export interface RhythmView {
  phase: RhythmPhase;
  /** ms until the nearest open note (negative = it is just past the line), or null when none is left. */
  nextNoteInMs: number | null;
  hits: number;
  total: number;
  passed: boolean | null;
}

const PANEL = { x: 60, y: 54, w: 520, h: 236 };
const LANE = { x: 84, y: 150, w: 472, h: 44 };
const STRUM_X = 136;
/** How far ahead a note appears on the lane. */
const LEAD_MS = 2000;
const BUTTON = { x: PANEL.x + PANEL.w - 128, y: PANEL.y + PANEL.h - 56, w: 104, h: MIN_TAP };

/**
 * RhythmScene — the guitar's rhythm lane (story 2.3, ADR-131), launched by
 * WorldScene over the flat. Intro card → one bar of count-in → the song:
 * chord chips slide right-to-left to the strum line and E / Space / Enter /
 * A / a tap on STRUM (or anywhere on the lane) strums. A miss buzzes, it
 * never punishes. The result card closes on the same keys and emits
 * `rhythm:done` with { ok, hits, total }; Esc / Backspace quits (changes
 * nothing). Reduced motion: the chips do not slide — one chord box at the
 * line lights up while a strum is due. Time is the scene's own delta, so the
 * Playground's speed and the stepped clock both drive it.
 */
export class RhythmScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.RHYTHM;

  private d!: RhythmSceneData;
  private notes: RhythmNote[] = [];
  private phase: RhythmPhase = 'intro';
  /** Song time in ms; negative during the count-in. */
  private t = 0;
  private reduced = false;
  private layer!: Phaser.GameObjects.Container;
  private chips: Phaser.GameObjects.Container[] = [];
  private flash: { text: string; until: number } | null = null;
  private result: boolean | null = null;
  private offPad: (() => void) | null = null;

  constructor() {
    super(RhythmScene.KEY);
  }

  create(data: RhythmSceneData): void {
    this.d = data;
    this.notes = notesFor(data.lesson);
    this.phase = 'intro';
    this.t = 0;
    this.result = null;
    this.flash = null;
    this.reduced = platform.display.prefersReducedMotion();
    this.cameras.main.setRoundPixels(true);

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, Phaser.Display.Color.HexStringToColor(hex('ui.bg')).color, 0.72).setOrigin(0);
    this.add.image(PANEL.x, PANEL.y, bake(this, 'rh:panel', PANEL.w, PANEL.h, (g: PixelCtx) => hudPlate(g, 0, 0, PANEL.w, PANEL.h))).setOrigin(0);
    this.add.image(LANE.x, LANE.y, bake(this, 'rh:lane', LANE.w, LANE.h, (g: PixelCtx) => {
      roundRect(g, 0, 0, LANE.w, LANE.h, 3, hex('ui.panel'));
      ring(g, 0, 0, LANE.w, LANE.h, 3, 1, hex('ui.panel.edge'));
      rect(g, STRUM_X - LANE.x - 1, 2, 3, LANE.h - 4, hex('ui.focus'));
    })).setOrigin(0);
    this.add.image(BUTTON.x, BUTTON.y, bake(this, 'rh:button', BUTTON.w, BUTTON.h, (g: PixelCtx) => choicePill(g, 0, Math.round((BUTTON.h - 17) / 2), BUTTON.w, 'focus'))).setOrigin(0);
    pxText(this, BUTTON.x + BUTTON.w / 2, BUTTON.y + BUTTON.h / 2 - 3, 'STRUM', { bold: true, align: 'center', tint: 'ui.text.ink' });
    this.layer = this.add.container(0, 0);

    const act = () => this.act();
    for (const key of ['E', 'SPACE', 'ENTER']) this.input.keyboard?.on(`keydown-${key}`, act);
    this.input.keyboard?.on('keydown-ESC', () => this.finish('quit'));
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.finish('quit'));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const onButton = p.x >= BUTTON.x && p.x < BUTTON.x + BUTTON.w && p.y >= BUTTON.y && p.y < BUTTON.y + BUTTON.h;
      const onLane = p.x >= LANE.x && p.x < LANE.x + LANE.w && p.y >= LANE.y - 20 && p.y < LANE.y + LANE.h + 20;
      if (onButton || onLane || this.phase !== 'play') act();
    });
    this.offPad = attachGamepad(this, { button: (b) => { if (b === PAD.A) act(); if (b === PAD.B) this.finish('quit'); } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.offPad?.(); this.offPad = null; });
    this.draw();
  }

  /** E / tap: start, strum, or close — whatever the card is asking for. */
  private act(): void {
    if (this.phase === 'intro') { this.phase = 'count'; this.t = -COUNT_IN_BARS * 4 * beatMs(this.d.lesson.bpm); return; }
    if (this.phase === 'play') {
      const due = this.notes.find((n) => !n.hit && !n.missed);
      const r = press(this.notes, this.t);
      // The strum is heard (ADR-140): the chord on a hit, a dead thunk on a miss.
      cue(r === 'clean' || r === 'hit' ? `a.sfx.world.guitar.${(due?.chord ?? 'G').toLowerCase()}` : 'a.sfx.player.bump_wall');
      this.flash = { text: r === 'clean' ? 'CLEAN' : r === 'hit' ? 'GOOD' : '·', until: this.t + 300 };
      return;
    }
    if (this.phase === 'result') this.finish(this.d.free ? true : Boolean(this.result));
  }

  private finish(ok: boolean | 'quit'): void {
    this.events.emit('rhythm:done', { ok, hits: hits(this.notes), total: this.notes.length } satisfies RhythmResult);
  }

  view(): RhythmView {
    const open = this.notes.find((n) => !n.hit && !n.missed);
    return {
      phase: this.phase,
      nextNoteInMs: open ? open.at - this.t : null,
      hits: hits(this.notes),
      total: this.notes.length,
      passed: this.result,
    };
  }

  update(_time: number, delta: number): void {
    if (this.phase === 'intro' || this.phase === 'result') return;
    this.t += delta;
    if (this.phase === 'count' && this.t >= 0) this.phase = 'play';
    if (this.phase === 'play') {
      sweep(this.notes, this.t);
      if (this.t > songMs(this.d.lesson) + HIT_WINDOW_MS) {
        sweep(this.notes, Infinity);
        this.result = this.d.free ? true : passed(this.d.lesson, this.notes, this.d.flags);
        this.phase = 'result';
      }
    }
    this.draw();
  }

  private draw(): void {
    this.layer.removeAll(true);
    for (const c of this.chips) c.destroy();
    this.chips = [];
    const { lesson } = this.d;
    const add = (o: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) => this.layer.add(o);
    add(pxTextShadow(this, PANEL.x + 16, PANEL.y + 14, lesson.title.toUpperCase(), { bold: true }));
    const need = Math.ceil(passShare(lesson, this.d.flags) * this.notes.length);
    const sub = this.d.free ? 'No marks tonight. Just play.' : `Strum on the beat · ${need} of ${this.notes.length} to learn it`;
    add(pxText(this, PANEL.x + 16, PANEL.y + 32, sub, { tint: 'ui.text.dim' }));
    add(pxText(this, PANEL.x + 16, PANEL.y + 48, `Chords: ${[...new Set(lesson.chords)].join(' · ')} · ${lesson.bpm} bpm`, { tint: 'ui.text.dim' }));

    if (this.phase === 'intro') {
      add(pxText(this, GAME_WIDTH / 2, LANE.y + 16, 'E / tap STRUM to start · Esc to put it down', { align: 'center' }));
      return;
    }
    if (this.phase === 'result') {
      const ok = Boolean(this.result);
      const line = this.d.free ? `${hits(this.notes)} strums. The flat sounds less empty.` : ok ? `${lesson.title} — learned! ${hits(this.notes)}/${this.notes.length}` : `Not yet — ${hits(this.notes)}/${this.notes.length}. Your fingers need a night.`;
      add(pxTextShadow(this, GAME_WIDTH / 2, LANE.y + 12, line, { bold: true, align: 'center', tint: ok ? 'ui.good' : 'hud.text' }));
      add(pxText(this, GAME_WIDTH / 2, LANE.y + 30, 'E / tap to put the guitar down', { align: 'center', tint: 'ui.text.dim' }));
      return;
    }
    if (this.phase === 'count') {
      const beat = Math.min(4, Math.floor((this.t + COUNT_IN_BARS * 4 * beatMs(lesson.bpm)) / beatMs(lesson.bpm)) + 1);
      add(pxTextShadow(this, GAME_WIDTH / 2, LANE.y + 16, String(beat), { bold: true, align: 'center', k: 2 }));
    }

    // The lane: chord chips sliding to the strum line, or (reduced motion) one box that lights when a strum is due.
    const pxPerMs = (LANE.x + LANE.w - 16 - STRUM_X) / LEAD_MS;
    if (this.reduced) {
      const open = this.notes.find((n) => !n.hit && !n.missed);
      const due = open && Math.abs(open.at - this.t) <= HIT_WINDOW_MS;
      add(this.add.image(STRUM_X - 14, LANE.y + 8, bake(this, `rh:box:${due ? 1 : 0}`, 28, 28, (g: PixelCtx) => roundRect(g, 0, 0, 28, 28, 3, hex(due ? 'ui.focus' : 'ui.paper')))).setOrigin(0));
      if (open) add(pxText(this, STRUM_X, LANE.y + 18, open.chord, { bold: true, align: 'center', tint: 'ui.text.ink' }));
    } else {
      for (const n of this.notes) {
        if (n.hit || n.missed) continue;
        const x = Math.round(STRUM_X + (n.at - this.t) * pxPerMs);
        if (x > LANE.x + LANE.w - 14 || x < LANE.x + 2) continue;
        const chip = this.add.container(x - 11, LANE.y + 11);
        chip.add(this.add.image(0, 0, bake(this, 'rh:chip', 22, 22, (g: PixelCtx) => { roundRect(g, 0, 0, 22, 22, 3, hex('ui.paper')); ring(g, 0, 0, 22, 22, 3, 1, hex('ui.paper.edge')); })).setOrigin(0));
        chip.add(pxText(this, 11, 8, n.chord, { bold: true, align: 'center', tint: 'ui.text.ink' }));
        this.chips.push(chip);
      }
    }
    if (this.flash && this.t < this.flash.until) add(pxTextShadow(this, STRUM_X, LANE.y - 14, this.flash.text, { bold: true, align: 'center', tint: this.flash.text === '·' ? 'ui.text.dim' : 'ui.good' }));

    // Progress and the running count.
    const prog = Math.max(0, Math.min(1, this.t / songMs(lesson)));
    add(this.add.rectangle(LANE.x, LANE.y + LANE.h + 10, LANE.w, 3, Phaser.Display.Color.HexStringToColor(hex('ui.panel.edge')).color).setOrigin(0));
    add(this.add.rectangle(LANE.x, LANE.y + LANE.h + 10, Math.round(LANE.w * prog), 3, Phaser.Display.Color.HexStringToColor(hex('ui.focus')).color).setOrigin(0));
    add(pxText(this, LANE.x, LANE.y + LANE.h + 22, `${hits(this.notes)} / ${this.notes.length}`, { tint: 'ui.text.dim' }));
  }
}

export default RhythmScene;
