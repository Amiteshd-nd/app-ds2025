import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { QUESTS, SCENES, getDistrict } from '../data';
import { useGameStore } from '../store';
import { settings, useSettings } from '../systems/SettingsManager';
import { NOISE, feedNoise, noise, tickNoise } from '../systems/noise';
import { AUDIO_URLS } from '../assets';
import { PLAYER_SPEED, SCENE_KEYS, TILE_SIZE } from '../utils/constants';
import { AUDIO, audioKey, type AudioToken, type Bus } from './data';
import { DUCK, busGain } from './buses';
import { mixFor, surfaceOf, type Mix, type MixContext, type Pacing } from './mix';

/** A beat's flags: "a, b" both, "a | b" the first of alternatives (same reading as the Playground's). */
const beatFlags = (flag: string | undefined): string[] => (flag ?? '').split(',').map((p) => p.split('|')[0]?.trim() ?? '').filter((f) => f && f !== '-');

/** Seeded, and never Math.random: Movie Mode seeds Math.random for the world, and audio must not shift it. */
const rng = (() => { let s = 0x5eed139; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

/** Small, frequent sounds load with the game; beds, music and the rest load the first time they are needed. */
const EAGER_SOURCES = ['synth/ui.json', 'synth/hud.json', 'synth/phone.json', 'synth/player.json', 'synth/npc.json'];
const MIX_EVERY_MS = 100;
const FADE = { district: 1500, approach: 3000, back: 5000 } as const;
const POSITIONAL_RADIUS_TILES = 8;

interface Live { token: string; sound: Phaser.Sound.BaseSound; gain: number; target: number; fadeMs: number }
interface Source { token: string; x: number; y: number; radius: number; every: [number, number] | null; next: number; live: Live | null }

/** The files to load at boot (BootScene). */
export const eagerAudio = (): Array<[string, string]> => Object.values(AUDIO)
  .filter((e) => EAGER_SOURCES.includes(e.source))
  .flatMap((e) => e.files)
  .filter((f) => AUDIO_URLS[f])
  .map((f) => [audioKey(f), AUDIO_URLS[f]] as [string, string]);

/**
 * AudioSystem — the organism (audio plan v1 §2, ADR-29/139) and the ONLY code
 * that touches Phaser's sound manager (a test enforces it). It follows the
 * pure mix (`mixFor`) every 100 ms: bed layers crossfade, music changes on its
 * own fades (3 s toward danger, 5 s back), stings duck everything, dialogue
 * ducks music 6 dB. One-shots come from events — scenes never play sounds.
 * Nothing it does changes the game: it reads state, it never writes it.
 */
export class AudioSystem {
  private static instance: AudioSystem | null = null;

  private beds = new Map<string, Live>();
  private music: Live | null = null;
  private fadingMusic: Live[] = [];
  private lastPlayed = new Map<string, number>();
  private loading = new Set<string>();
  private sinceMix = 0;
  private mix: Mix | null = null;
  private dialogueOpen = false;
  private stingUntil = 0;
  private transit: string | null = null;
  private workday = false;
  private now = 0;
  /** One-shots waiting for their moment (the uncanny repeat), on the game's own clock. */
  private delayed: Array<{ at: number; run: () => void }> = [];
  /** This place's positional sources (district `audioSources`). */
  private sources: Source[] = [];
  private off: Array<() => void> = [];

  static start(game: Phaser.Game): AudioSystem {
    AudioSystem.instance?.stop();
    AudioSystem.instance = new AudioSystem(game);
    // Dev-only handle for the browser pane and the Playground readout.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nqAudio = AudioSystem.instance;
    return AudioSystem.instance;
  }

  static get(): AudioSystem | null { return AudioSystem.instance; }

  private constructor(private game: Phaser.Game) {
    const on = gameEvents.on.bind(gameEvents);
    this.off.push(
      on('audio:cue', ({ token, at, volume }) => this.cue(token, at, volume)),
      on('audio:mode', ({ transit, workday }) => { if (transit !== undefined) this.transit = transit; if (workday !== undefined) this.workday = workday; this.sinceMix = MIX_EVERY_MS; }),
      on('district:entered', ({ districtId }) => { this.transit = null; this.workday = false; this.sinceMix = MIX_EVERY_MS; this.cue('a.hud.location_card_in'); this.placeSources(districtId); }),
      on('player:step', ({ x, y, running }) => this.step(x, y, running)),
      on('dialogue:started', () => { this.dialogueOpen = true; }),
      on('dialogue:ended', () => { this.dialogueOpen = false; }),
      on('dialogue:tick', ({ voice }) => this.cue(voice ? `a.sfx.npc.bleep.${voice}` : 'a.ui.type_tick')),
      on('quest:started', () => this.cue('a.hud.objective_new')),
      on('quest:completed', () => this.cue('a.hud.objective_done')),
      on('wallet:spent', () => this.cue('a.hud.money_out')),
      on('wallet:earned', ({ reason }) => this.cue(reason.startsWith('upi') ? 'a.phone.upi_success' : 'a.hud.money_in')),
      on('phone:buzz', ({ reason }) => this.cue(reason === 'unlock' ? 'a.phone.app_unlock_pop' : 'a.phone.buzz_short')),
      on('phone:message', () => this.cue('a.phone.chat_in')),
      on('photo:taken', () => this.cue('a.phone.camera_shutter')),
      on('save:written', () => this.cue('a.hud.autosave_tick')),
      on('time:slept', () => this.cue('a.sfx.player.wake_up')),
    );
    const unsub = useSettings.subscribe(() => this.applyVolumes());
    this.off.push(unsub);
    game.events.on(Phaser.Core.Events.POST_STEP, this.update, this);
    this.off.push(() => game.events.off(Phaser.Core.Events.POST_STEP, this.update, this));
  }

  stop(): void {
    for (const f of this.off) f();
    this.off = [];
    for (const l of [...this.beds.values(), ...(this.music ? [this.music] : []), ...this.fadingMusic, ...this.sources.flatMap((s) => (s.live ? [s.live] : []))]) l.sound.destroy();
    this.sources = [];
    this.beds.clear();
    this.music = null;
    this.fadingMusic = [];
    if (AudioSystem.instance === this) AudioSystem.instance = null;
  }

  /** What the mix decided last, the noise value and what is playing — the Playground's readout. */
  inspect(): { mix: Mix | null; noise: number; beds: Record<string, number>; music: string | null } {
    return { mix: this.mix, noise: Math.round(noise.value * 10) / 10, beds: Object.fromEntries([...this.beds].map(([k, l]) => [k, Math.round(l.gain * 100) / 100])), music: this.music?.token ?? null };
  }

  // ── Positional sources ───────────────────────────────────────────────────
  private placeSources(districtId: string): void {
    for (const s of this.sources) s.live?.sound.destroy();
    this.sources = [];
    // district:entered fires inside WorldScene.create (not yet "active"): read the scene directly.
    const world = this.game.scene.getScene(SCENE_KEYS.WORLD) as (Phaser.Scene & { pointOf?: (n: string) => { x: number; y: number } | null }) | null;
    for (const src of getDistrict(districtId).audioSources ?? []) {
      const at = world?.pointOf?.(src.at);
      if (!at) continue;
      const s: Source = { token: src.token, x: at.x, y: at.y, radius: src.radius ?? POSITIONAL_RADIUS_TILES, every: src.every ?? null, next: this.now + (src.every ? src.every[0] * 1000 * rng() : 0), live: null };
      this.sources.push(s);
      if (AUDIO[src.token]?.loop) this.startLoop(src.token, (sound) => { if (this.sources.includes(s)) s.live = { token: src.token, sound, gain: 0, target: 0, fadeMs: 1 }; else sound.destroy(); });
    }
  }

  private updateSources(): void {
    if (!this.world()) return;
    for (const s of this.sources) {
      if (s.live) { const p = this.positional(s, s.radius); s.live.gain = p.gain; (s.live.sound as Phaser.Sound.WebAudioSound).setPan?.(p.pan); continue; }
      if (s.every && this.now >= s.next) {
        this.cue(s.token, { x: s.x, y: s.y }, 1, s.radius);
        s.next = this.now + (s.every[0] + (s.every[1] - s.every[0]) * rng()) * 1000;
      }
    }
  }

  // ── The mix ──────────────────────────────────────────────────────────────
  private context(): MixContext {
    const s = useGameStore.getState();
    return {
      districtId: s.activeDistrict, transit: this.transit, workday: this.workday, minute: s.clock.minute,
      stability: 100, pacing: this.pacing(), chaseActive: false, reliefMs: 0, nearestInfected: null, stress: s.stats.stress,
    };
  }

  /** The current beat's pacing tag (ADR-24): the first active quest's next objective, matched to its scene's beat. */
  private pacing(): Pacing | null {
    const { quests } = useGameStore.getState();
    for (const [questId, done] of Object.entries(quests.active)) {
      const quest = QUESTS[questId];
      const next = quest?.objectives.find((o) => !done.includes(o.id));
      if (!next || next.type !== 'flag') continue;
      const scene = Object.values(SCENES).find((sc) => sc.quests?.includes(questId));
      const beat = scene?.beats?.find((b) => typeof b === 'object' && beatFlags(b.flag).includes(next.target));
      if (beat && typeof beat === 'object' && beat.pacing) return beat.pacing as Pacing;
    }
    return null;
  }

  private update(_time: number, delta: number): void {
    this.now += delta;
    if (this.delayed.length) { const due = this.delayed.filter((d) => d.at <= this.now); this.delayed = this.delayed.filter((d) => d.at > this.now); for (const d of due) d.run(); }
    // Noise floor from movement (ADR-49 tiles).
    const world = this.world();
    const body = world?.player?.body as Phaser.Physics.Arcade.Body | undefined;
    const speed = body ? Math.hypot(body.velocity.x, body.velocity.y) : 0;
    tickNoise(delta, speed < 1 ? NOISE.idle : speed > PLAYER_SPEED * 1.2 ? NOISE.run : NOISE.walk);

    this.sinceMix += delta;
    if (this.sinceMix >= MIX_EVERY_MS) {
      this.sinceMix = 0;
      this.followMix(mixFor(this.context()));
    }
    // Fades: each live sound moves toward its target at its own rate.
    const step = (l: Live) => {
      const rate = delta / Math.max(1, l.fadeMs);
      l.gain = l.gain < l.target ? Math.min(l.target, l.gain + rate) : Math.max(l.target, l.gain - rate);
    };
    for (const [k, l] of this.beds) {
      step(l);
      if (l.target === 0 && l.gain === 0) { l.sound.destroy(); this.beds.delete(k); }
    }
    if (this.music) step(this.music);
    this.updateSources();
    this.fadingMusic = this.fadingMusic.filter((l) => { step(l); if (l.gain === 0) { l.sound.destroy(); return false; } return true; });
    this.applyVolumes();
  }

  private followMix(mix: Mix): void {
    const changed = this.mix?.bed !== mix.bed;
    const placeChanged = this.mix && JSON.stringify(Object.keys(this.mix.bed).sort()) !== JSON.stringify(Object.keys(mix.bed).sort());
    this.mix = mix;
    if (changed) {
      for (const [token, gain] of Object.entries(mix.bed)) {
        const live = this.beds.get(token);
        if (live) { live.target = gain; live.fadeMs = FADE.district; continue; }
        this.startLoop(token, (sound) => this.beds.set(token, { token, sound, gain: 0, target: gain, fadeMs: placeChanged === false ? FADE.back : FADE.district }));
      }
      for (const [token, l] of this.beds) if (!(token in mix.bed)) { l.target = 0; l.fadeMs = FADE.district; }
    }
    if ((this.music?.token ?? null) !== mix.music) {
      const toward = mix.state === 'normal' ? FADE.back : FADE.approach;
      if (this.music) { this.music.target = 0; this.music.fadeMs = toward; this.fadingMusic.push(this.music); this.music = null; }
      if (mix.music) {
        const token = mix.music;
        this.startLoop(token, (sound) => {
          if (this.mix?.music !== token) { sound.destroy(); return; }
          this.music = { token, sound, gain: 0, target: 1, fadeMs: toward };
        });
      }
    }
  }

  private startLoop(token: string, then: (sound: Phaser.Sound.BaseSound) => void): void {
    const def = AUDIO[token];
    if (!def?.files.length) return;
    const file = def.files[Math.floor(rng() * def.files.length)];
    this.ensure(file, () => {
      const sound = this.game.sound.add(audioKey(file), { loop: true, volume: 0 });
      sound.play();
      then(sound);
    });
  }

  // ── One-shots ────────────────────────────────────────────────────────────
  /** Play a token once; `at` (world px) makes it positional. Cooldowns, variants, pitch and noise come from the manifest. */
  cue(token: string, at?: { x: number; y: number }, volume = 1, radius = POSITIONAL_RADIUS_TILES): void {
    const def = AUDIO[token];
    if (!def) { console.warn(`[AudioSystem] unknown token "${token}"`); return; }
    if (def.uncanny) { this.uncanny(def); return; }
    const last = this.lastPlayed.get(token) ?? -Infinity;
    if (this.now - last < def.cooldown) return;
    this.lastPlayed.set(token, this.now);
    if (def.noise) feedNoise(def.noise);
    if (!def.files.length) return;
    const pos = at ? this.positional(at, radius) : { gain: 1, pan: 0 };
    if (pos.gain <= 0.01) return;
    const file = def.files[Math.floor(rng() * def.files.length)];
    const detune = def.pitchVar ? 1200 * Math.log2(1 + (rng() * 2 - 1) * def.pitchVar) : 0;
    if (def.sting) this.stingUntil = this.now + 1200;
    this.ensure(file, () => {
      const v = def.volume * volume * pos.gain * busGain(def.bus, settings().audio) * (def.bus === 'music' || def.sting ? 1 : this.duckFor(def.bus));
      this.game.sound.play(audioKey(file), { volume: v, detune, pan: pos.pan });
    });
  }

  /** ADR-29 uncanny reuse: an early sound, slightly flat, repeated after a gap that is too long. */
  private uncanny(def: AudioToken): void {
    const u = def.uncanny!;
    const base = AUDIO[u.of];
    if (!base?.files.length) return;
    const file = base.files[0];
    const detune = 1200 * Math.log2(u.pitch);
    this.ensure(file, () => {
      const v = def.volume * busGain(def.bus, settings().audio);
      this.game.sound.play(audioKey(file), { volume: v, detune });
      this.delayed.push({ at: this.now + u.gapMs, run: () => this.game.sound.play(audioKey(file), { volume: v * 0.7, detune }) });
    });
  }

  /** Linear falloff to the radius (≤ 12 tiles), a gentle pan (±0.6) by x offset. */
  private positional(at: { x: number; y: number }, radiusTiles = POSITIONAL_RADIUS_TILES): { gain: number; pan: number } {
    const p = this.world()?.player;
    if (!p) return { gain: 1, pan: 0 };
    const r = Math.min(12, radiusTiles) * TILE_SIZE;
    const d = Math.hypot(at.x - p.x, at.y - p.y);
    return { gain: Math.max(0, 1 - d / r), pan: Math.max(-0.6, Math.min(0.6, (at.x - p.x) / r)) };
  }

  /** Footsteps (audio plan §2.8): the place's surface, a quieter step indoors is the recipe's job. */
  private step(_x: number, _y: number, running: boolean): void {
    const surface = surfaceOf(useGameStore.getState().activeDistrict);
    this.cue(`a.sfx.player.step.${surface}`, undefined, running ? 1.3 : 1);
  }

  // ── Volumes ──────────────────────────────────────────────────────────────
  private duckFor(bus: Bus): number {
    if (this.now < this.stingUntil) return DUCK.sting;
    if (bus === 'music' && this.dialogueOpen) return DUCK.dialogue;
    return 1;
  }

  private applyVolumes(): void {
    const s = settings().audio;
    const set = (l: Live) => {
      const def = AUDIO[l.token];
      (l.sound as Phaser.Sound.WebAudioSound).setVolume?.(def.volume * l.gain * busGain(def.bus, s) * this.duckFor(def.bus));
    };
    for (const l of this.beds.values()) set(l);
    if (this.music) set(this.music);
    for (const l of this.fadingMusic) set(l);
    for (const s of this.sources) if (s.live) set(s.live);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  /** Load a file on first use through the MenuScene's loader (that scene never stops). */
  private ensure(file: string, then: () => void): void {
    const key = audioKey(file);
    if (this.game.cache.audio.exists(key)) { then(); return; }
    const url = AUDIO_URLS[file];
    if (!url) { console.warn(`[AudioSystem] no rendered file "${file}" (run pnpm audio)`); return; }
    const scene = this.game.scene.getScene(SCENE_KEYS.MENU);
    if (!scene) return;
    scene.load.once(`filecomplete-audio-${key}`, () => then());
    if (this.loading.has(key)) return;
    this.loading.add(key);
    scene.load.audio(key, url);
    if (!scene.load.isLoading()) scene.load.start();
  }

  private world(): (Phaser.Scene & { player?: Phaser.GameObjects.Sprite }) | null {
    const w = this.game.scene.getScene(SCENE_KEYS.WORLD) as (Phaser.Scene & { player?: Phaser.GameObjects.Sprite }) | null;
    return w && this.game.scene.isActive(SCENE_KEYS.WORLD) ? w : null;
  }
}
