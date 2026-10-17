import { BEDS, bedToken, type Band, type BedsFile, type BedLayer, type LayerKind, type TimeOfDay } from './data';

/**
 * The mix — pure (audio plan v1 §2.3–2.4, ADR-29/139): what should be playing
 * for a moment of the game. AudioSystem only follows these numbers; tests and
 * the Playground read the same ones.
 */
export type MusicState = 'normal' | 'drone' | 'heartbeat' | 'chase' | 'relief';
export type Pacing = 'Calm' | 'Curious' | 'Engaged' | 'Tense' | 'Reward';

export interface MixContext {
  districtId: string | null;
  /** A ride card is up: its bed replaces the place's. */
  transit: string | null;
  /** The workday card is up. */
  workday: boolean;
  minute: number;
  /** 0–100 per district; 100 until Act 4's grade() exists. */
  stability: number;
  /** The current beat's pacing tag (ADR-24), or null. */
  pacing: Pacing | null;
  chaseActive: boolean;
  /** ms left of the relief window after a chase or on reaching safety. */
  reliefMs: number;
  /** Tiles to the nearest infected, or null. */
  nearestInfected: number | null;
  stress: number;
}

export interface Mix {
  state: MusicState;
  band: keyof BedsFile['bands'];
  /** a.bed.* token → gain 0–1 */
  bed: Record<string, number>;
  /** a.music.* token, or null for the city alone. */
  music: string | null;
}

export const timeOfDay = (minute: number): TimeOfDay => {
  const m = ((minute % 1440) + 1440) % 1440;
  if (m >= 330 && m < 450) return 'dawn';
  if (m >= 1050 && m < 1230) return 'evening';
  if (m >= 1230 || m < 330) return 'night';
  return 'day';
};

export function bandFor(stability: number, beds: BedsFile = BEDS): keyof BedsFile['bands'] {
  const order: Array<keyof BedsFile['bands']> = ['normal', 'warning', 'infected', 'deep'];
  return order.find((b) => stability >= beds.bands[b].min) ?? 'deep';
}

const kindOf = (bed: string, beds: BedsFile): LayerKind | null => {
  for (const [k, list] of Object.entries(beds.kinds)) if (list.includes(bed)) return k as LayerKind;
  return null;
};

/** The bed layers for a place at a time and a stability — the city drops out layer by layer, it never gets louder. */
export function bedFor(ctx: Pick<MixContext, 'districtId' | 'transit' | 'workday' | 'minute' | 'stability'>, beds: BedsFile = BEDS): Record<string, number> {
  let layers: BedLayer[] = [];
  if (ctx.workday) layers = beds.workday;
  else if (ctx.transit) layers = beds.transit[ctx.transit] ?? [];
  else if (ctx.districtId) {
    const d = beds.districts[ctx.districtId];
    if (d) layers = d[timeOfDay(ctx.minute)] ?? d.day ?? [];
  }
  const band: Band = beds.bands[bandFor(ctx.stability, beds)];
  const out: Record<string, number> = {};
  for (const l of layers) {
    const k = kindOf(l.bed, beds);
    const g = l.gain * (k ? band.scale[k] : 1);
    if (g > 0.001) out[bedToken(l.bed)] = Math.max(out[bedToken(l.bed)] ?? 0, g);
  }
  if (!ctx.transit && !ctx.workday) for (const l of band.add) out[bedToken(l.bed)] = Math.max(out[bedToken(l.bed)] ?? 0, l.gain);
  return out;
}

/** ADR-29's state machine, extended with the pacing tag: first match wins. */
export function musicState(ctx: MixContext): MusicState {
  if (ctx.chaseActive) return 'chase';
  if (ctx.reliefMs > 0) return 'relief';
  if ((ctx.nearestInfected !== null && ctx.nearestInfected <= 8) || ctx.pacing === 'Tense' || ctx.pacing === 'Engaged' || ctx.stress >= 70) return 'heartbeat';
  if (ctx.stability < 70 || ctx.pacing === 'Curious') return 'drone';
  return 'normal';
}

/** The music for a state: the city alone at night and in places that ask for it (a bus, a room) — unless something is wrong. */
export function musicFor(state: MusicState, ctx: Pick<MixContext, 'districtId' | 'minute' | 'transit' | 'workday'>, beds: BedsFile = BEDS): string | null {
  switch (state) {
    case 'chase': return 'a.music.chase';
    case 'relief': return 'a.music.relief';
    case 'heartbeat': return 'a.music.tense';
    case 'drone': return 'a.music.curious';
    default: {
      if (ctx.transit || ctx.workday) return null;
      if (ctx.districtId && beds.districts[ctx.districtId]?.music === false) return null;
      const t = timeOfDay(ctx.minute);
      if (t === 'night') return null;
      return t === 'evening' ? 'a.music.evening' : 'a.music.calm';
    }
  }
}

export function mixFor(ctx: MixContext, beds: BedsFile = BEDS): Mix {
  const state = musicState(ctx);
  const bed = bedFor(ctx, beds);
  // The heartbeat layer rises as an infected comes closer (8 tiles → 0, touching → full) — ADR-29's heartbeat, proximity-led.
  if (ctx.nearestInfected !== null && ctx.nearestInfected <= 8) bed['a.bed.heartbeat_bed'] = Math.max(bed['a.bed.heartbeat_bed'] ?? 0, Math.round((1 - ctx.nearestInfected / 8) * 100) / 100);
  return { state, band: bandFor(ctx.stability, beds), bed, music: musicFor(state, ctx, beds) };
}

/** Footstep surface of a street tile by its name (ADR-140): road → asphalt, pavers and kerbs → concrete, a puddle → puddle. */
export function streetSurface(tileName: string): string | null {
  if (tileName.startsWith('road')) return 'asphalt';
  if (tileName.startsWith('paver') || tileName.startsWith('kerb')) return 'concrete';
  if (tileName === 'puddle') return 'puddle';
  return null;
}

/** How loud a positional source is in a band (ADR-140): people halve at warning and fall silent once the place turns; machines carry on. */
export const sourceScale = (kind: 'human' | 'machine' | undefined, band: keyof BedsFile['bands']): number =>
  kind !== 'human' ? 1 : band === 'normal' ? 1 : band === 'warning' ? 0.5 : 0;

/** Footstep surface for a place (a spec `surfaces` rect can refine it later). */
export const surfaceOf = (districtId: string | null, beds: BedsFile = BEDS): string => (districtId && beds.districts[districtId]?.surface) || 'concrete';
