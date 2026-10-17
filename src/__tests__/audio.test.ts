import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIO, BEDS } from '../audio/data';
import { bandFor, bedFor, mixFor, musicFor, musicState, surfaceOf, timeOfDay, type MixContext } from '../audio/mix';
import { busGain } from '../audio/buses';
import { voiceOf } from '../audio/voices';
import { DISTRICTS, CARDS } from '../data';
import { NOISE, feedNoise, noise, resetNoise, tickNoise } from '../systems/noise';
import { validateAudio } from '../../scripts/validate-content';

const src = join(__dirname, '..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const ctx = (over: Partial<MixContext> = {}): MixContext => ({ districtId: 'whitefield_street', transit: null, workday: false, minute: 12 * 60, stability: 100, pacing: null, chaseActive: false, reliefMs: 0, nearestInfected: null, stress: 0, ...over });

describe('the mix (audio plan v1 §2.4, ADR-29/139)', () => {
  it('times of day', () => {
    expect(timeOfDay(6 * 60)).toBe('dawn');
    expect(timeOfDay(12 * 60)).toBe('day');
    expect(timeOfDay(18 * 60)).toBe('evening');
    expect(timeOfDay(23 * 60)).toBe('night');
    expect(timeOfDay(2 * 60)).toBe('night');
  });

  it('a street sounds different by day and by night', () => {
    const day = bedFor(ctx());
    const night = bedFor(ctx({ minute: 23 * 60 }));
    expect(day['a.bed.city_traffic']).toBeGreaterThan(night['a.bed.city_traffic']);
    expect(night['a.bed.crickets']).toBeGreaterThan(0);
    expect(day['a.bed.crickets']).toBeUndefined();
  });

  it('stability bands make the city quieter, never louder: people go first, then everything but the eerie', () => {
    expect(['normal', 'warning', 'infected', 'deep'].map((b) => bandFor({ normal: 80, warning: 70, infected: 50, deep: 10 }[b]!))).toEqual(['normal', 'warning', 'infected', 'deep']);
    const sum = (b: Record<string, number>, kind: keyof typeof BEDS.kinds) => Object.entries(b).filter(([t]) => BEDS.kinds[kind].includes(t.slice(6))).reduce((n, [, g]) => n + g, 0);
    const n = bedFor(ctx()), w = bedFor(ctx({ stability: 70 })), i = bedFor(ctx({ stability: 50 })), d = bedFor(ctx({ stability: 10 }));
    expect(sum(w, 'human')).toBeLessThan(sum(n, 'human'));
    expect(sum(i, 'human')).toBe(0);
    expect(sum(i, 'traffic')).toBe(0);
    expect(Object.keys(d).sort()).toEqual(['a.bed.groans_sporadic', 'a.bed.heartbeat_bed', 'a.bed.silence_room_tone']);
  });

  it('the state machine: chase > relief > heartbeat > drone > normal', () => {
    expect(musicState(ctx({ chaseActive: true, reliefMs: 100 }))).toBe('chase');
    expect(musicState(ctx({ reliefMs: 100, pacing: 'Tense' }))).toBe('relief');
    expect(musicState(ctx({ nearestInfected: 5 }))).toBe('heartbeat');
    expect(musicState(ctx({ pacing: 'Tense' }))).toBe('heartbeat');
    expect(musicState(ctx({ pacing: 'Curious' }))).toBe('drone');
    expect(musicState(ctx({ stability: 79 }))).toBe('drone');
    expect(musicState(ctx({ stability: 80 }))).toBe('normal');
    expect(musicState(ctx())).toBe('normal');
  });

  it('music stays under the city: calm by day, evening at dusk, none at night, none on a bus or in a room', () => {
    expect(musicFor('normal', ctx())).toBe('a.music.calm');
    expect(musicFor('normal', ctx({ minute: 18 * 60 }))).toBe('a.music.evening');
    expect(musicFor('normal', ctx({ minute: 23 * 60 }))).toBeNull();
    expect(musicFor('normal', ctx({ transit: 'bus' }))).toBeNull();
    expect(musicFor('normal', ctx({ districtId: 'whitefield_hotel' }))).toBeNull();
    expect(musicFor('heartbeat', ctx({ districtId: 'hivr_corridor' }))).toBe('a.music.tense'); // a room can still turn
  });

  it('a ride card and the workday play their own beds', () => {
    expect(Object.keys(mixFor(ctx({ transit: 'bus' })).bed)).toEqual(['a.bed.vayu_vajra_bus']);
    expect(Object.keys(mixFor(ctx({ workday: true })).bed)).toEqual(['a.bed.office']);
  });

  it('Act 0 is fully wired: the airport kerb, the Vayu Vajra bed, chai Anna and the bus at the stop as sources', () => {
    expect(Object.keys(bedFor(ctx({ districtId: 'airport' })))).toEqual(expect.arrayContaining(['a.bed.airport_interior', 'a.bed.city_traffic']));
    expect(surfaceOf('airport')).toBe('tile');
    expect(DISTRICTS.airport.audioSources!.map((s) => s.token)).toEqual(expect.arrayContaining(['a.sfx.npc.sig.chai_whistle', 'a.sfx.npc.sig.ladle', 'a.sfx.vehicle.bus.idle']));
  });

  it('every place has a bed and a footstep surface', () => {
    for (const id of Object.keys(DISTRICTS)) {
      expect(Object.keys(bedFor(ctx({ districtId: id }))).length, id).toBeGreaterThan(0);
      expect(AUDIO[`a.sfx.player.step.${surfaceOf(id)}`], id).toBeDefined();
    }
  });
});

describe('buses follow Settings → Audio', () => {
  const s = { master: 80, music: 50, sfx: 100, ambience: 25, muted: false };
  it('master × the bus slider; UI follows SFX; voice follows master; mute silences all', () => {
    expect(busGain('music', s)).toBeCloseTo(0.4);
    expect(busGain('ambience', s)).toBeCloseTo(0.2);
    expect(busGain('ui', s)).toBeCloseTo(busGain('sfx', s));
    expect(busGain('voice', s)).toBeCloseTo(0.8);
    for (const b of ['music', 'ambience', 'sfx', 'ui', 'voice'] as const) expect(busGain(b, { ...s, muted: true })).toBe(0);
  });
});

describe('noise (ADR-49 tiles)', () => {
  beforeEach(() => resetNoise());
  it('movement sets the floor; a loud sound lifts it and decays back over 1.5 s', () => {
    expect([NOISE.crouch, NOISE.walk, NOISE.run, NOISE.fight]).toEqual([2, 5, 8, 12]);
    tickNoise(16, NOISE.walk);
    expect(noise.value).toBe(5);
    feedNoise(12);
    expect(noise.value).toBe(12);
    tickNoise(750, NOISE.walk);
    expect(noise.value).toBeCloseTo(6);
    tickNoise(800, NOISE.walk);
    expect(noise.value).toBe(5);
  });

  it('the footsteps and the loud things feed it', () => {
    expect(AUDIO['a.sfx.player.step.concrete'].noise).toBe(5);
    expect(AUDIO['a.sfx.combat.hit_pipe'].noise).toBe(12);
    expect(AUDIO['a.sfx.vehicle.scooter.rev'].noise).toBeGreaterThan(8);
  });
});

describe('the manifest (audio plan v1 §3)', () => {
  it('validates: files, licences, beds, sources, cues, budget', () => {
    const dir = join(src, 'assets/audio');
    const files = new Map(readdirSync(dir).filter((f) => /\.(wav|ogg|m4a)$/.test(f)).map((f) => [f, statSync(join(dir, f)).size] as [string, number]));
    const manifest = JSON.parse(readFileSync(join(src, 'data/audio/manifest.json'), 'utf8'));
    const beds = JSON.parse(readFileSync(join(src, 'data/audio/beds.json'), 'utf8'));
    expect(validateAudio(manifest, beds, Object.values(DISTRICTS), Object.values(CARDS), files, readFileSync(join(dir, 'LICENSES.md'), 'utf8'))).toEqual([]);
  });

  it('only CC0, the user\'s recordings and original work', () => {
    for (const e of Object.values(AUDIO)) expect(['CC0', 'user-recording', 'original']).toContain(e.licence);
    const bad = validateAudio({ tokens: { 'a.ui.x': { files: ['nope'], bus: 'ui', licence: 'CC-BY-NC', tier: 'final', volume: 1 } } }, { districts: {} }, [], [], new Map(), '');
    expect(bad.join('\n')).toMatch(/licence "CC-BY-NC" is not allowed/);
    expect(bad.join('\n')).toMatch(/not in src\/assets\/audio/);
  });

  it('covers the brief: beds, music, player, NPCs, vehicles, UI, phone, HUD, world, infected, combat, City Pulse, stings, uncanny', () => {
    const groups = new Set(Object.keys(AUDIO).map((t) => t.split('.').slice(0, 3).join('.')));
    for (const g of ['a.bed', 'a.music', 'a.ui', 'a.phone', 'a.hud', 'a.sting', 'a.uncanny'].map((x) => x)) expect([...groups].some((k) => k.startsWith(g)), g).toBe(true);
    for (const g of ['player', 'npc', 'vehicle', 'world', 'infected', 'combat', 'pulse']) expect(groups.has(`a.sfx.${g}`), g).toBe(true);
    expect(Object.keys(AUDIO).length).toBeGreaterThanOrEqual(200);
    // Ravi's signature is the APPA ringtone; Act 4 nights are your own G–C–D (audio plan §9).
    expect(AUDIO['a.sfx.npc.sig.appa_ringtone']).toBeDefined();
    expect(AUDIO['a.music.base_night'].source).toBe('songs/base_night.json');
  });
});

describe('nothing plays a sound but the AudioSystem (lint)', () => {
  const code = walk(src).filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'));
  it('no sound.play / sound.add / new Audio( outside src/audio', () => {
    const offenders = code.filter((f) => !f.includes(`${join('src', 'audio')}`) && /\bsound\.(play|add)\(|new Audio\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every token literal in the code is in the manifest', () => {
    const missing: string[] = [];
    for (const f of code) for (const m of readFileSync(f, 'utf8').matchAll(/'(a\.(?:bed|music|sfx|ui|phone|hud|sting|uncanny)\.[a-z0-9_.]*[a-z0-9_])'/g)) if (!AUDIO[m[1]]) missing.push(`${f}: ${m[1]}`);
    expect(missing).toEqual([]);
  });
});

describe('voices', () => {
  it('a named NPC bleeps in their voice; narration ticks', () => {
    expect(voiceOf('dlg_chai_anna')).toEqual({ voice: 'adult_m' });
    expect(voiceOf('dlg_divya_monday')).toEqual({ voice: 'adult_f' });
    expect(voiceOf('dlg_sealed_door')).toEqual({});
  });
});

describe('A2: every scene, the Act 4 states (ADR-140)', () => {
  it('footsteps by area: street tiles and spec surfaces', async () => {
    const { streetSurface } = await import('../audio/mix');
    expect(['road', 'road_dash_h', 'paver_crack', 'kerb_top', 'puddle', 'bench'].map(streetSurface)).toEqual(['asphalt', 'asphalt', 'concrete', 'concrete', 'puddle', null]);
    const tmj = JSON.parse(readFileSync(join(src, 'assets/tilemaps/cubbon_park.tmj'), 'utf8'));
    const surfaces = tmj.layers.find((l: { name: string }) => l.name === 'spawns').objects.filter((o: { type: string }) => o.type === 'surface').map((o: { name: string }) => o.name.split('_')[1]);
    expect(new Set(surfaces)).toEqual(new Set(['concrete', 'gravel']));
    expect(surfaceOf('cubbon_park')).toBe('grass');
  });

  it('people fall silent as a place turns; machines carry on', async () => {
    const { sourceScale } = await import('../audio/mix');
    expect(['normal', 'warning', 'infected', 'deep'].map((b) => sourceScale('human', b as never))).toEqual([1, 0.5, 0, 0]);
    expect(sourceScale('machine', 'deep')).toBe(1);
    // …and the chai stall turns uncanny: the whistle with nobody there.
    expect(DISTRICTS.airport.audioSources!.find((s) => s.token === 'a.sfx.npc.sig.chai_whistle')!.uncanny).toBe('a.uncanny.chai_whistle_empty');
  });

  it('the heartbeat rises as an infected comes closer', () => {
    expect(mixFor(ctx({ nearestInfected: 8 })).bed['a.bed.heartbeat_bed'] ?? 0).toBe(0);
    expect(mixFor(ctx({ nearestInfected: 4 })).bed['a.bed.heartbeat_bed']).toBeCloseTo(0.5);
    expect(mixFor(ctx({ nearestInfected: 0 })).bed['a.bed.heartbeat_bed']).toBe(1);
  });

  it('most places have sound sources, each on a spot their map has (validated) and a real token', () => {
    const withSources = Object.values(DISTRICTS).filter((d) => d.audioSources?.length).map((d) => d.id);
    expect(withSources.length).toBeGreaterThanOrEqual(18);
    for (const d of Object.values(DISTRICTS)) for (const s of d.audioSources ?? []) expect(AUDIO[s.token], `${d.id} ${s.token}`).toBeDefined();
  });
});

describe('A3: real sounds (ADR-141b)', () => {
  it('Kenney batch: final, CC0, one raw source per file, each beside its pack licence', () => {
    const finals = Object.entries(AUDIO).filter(([, e]) => e.tier === 'final');
    expect(finals.length).toBeGreaterThanOrEqual(60);
    for (const [t, e] of finals) {
      expect(e.licence, t).toBe('CC0');
      const raw = (e as unknown as { raw: string[] }).raw;
      expect(raw.length, t).toBe(e.files.length);
      for (const r of raw) {
        expect(statSync(join(src, 'assets/_raw/audio', r)).isFile(), r).toBe(true);
        expect(readFileSync(join(src, 'assets/_raw/audio', r.split('/').slice(0, -1).join('/'), 'License.txt'), 'utf8')).toMatch(/CC0/);
      }
    }
    // The real footsteps, UI and money sounds replaced their placeholders.
    for (const t of ['a.sfx.player.step.concrete', 'a.ui.confirm', 'a.hud.money_in', 'a.phone.tap']) expect(AUDIO[t].tier, t).toBe('final');
  });

  it('a final sound with no licence file beside it fails validation', () => {
    const p = validateAudio({ tokens: { 'a.ui.x': { files: ['x'], raw: ['somewhere/x.ogg'], bus: 'ui', licence: 'CC0', tier: 'final', volume: 1 } } }, { districts: {} }, [], [], new Map([['x.wav', 10]]), '`x.wav`', [], (rel) => rel === 'somewhere/x.ogg');
    expect(p.join('\n')).toMatch(/no licence file beside it/);
  });
});
