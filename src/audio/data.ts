import manifestJson from '../data/audio/manifest.json';
import bedsJson from '../data/audio/beds.json';

/**
 * The audio data (audio plan v1 §3, ADR-139): every sound is a token in the
 * manifest; places say which bed layers they mix in beds.json. Code names
 * tokens, never files.
 */
export type Bus = 'music' | 'ambience' | 'sfx' | 'ui' | 'voice';

export interface AudioToken {
  files: string[];
  bus: Bus;
  loop: boolean;
  volume: number;
  pitchVar: number;
  cooldown: number;
  positional: boolean;
  /** Detection tiles this sound adds to `noise` (ADR-49 units). */
  noise?: number;
  tier: 'placeholder' | 'final';
  licence: 'CC0' | 'user-recording' | 'original';
  source: string;
  sampleRate?: number;
  /** A sting ducks everything else while it plays. */
  sting?: boolean;
  /** Act 4: the same file played wrong (ADR-29 uncanny reuse). */
  uncanny?: { of: string; pitch: number; gapMs: number };
}

export interface BedLayer { bed: string; gain: number }
export type TimeOfDay = 'dawn' | 'day' | 'evening' | 'night';
export interface DistrictBeds { surface?: string; music?: boolean; dawn?: BedLayer[]; day?: BedLayer[]; evening?: BedLayer[]; night?: BedLayer[] }
export type LayerKind = 'human' | 'traffic' | 'nature' | 'machine' | 'eerie';
export interface Band { min: number; scale: Record<LayerKind, number>; add: BedLayer[] }
export interface BedsFile {
  kinds: Record<LayerKind, string[]>;
  bands: Record<'normal' | 'warning' | 'infected' | 'deep', Band>;
  transit: Record<string, BedLayer[]>;
  workday: BedLayer[];
  districts: Record<string, DistrictBeds>;
}

export const AUDIO: Record<string, AudioToken> = (manifestJson as unknown as { tokens: Record<string, AudioToken> }).tokens;
export const BEDS = bedsJson as unknown as BedsFile;

/** Phaser cache key for a rendered file. */
export const audioKey = (file: string): string => `au:${file}`;
/** The `a.bed.*` token of a bed layer name. */
export const bedToken = (bed: string): string => `a.bed.${bed}`;
