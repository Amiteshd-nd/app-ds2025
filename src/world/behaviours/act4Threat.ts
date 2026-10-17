import type Phaser from 'phaser';
import { MAPS } from '../../assets/maps';
import { gameEvents } from '../../core/events';
import { depthForZY, feetY } from '../../core/depth';
import { ITEMS } from '../../data';
import { useGameStore } from '../../store';
import { ENCOUNTER, ambushSize, pickCover, rolls } from '../../systems/encounters';
import { FAIL_FORWARD, HARM, hitKind, itemsLost, startBleed, tickBleed, type Bleed } from '../../systems/harm';
import { EVOLVED, INFECTED, brain, detects, evolvedAllowed, hears, struck, stun, think, type InfectedBrain, type Point, type Tier } from '../../systems/infected';
import { field, knockback, lureFor, smokeBlocks, stunFor, swingHits } from '../../systems/combat';
import { DISTRICTS } from '../../data';
import { STOCK } from '../../systems/trade';
import { baseActive } from './act4Base';
import LOOKS from '../../data/infected/looks.json';
import { InventoryManager } from '../../systems/InventoryManager';
import { isNight } from '../../systems/night';
import { noise } from '../../systems/noise';
import { playerState } from '../../systems/playerState';
import { ReputationManager } from '../../systems/ReputationManager';
import { mulberry32, seedOf } from '../../systems/rng';
import { ACT4_DAY, ACT4_FLAG, GRADES, act4DayOf, act4DefOf, grade, stageFor } from '../../systems/stability';
import { stabilityNow } from '../../systems/stabilityNow';
import { StatsManager } from '../../systems/StatsManager';
import { resetThreat, threat, threatDebug } from '../../systems/threat';
import { TimeManager } from '../../systems/TimeManager';
import { color } from '../../ui/tokens';
import { FEET_BOX, TILE_SIZE } from '../../utils/constants';
import type { Act4Zone, InfectedPack } from '../../utils/types';
import { navOf, withDiscs, type Nav } from '../nav';
import { astar, cellAt, cellCentre, corners, FEET_DY, lineFree, nearestFree, smooth, type Grid } from '../walkgrid';
import type { Behaviour } from './index';

/** Paths are planned again this often (infected doc §7: every 500 ms, for phones). */
const REPLAN_MS = 500;
/** Within this many px of a target = arrived. */
const ARRIVE_PX = 8;
/** A former NPC's name shows faintly within this many tiles (ADR-34). */
const NAME_TILES = 2;

interface Body extends Phaser.GameObjects.Sprite { body: Phaser.Physics.Arcade.Body }

interface Infected {
  sprite: Body;
  brain: InfectedBrain;
  zone: ZoneRt;
  sheet: string;
  /** Its alert / lunge / stagger sheet, if it has one. */
  actions: string | null;
  /** An action pose held until a time: [column, until]. */
  pose: [number, number] | null;
  pack: string;
  lead: boolean;
  path: Point[];
  planned: number;
  plannedFor: Point | null;
  ambush: boolean;
  /** Closest it came during this chase (narrow escapes). */
  closest: number;
  /** A noise it walks toward while it doesn't see you (the balconies). */
  drawnTo: Point | null;
  name: Phaser.GameObjects.Text | null;
  /** A knockback in flight: this velocity until then (ADR-151). */
  shove: { vx: number; vy: number; until: number } | null;
}

interface Rect { x: number; y: number; w: number; h: number }
interface ZoneRt { def: Act4Zone; px: Rect; cover: Point[]; hide: Point[]; rate: number }

const inside = (r: Rect, p: Point) => p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const tiles = (p: [number, number]): Point => [(p[0] + 0.5) * TILE_SIZE, (p[1] + 0.5) * TILE_SIZE];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * act4Threat (Act 4 plan §3.2–3.5, ADR-145) — the infected in a place, from
 * data: `act4Zones` (where they live, where ambushes roll, cover, hide spots),
 * `infected.packs` (who stands where, appearing once the place's grade reaches
 * `minLevel`) and `uv` (lamps they never enter). Their minds are
 * `systems/infected.think`; this only senses, moves and applies the results:
 * a touch hurts (`systems/harm`), 0 health in Act 4 fails forward to the base,
 * and every 8 steps in a rolling zone may bring an ambush from cover
 * (`systems/encounters`). Every roll is seeded by place + Act 4 day, so a run
 * plays the same twice. A place with none of this data costs nothing.
 */
