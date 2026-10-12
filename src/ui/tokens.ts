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
