/**
 * Design-system colour tokens (design_system_v1 §1) → entries of the LOCKED
 * palette, src/assets/_meta/palette.gpl, by index. This file is the source of
 * truth for *which* of the 48 colours plays *which* role; the generated
 * src/assets/_meta/tokens.json is what runtime code reads.
 *
 * Rule: no raw hex in code or art. Every colour a sprite, tile or UI element
 * uses is a token here, and every token is a palette entry — so the whole
 * game cannot drift off the P1 look.
 *
 * Indices refer to palette.gpl sorted dark→light (0 = darkest).
 */
export const TOKEN_INDEX = {
  // ── UI ──
  'ui.bg': 0,          // deepest green-black: screen background, letterbox
  'ui.panel': 3,       // dark warm grey: HUD pills, dialogue panel
  'ui.panel.edge': 8,  // lighter grey: panel bevel
  'ui.paper': 47,      // cream: the offer-letter form, cards
  'ui.paper.shade': 46,
  'ui.paper.edge': 36,
  'ui.line': 0,        // the 1px dark outline, everywhere
  'ui.text': 47,       // on dark
  'ui.text.ink': 1,    // on paper
  'ui.text.dim': 26,
  'ui.focus': 44,      // selected field / cursor: auto yellow
  'ui.good': 23,
  'ui.warn': 41,
  'ui.bad': 12,

  // ── Identity accents ──
  'accent.auto': 44,   // black-and-yellow auto
  'accent.bmtc': 7,    // BMTC blue-grey
  'accent.metro': 15,  // palette has no purple; drum blue stands in (flagged)
  'accent.uv': 15,

  // ── Ground ──
  'ground.tar': 5,
  'ground.tar.shade': 3,
  'ground.tar.lit': 13,
  'ground.marking': 43,
  'ground.paver': 36,
  'ground.paver.alt': 34,
  'ground.paver.shade': 30,
  'ground.mud': 14,
  'ground.grass': 10,
  'ground.grass.lit': 23,
  'ground.grass.deep': 2,
  'ground.water': 15,

  // ── Buildings ──
  'brick': 11,
  'brick.shade': 9,
  'brick.lit': 17,
  'plaster.cream': 45,
  'plaster.cream.shade': 42,
  'plaster.pastel': 43,
  'plaster.ochre': 39,
  'tank.black': 0,
  'grille': 1,
  'wood': 4,
  'wood.lit': 20,
  'steel': 35,
  'steel.shade': 26,
  'glass': 7,
  'leaf': 10,
  'leaf.lit': 23,
  'leaf.deep': 2,
  'trunk': 4,

  // ── Skin (5 Indian tones, light → deep) + their shade ──
  'skin.1': 42, 'skin.1.shade': 33,
  'skin.2': 33, 'skin.2.shade': 22,
  'skin.3': 22, 'skin.3.shade': 16,
  'skin.4': 16, 'skin.4.shade': 9,
  'skin.5': 9,  'skin.5.shade': 4,

  // ── Hair ──
  'hair.black': 0,
  'hair.brown': 1,

  // ── Attire ──
  'cloth.shirt.blue': 15,
  'cloth.shirt.blue.shade': 7,
  'cloth.shirt.white': 43,
  'cloth.shirt.white.shade': 35,
  'cloth.trouser.grey': 5,
  'cloth.trouser.grey.shade': 3,
  'cloth.kurti.red': 12,
  'cloth.kurti.red.shade': 11,
  'cloth.kurti.green': 10,
  'cloth.kurti.green.shade': 2,
  'cloth.kurti.mustard': 29,
  'cloth.kurti.mustard.shade': 19,
  'cloth.legging': 1,
  'cloth.tee.olive': 19,
  'cloth.tee.olive.shade': 4,
  'cloth.tee.rust': 17,
  'cloth.tee.rust.shade': 11,
  'bag.dark': 1,
  'bag.dark.lit': 6,
  'bag.mustard': 29,
  'bag.mustard.shade': 19,
  'shoe': 0,
  'shadow': 3,
};
