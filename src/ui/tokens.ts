import generated from '../assets/_meta/tokens.json';

/**
 * Design-system colour tokens at runtime (design_system_v1 §1, ADR-61).
 *
 * `tokens.json` is generated from the locked palette + scripts/art/tokens.mjs
 * by `pnpm art`; this module is the only place UI code should get a colour
 * from. No raw hex in scenes — `color('ui.panel')`, never `0x524f4d`.
 */
export type TokenName = keyof typeof generated.tokens;

const TOKENS = generated.tokens as Record<string, string>;

/** '#rrggbb' for a token. Throws on an unknown name — a typo is a build bug. */
export const hex = (name: TokenName): string => {
  const value = TOKENS[name];
  if (!value) throw new Error(`Unknown colour token "${name}"`);
  return value;
};

/** Phaser-style 0xRRGGBB number for a token. */
export const color = (name: TokenName): number => Number.parseInt(hex(name).slice(1), 16);

/** The 48 locked colours, dark → light. */
export const PALETTE: readonly string[] = generated.palette;

/** UI spacing unit (design system §2): everything sits on multiples of this. */
export const GRID = 8;

export type MotionName = keyof typeof generated.motion;
const MOTION = generated.motion as Record<string, number>;

/** A motion token (px or ms), e.g. motion('m.breath.period'). Throws on a typo. */
export const motion = (name: MotionName): number => {
  const value = MOTION[name];
  if (value === undefined) throw new Error(`Unknown motion token "${name}"`);
  return value;
};

export type DevTheme = keyof typeof generated.devui;
/** Test Playground chrome colours for a theme (ADR-108) — dev tooling only. */
export const devUi = (theme: DevTheme): Record<string, string> => ({ ...(generated.devui[theme] as Record<string, string>) });

/** HUD and menu plates are `hud.plate` at this opacity (ADR-114): readable over a busy street. */
export const HUD_PLATE_ALPHA = 0.85;

/** 'rgba(r,g,b,a)' for a token — the only way UI code gets a translucent colour. */
export const rgba = (name: TokenName, alpha: number): string => {
  const n = color(name);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