export const act4Threat: Behaviour = {
  attach({ scene, district, map, player, reducedMotion, playerFree, playCard }) {
    resetThreat();
    playerState.onHideSpot = false;
    const zonesDef = district.act4Zones ?? [];
    const packs = district.infected?.packs ?? [];
    // A base's lamp burns while the generator has fuel and it isn't the night it fails (ADR-149).
    const baseUV = district.base && baseActive(district, useGameStore.getState().flags) && (useGameStore.getState().counters[STOCK.fuel] ?? 0) > 0 ? district.base.uv : [];
    const flagsNow = useGameStore.getState().flags, fuelNow = (useGameStore.getState().counters[STOCK.fuel] ?? 0) > 0;
    const placeUV = (district.uv ?? []).filter((u) => (!u.requiresFlag || flagsNow[u.requiresFlag]) && (!u.fuelAfter || !flagsNow[u.fuelAfter] || fuelNow));
    const uvs = [...placeUV, ...baseUV].map((u) => ({ x: tiles(u.at)[0], y: tiles(u.at)[1], r: u.radius * TILE_SIZE }));
    if (!zonesDef.length && !packs.length && !uvs.length) return;

    const store = () => useGameStore.getState();
    const day = act4DayOf(store());
    const rng = mulberry32(seedOf(`${district.id}:${day ?? store().counters[ACT4_DAY] ?? 0}`));
    const level = grade(stabilityNow(district.id));
    const zones: ZoneRt[] = zonesDef.map((z) => ({
      def: z,
      px: { x: z.rect[0] * TILE_SIZE, y: z.rect[1] * TILE_SIZE, w: z.rect[2] * TILE_SIZE, h: z.rect[3] * TILE_SIZE },
      cover: (z.cover ?? []).map(tiles),
      hide: (z.hide ?? []).map(tiles),
      rate: z.encounterRate === undefined || z.encounterRate === 'auto' ? GRADES[level].encounterRate : z.encounterRate,
    }));
    const hideSpots = zones.flatMap((z) => z.hide);
    const zoneAt = (p: Point) => zones.find((z) => inside(z.px, p)) ?? null;
    const inUV = (p: Point) => uvs.some((u) => Math.hypot(p[0] - u.x, p[1] - u.y) <= u.r);

    // UV lamps: a soft purple disc on the ground (placeholder glow until the lamp art, ADR-25).
    const glow = scene.add.graphics().setDepth(depthForZY(0) - 0.0001);
    for (const u of uvs) { glow.fillStyle(color('accent.uv'), 0.12); glow.fillCircle(u.x, u.y, u.r); glow.fillStyle(color('accent.uv'), 0.18); glow.fillCircle(u.x, u.y, u.r * 0.5); }

    let nav: Nav | null = null;
    let infGrid: Grid | null = null;
    const infected: Infected[] = [];
    const playerFeet = (): Point => { const b = player.body as Phaser.Physics.Arcade.Body; return [b.center.x, b.center.y]; };
    const feetOf = (s: Body): Point => [s.body.center.x, s.body.center.y];
    const pointOf = (name: string): Point | null => { const q = (scene as unknown as { pointOf(n: string): { x: number; y: number } | null }).pointOf(name); return q ? [q.x, q.y] : null; };

    // The look (ADR-147): a person's Fresh / Degraded self by days since this place fell; the Evolved are their own sheets.
    const def = act4DefOf(district, (id) => DISTRICTS[id]);
    const stage: 'fresh' | 'degraded' = def && day !== null ? (stageFor(day - def.fallDay) === 'fresh' ? 'fresh' : 'degraded') : 'degraded';
    const bodyOf = (source: string): 'male' | 'female' | 'elder' => (LOOKS.sources.find((x) => x.sheet === source)?.body as 'male' | 'female' | 'elder' | undefined) ?? (/female/.test(source) ? 'female' : /elder/.test(source) ? 'elder' : 'male');
    const lookFor = (source: string, tier: Tier): { sheet: string; tinted: boolean } => {
      const want = tier === 'evolved' ? `inf_evolved_${bodyOf(source)}` : source.startsWith('inf_evolved_') ? source : `inf_${tier}_${source}`;
      if (scene.textures.exists(want)) return { sheet: want, tinted: false };
      return { sheet: scene.textures.exists(source) ? source : '__DEFAULT', tinted: true };
    };
    /** Action poses (alert / lunge / stagger) exist for the generated bodies only; people's own sheets twitch instead. */
    const actionsFor = (sheet: string): string | null => {
      const m = /^(?:inf_(?:fresh|degraded)_)?inf_(base|evolved)_(male|female|elder)(?:_\d)?$/.exec(sheet);
      const key = m ? `inf_${m[1]}_${m[2]}_actions` : null;
      return key && scene.textures.exists(key) ? key : null;
    };

    const spawn = (at: Point, source: string, zone: ZoneRt, pack: string, lead: boolean, mode: InfectedBrain['mode'], ambush: boolean, former?: string, tier: Tier = stage, drawnTo: Point | null = null) => {
      const free = nearestFree(nav!.walk, cellAt(nav!.walk, at[0], at[1]), 6);
      const [fx, fy] = free >= 0 ? cellCentre(nav!.walk, free) : at;
      const look = lookFor(source, tier);
      const sprite = scene.add.sprite(fx, fy - FEET_DY, look.sheet) as Body;
      scene.physics.add.existing(sprite);
      sprite.body.setSize(FEET_BOX.w, FEET_BOX.h);
      sprite.body.setOffset(FEET_BOX.offsetX, FEET_BOX.offsetY);
      // No derived sheet yet (a person the recipe hasn't reached): the old grey tint stands in.
      if (look.tinted) sprite.setTint(color('infected.skin'));
      const namma = Boolean(former && store().met.includes(former) && ReputationManager.getInstance().tier >= 2);
      const name = former ? scene.add.text(fx, fy - 60, '', { fontSize: '8px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0) : null;
      if (name) name.setText(former!.replace(/^npc_/, '').replace(/_/g, ' '));
      const b = brain(mode, namma, tier);
      // Coming out already turning on you (the khaki shirt): it growls as it appears.
      if (mode === 'alert') { b.lastSeen = playerFeet(); gameEvents.emit('audio:cue', { token: 'a.sfx.infected.shriek', at: { x: fx, y: fy } }); }
      infected.push({ sprite, brain: b, zone, sheet: look.sheet, actions: actionsFor(look.sheet), pose: mode === 'alert' && actionsFor(look.sheet) ? [0, now + INFECTED.growlMs] : null, pack, lead, path: [], planned: -Infinity, plannedFor: null, ambush, closest: Infinity, name, drawnTo, shove: null });
    };

    const placed = new Set<string>();
    let evolvedHere = 0;
    const placePacks = () => {
      const stability = stabilityNow(district.id);
      const lvl = grade(stability);
      for (const p of packs as InfectedPack[]) {
        if (placed.has(p.id)) continue;
        if (lvl < (p.minLevel ?? 2)) continue;
        if (p.requiresFlag && !store().flags[p.requiresFlag]) continue;
        if (p.unlessFlag && store().flags[p.unlessFlag]) continue;
        placed.add(p.id);
        const zone = zones.find((z) => z.def.id === p.zone);
        if (!zone) { console.error(`[act4Threat] pack "${p.id}" names zone "${p.zone}", not in act4Zones`); continue; }
        // A scripted run starts behind you (4.1): of the candidates, the nearest one further than you from the way out.
        let lead = tiles(p.lead);
        if (p.leadOptions?.length && p.awayFrom) {
          const out = pointOf(p.awayFrom);
          const me = playerFeet();
          if (out) {
            const cands = p.leadOptions.map(tiles);
            const behind = cands.filter((c) => dist(c, out) > dist(me, out) + 2 * TILE_SIZE && dist(c, me) >= 3 * TILE_SIZE);
            lead = behind.length ? behind.reduce((a, b) => (dist(a, me) <= dist(b, me) ? a : b)) : cands.reduce((a, b) => (dist(a, out) >= dist(b, out) ? a : b));
          }
        }
        const size = p.size ?? 1;
        // The Evolved (addendum §2b): rare — under 25 stability, after the café, ≤ 1 a pack, ≤ 2 a place, never by a lamp.
        const uvEdge = uvs.length ? Math.min(...uvs.map((u) => (Math.hypot(lead[0] - u.x, lead[1] - u.y) - u.r) / TILE_SIZE)) : Infinity;
        let evolvedInPack = 0;
        const evolvedSlot = (i: number) => {
          if ((p.evolved ?? 0) <= evolvedInPack || i !== size - 1) return false;
          if (!evolvedAllowed({ stability, flags: store().flags, inPlace: evolvedHere, inPack: evolvedInPack, tilesFromUVEdge: uvEdge })) return false;
          evolvedInPack += 1; evolvedHere += 1; return true;
        };
        const drawn = p.drawnTo ? pointOf(p.drawnTo) : null;
        spawn(lead, p.sheets[0], zone, p.id, true, p.startMode ?? 'wander', false, p.former, evolvedSlot(0) ? 'evolved' : stage, drawn);
        for (let i = 1; i < size; i++) {
          const a = (i / Math.max(1, size - 1)) * Math.PI * 2;
          spawn([lead[0] + Math.cos(a) * TILE_SIZE * 1.5, lead[1] + Math.sin(a) * TILE_SIZE * 1.5], p.sheets[i % p.sheets.length], zone, p.id, false, drawn ? 'wander' : (p.startMode ?? 'idle'), false, undefined, evolvedSlot(i) ? 'evolved' : stage, drawn);
        }
      }
    };

    /** A point to stroll to inside the zone (seeded). */
    const strollIn = (z: ZoneRt) => (): Point | null => {
      for (let k = 0; k < 12; k++) {
        const p: Point = [z.px.x + rng() * z.px.w, z.px.y + rng() * z.px.h];
        const i = cellAt(infGrid!, p[0], p[1]);
        if (i >= 0 && !infGrid!.blocked[i]) return p;
      }
      return null;
    };

    const plan = (inf: Infected, target: Point, now: number) => {
      const z = inf.zone.px;
      const goalPt: Point = [clamp(target[0], z.x + 4, z.x + z.w - 4), clamp(target[1], z.y + 4, z.y + z.h - 4)];
      const start = nearestFree(infGrid!, cellAt(infGrid!, ...feetOf(inf.sprite)), 4);
      const goal = nearestFree(infGrid!, cellAt(infGrid!, goalPt[0], goalPt[1]), 6);
      inf.planned = now; inf.plannedFor = target;
      if (start < 0 || goal < 0) { inf.path = []; return; }
      const cells = astar(infGrid!, start, (i) => i === goal, goalPt);
      // `corners` already leaves out the start: a straight run is one point, and dropping it froze the chase (S2 bug).
      inf.path = cells ? smooth(infGrid!, corners(infGrid!, cells)) : [];
    };

    // ── Harm ───────────────────────────────────────────────────────────────
    let lastHit: number | null = null;
    let bleed: Bleed | null = null;
    /** An Evolved got you here: stress stays in the red until you leave the place (addendum §2b). */
    let stressRed = false;
    let lastEscape = -Infinity;
    let failing = false;
    const failForward = () => {
      if (failing) return;
      failing = true;
      const inv = store().inventory;
      const counts = new Map<string, number>();
      for (const id of inv) counts.set(id, (counts.get(id) ?? 0) + 1);
      const lost = itemsLost([...counts].map(([id, count]) => ({ id, count, key: ITEMS[id]?.type === 'key_item' })));
      for (const l of lost) InventoryManager.getInstance().remove(l.id, l.count);
      const stats = StatsManager.getInstance();
      stats.adjust('stress', FAIL_FORWARD.stress);
      stats.adjust('health', FAIL_FORWARD.wakeHealth - store().stats.health);
      // A place with its own fail card tells the night itself (4.1's lane holds at the hill); otherwise a night passes here.
      const failCard = district.failCard && !(district.failCardUntil && store().flags[district.failCardUntil]) ? district.failCard : undefined;
      if (!failCard) TimeManager.getInstance().sleep();
      // Home is the base you last woke in (ADR-149); the card's own landing until you have one.
      const home = Object.keys(store().flags).find((f) => f.startsWith('base_home:') && store().flags[f])?.slice('base_home:'.length);
      const homeDef = home ? DISTRICTS[home] : undefined;
      playCard(failCard ?? 'card_fail_forward', !failCard && homeDef?.base ? { district: homeDef.id, spawn: homeDef.base.spawn } : undefined);
    };
    const hurt = (inf: Infected, now: number) => {
      const kind = hitKind(lastHit, now);
      lastHit = now;
      const h = HARM[kind];
      const evolved = inf.brain.tier === 'evolved';
      // The Evolved's double swipe (addendum §2b): two hearts, stress ×2, a tile of knockback, and bleeding.
      StatsManager.getInstance().adjust('health', evolved ? EVOLVED.hit.health : h.health);
      StatsManager.getInstance().adjust('stress', evolved ? EVOLVED.hit.stress : h.stress);
      if (evolved) {
        bleed = startBleed(now, EVOLVED.bleed);
        stressRed = true;
        gameEvents.emit('ui:toast', { text: 'Bleeding. Get to the light.' });
        const [ix, iy] = feetOf(inf.sprite), [px0, py0] = playerFeet();
        const len = Math.hypot(px0 - ix, py0 - iy) || 1;
        const to: Point = [px0 + ((px0 - ix) / len) * EVOLVED.hit.knockbackTiles * TILE_SIZE, py0 + ((py0 - iy) / len) * EVOLVED.hit.knockbackTiles * TILE_SIZE];
        const cell = nearestFree(nav!.walk, cellAt(nav!.walk, to[0], to[1]), 2);
        if (cell >= 0) { const [cx, cy] = cellCentre(nav!.walk, cell); player.setPosition(cx, cy - FEET_DY); (player.body as Phaser.Physics.Arcade.Body).reset(player.x, player.y); }
      }
      if (inf.actions) inf.pose = [1, now + 300];
      struck(inf.brain);
      gameEvents.emit('audio:cue', { token: 'a.sfx.infected.hit' });
      gameEvents.emit('audio:cue', { token: 'a.sfx.player.hurt' });
      if (!reducedMotion) scene.cameras.main.shake(120, 0.006);
      scene.cameras.main.flash(80, 160, 40, 30);
      if (store().stats.health <= 0 && store().flags[ACT4_FLAG]) failForward();
    };

    // ── Ambushes ───────────────────────────────────────────────────────────
    let steps = 0;
    let ambushUntil = -1;
    let now = 0;
    const offStep = gameEvents.on('player:step', () => {
      if (!nav || failing || !playerFree()) return;
      const p = playerFeet();
      const z = zoneAt(p);
      if (!z || z.rate <= 0 || inUV(p) || ambushUntil > now) return;
      steps += 1;
      if (steps % ENCOUNTER.everySteps !== 0) return;
      if (!rolls(z.rate, playerState.crouching, rng)) return;
      const cover = pickCover(z.cover, p);
      if (!cover) return;
      ambushUntil = now + ENCOUNTER.maxMs;
      const n = ambushSize(rng);
      const sheets = packs.flatMap((pk) => pk.sheets);
      for (let i = 0; i < n; i++) spawn([cover[0] + (i - (n - 1) / 2) * TILE_SIZE * 0.8, cover[1]], sheets[i % Math.max(1, sheets.length)] ?? '__DEFAULT', z, `ambush:${now}`, i === 0, 'alert', true);
      scene.cameras.main.flash(ENCOUNTER.flashMs, 255, 255, 255);
      gameEvents.emit('audio:cue', { token: 'a.sting.detect' });
      if (!reducedMotion) {
        scene.physics.world.timeScale = 1 / ENCOUNTER.slowMo;
        scene.tweens.timeScale = ENCOUNTER.slowMo;
        scene.time.delayedCall(ENCOUNTER.slowMoMs, () => { if (scene.physics?.world) scene.physics.world.timeScale = 1; scene.tweens.timeScale = 1; });
      }
    });

    // ── Your hands (ADR-151) ───────────────────────────────────────────────
    // A swing stuns whoever is in reach ahead of you, nearest first: down, knocked back, then up and angry.
    const offHit = gameEvents.on('act4:hit', ({ from, facing, weapon }) => {
      if (!nav) return;
      for (const i of swingHits(from, facing, weapon, infected.map((x) => feetOf(x.sprite)))) {
        const inf = infected[i];
        const ms = stunFor(weapon, inf.brain.tier === 'evolved');
        stun(inf.brain, ms);
        const f = feetOf(inf.sprite), to = knockback(from, f, weapon.knockbackTiles), push = 150;
        inf.shove = weapon.knockbackTiles > 0 ? { vx: ((to[0] - f[0]) * 1000) / push, vy: ((to[1] - f[1]) * 1000) / push, until: now + push } : null;
        inf.pose = inf.actions ? [2, now + ms] : null;
        gameEvents.emit('audio:cue', { token: weapon.cue, at: { x: f[0], y: f[1] } });
        gameEvents.emit('audio:cue', { token: 'a.sfx.infected.stun', at: { x: f[0], y: f[1] } });
      }
    });
    // A bandage or a medkit stops a bleed.
    const offUsed = gameEvents.on('item:used', ({ itemId }) => {
      if (bleed && (itemId === 'bandage' || itemId === 'medkit')) { bleed = null; gameEvents.emit('ui:toast', { text: 'The bleeding stops.' }); }
    });

    // A pack whose flag is set while you are here appears then (4.1: the khaki shirt at 17:01).
    const offFlag = gameEvents.on('flag:set', () => { if (nav) placePacks(); });

    // ── Debug view (the Playground's Act 4 node) ───────────────────────────
    const debug = scene.add.graphics().setDepth(depthForZY(100000));

    const update = (_t: number, delta: number) => {
      now += delta;
      if (!nav) {
        nav = navOf(scene, map, MAPS[district.map]?.collisionLayer);
        infGrid = withDiscs(nav.walk, uvs);
        placePacks();
      }
      const free = playerFree() && !failing;
      const p = playerFeet();
      const night = isNight(store().clock.minute);
      const pz = zoneAt(p);
      const pUV = inUV(p);
      playerState.onHideSpot = hideSpots.some((h) => dist(h, p) <= TILE_SIZE * 0.75);

      // Ambush over: you left its zone, or 30 s passed — the ambushers melt back into cover.
      if (ambushUntil > 0 && (now > ambushUntil || !infected.some((i) => i.ambush && pz === i.zone))) {
        ambushUntil = -1;
        for (const inf of infected.filter((i) => i.ambush)) { inf.sprite.destroy(); inf.name?.destroy(); }
        infected.splice(0, infected.length, ...infected.filter((i) => !i.ambush));
      }

      let chasing = false, nearest = Infinity;
      const growlingPacks = new Set<string>();
      for (const inf of infected) {
        const f = feetOf(inf.sprite);
        const d = dist(f, p);
        // Smoke between you (or around either of you) breaks the line (ADR-151).
        const los = d < 14 * TILE_SIZE && lineFree(nav.sight, f, p) && !smokeBlocks(f, p, field.clouds, field.now);
        const tier = inf.brain.tier;
        const sees = free && pz === inf.zone && detects(d, noise.value, night, los, playerState.hidden, pUV, tier);
        const heard = free && !los && pz === inf.zone && hears(d, noise.value, night, playerState.hidden, tier) ? p : inf.drawnTo;
        const atTarget = inf.brain.target ? dist(f, inf.brain.target) <= ARRIVE_PX || (inf.path.length === 0 && inf.planned > -Infinity && now - inf.planned > 50) : false;
        const before = inf.brain.mode;
        // A thrown noise in earshot pulls it while it doesn't see you (ADR-151).
        const lure = free ? lureFor(f, field.lures, field.now) : null;
        const intent = think(inf.brain, { dt: free ? delta : 0, sees, player: p, heard, packAlert: false, lure, atTarget, night }, rng, strollIn(inf.zone));
        if (intent.growled) {
          if (inf.lead) growlingPacks.add(inf.pack);
          gameEvents.emit('audio:cue', { token: 'a.sfx.infected.shriek', at: { x: f[0], y: f[1] } });
          if (inf.actions) inf.pose = [0, now + (tier === 'evolved' ? EVOLVED.growlMs : INFECTED.growlMs)];
          // The Evolved's telegraph: a one-frame red flash, so you can bail.
          if (tier === 'evolved') scene.cameras.main.flash(34, 150, 20, 20);
        }
        // A narrow escape: it lost you while right behind you.
        // Once per 5 s however many lose you at once.
        if (before === 'chase' && inf.brain.mode === 'search' && inf.closest <= HARM.narrowPx && now - lastEscape >= HARM.grabWindowMs) {
          lastEscape = now;
          StatsManager.getInstance().adjust('health', HARM.narrowEscape.health);
          StatsManager.getInstance().adjust('stress', HARM.narrowEscape.stress);
        }
        if (inf.brain.mode === 'chase') inf.closest = Math.min(inf.closest, d); else inf.closest = Infinity;

        // Move.
        // Flanking (addendum §2b): a second Evolved on the chase takes a path two tiles off to one side.
        let target = intent.target;
        if (target && tier === 'evolved' && inf.brain.mode === 'chase') {
          const hunters = infected.filter((o) => o.brain.tier === 'evolved' && o.brain.mode === 'chase');
          const k = hunters.indexOf(inf);
          if (k > 0) {
            const dx = p[0] - f[0], dy = p[1] - f[1], len = Math.hypot(dx, dy) || 1;
            const side = k % 2 ? 1 : -1, off = EVOLVED.flankTiles * TILE_SIZE;
            if (len > off * 1.5) target = [p[0] + (-dy / len) * off * side, p[1] + (dx / len) * off * side];
          }
        }
        if (inf.shove && now < inf.shove.until) inf.sprite.body.setVelocity(inf.shove.vx, inf.shove.vy);
        else if (target && intent.speed > 0) {
          inf.shove = null;
          intent.target = target;
          if (now - inf.planned >= REPLAN_MS || !inf.plannedFor || dist(inf.plannedFor, intent.target) > TILE_SIZE) plan(inf, intent.target, now);
          while (inf.path.length && dist(inf.path[0], f) < 3) inf.path.shift();
          const next = inf.path[0];
          if (next) {
            const a = Math.atan2(next[1] - f[1], next[0] - f[0]);
            inf.sprite.body.setVelocity(Math.cos(a) * intent.speed, Math.sin(a) * intent.speed);
          } else inf.sprite.body.setVelocity(0, 0);
        } else inf.sprite.body.setVelocity(0, 0);

        // Look (twitchy: the walk at +50 %, ADR-28) and depth.
        const v = inf.sprite.body.velocity;
        const dir = Math.abs(v.x) > Math.abs(v.y) ? (v.x < 0 ? 'left' : 'right') : v.y < 0 ? 'up' : 'down';
        const facing = v.length() > 1 ? dir : Math.abs(p[0] - f[0]) > Math.abs(p[1] - f[1]) ? (p[0] < f[0] ? 'left' : 'right') : p[1] < f[1] ? 'up' : 'down';
        if (inf.pose && now < inf.pose[1] && inf.actions) {
          // An action pose (alert, lunge): the frame of that column in the facing row.
          const row = ['down', 'left', 'right', 'up'].indexOf(facing);
          inf.sprite.anims.stop();
          inf.sprite.setTexture(inf.actions, row * 3 + inf.pose[0]);
        } else {
          if (inf.pose) { inf.pose = null; inf.sprite.setTexture(inf.sheet); }
          const anim = `${inf.sheet}-${v.length() > 1 ? 'walk' : 'idle'}-${v.length() > 1 ? dir : 'down'}`;
          if (scene.anims.exists(anim) && inf.sprite.anims.currentAnim?.key !== anim) inf.sprite.play(anim);
        }
        // Fresh walk at the normal rate; Degraded twitch at +50 % (ADR-28); the Evolved prowl smoothly.
        inf.sprite.anims.timeScale = tier === 'degraded' ? 1.5 : 1;
        // Down (stunned): its stagger pose where it has one; everyone dims a little.
        inf.sprite.setAlpha(inf.brain.mode === 'stunned' ? 0.7 : 1);
        inf.sprite.setDepth(depthForZY(feetY(inf.sprite)));
        inf.name?.setPosition(inf.sprite.x, inf.sprite.y - 30).setAlpha(d <= NAME_TILES * TILE_SIZE ? 0.5 : 0);

        // A touch.
        // One second of grace after any hit, from anyone: a crowd can't land three touches at once.
        if (free && inf.brain.mode === 'chase' && d <= INFECTED.touchPx && !playerState.hidden && (lastHit === null || now - lastHit >= INFECTED.recoverMs)) hurt(inf, now);

        if (['alert', 'chase', 'recover'].includes(inf.brain.mode)) chasing = true;
        nearest = Math.min(nearest, d);
      }
      // A lead's growl wakes its pack within 8 tiles.
      if (growlingPacks.size) {
        for (const inf of infected) {
          if (inf.lead || !growlingPacks.has(inf.pack) || !['idle', 'wander'].includes(inf.brain.mode)) continue;
          const lead = infected.find((i) => i.lead && i.pack === inf.pack);
          if (lead && dist(feetOf(lead.sprite), feetOf(inf.sprite)) <= INFECTED.packAlertTiles * TILE_SIZE) think(inf.brain, { dt: 0, sees: false, player: p, heard: null, packAlert: true, atTarget: false, night }, rng, strollIn(inf.zone));
        }
      }
      // Bleeding: −10 every 3 s for 12 s; a UV light stops it (bandages and first aid come with S3's items).
      if (bleed && free) {
        if (pUV) { bleed = null; gameEvents.emit('ui:toast', { text: 'The bleeding stops.' }); }
        else {
          const t = tickBleed(bleed, now, EVOLVED.bleed);
          bleed = t.bleed;
          if (t.health) { StatsManager.getInstance().adjust('health', t.health); if (store().stats.health <= 0 && store().flags[ACT4_FLAG]) failForward(); }
        }
      }
      if (stressRed && store().stats.stress < EVOLVED.stressRedUntilLeaving) StatsManager.getInstance().adjust('stress', EVOLVED.stressRedUntilLeaving - store().stats.stress);
      threat.chasing = chasing;
      threat.nearestTiles = infected.length ? Math.round((nearest / TILE_SIZE) * 10) / 10 : null;
      threat.count = infected.length;
      threat.positions = infected.map((i) => feetOf(i.sprite));

      debug.clear();
      if (threatDebug.draw) {
        for (const z of zones) { debug.lineStyle(1, 0xffcc00, 0.8); debug.strokeRect(z.px.x, z.px.y, z.px.w, z.px.h); for (const c of z.cover) debug.fillStyle(0xff8800, 0.9).fillRect(c[0] - 3, c[1] - 3, 6, 6); for (const h of z.hide) debug.fillStyle(0x00ccff, 0.9).fillRect(h[0] - 3, h[1] - 3, 6, 6); }
        for (const inf of infected) {
          const f = feetOf(inf.sprite);
          const c = inf.brain.mode === 'chase' ? 0xff3030 : inf.brain.mode === 'alert' || inf.brain.mode === 'recover' ? 0xffa000 : inf.brain.mode === 'search' ? 0xffff00 : 0x30ff30;
          debug.lineStyle(1, c, 0.9).strokeCircle(f[0], f[1], 6);
          for (const q of inf.path) debug.fillStyle(c, 0.6).fillRect(q[0] - 1, q[1] - 1, 2, 2);
        }
        debug.lineStyle(1, 0xffffff, 0.5).strokeCircle(p[0], p[1], Math.max(noise.value, 2) * TILE_SIZE + (night ? 2 * TILE_SIZE : 0));
      }
      threatDebug.modes = infected.map((i) => i.brain.mode);
      threatDebug.paths = infected.map((i) => i.path.length);
    };
    scene.events.on('update', update);
    return () => {
      scene.events.off('update', update);
      offStep();
      offFlag();
      offHit();
      offUsed();
      // On shutdown Phaser has already dropped the physics world.
      if (scene.physics?.world) scene.physics.world.timeScale = 1;
      scene.tweens.timeScale = 1;
      resetThreat();
      threatDebug.modes = [];
      playerState.onHideSpot = false;
      for (const inf of infected) { inf.sprite.destroy(); inf.name?.destroy(); }
      glow.destroy();
      debug.destroy();
    };
  },
};
