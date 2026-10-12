import { Canvas } from './canvas.mjs';
import { T } from './palette.mjs';

export const CW = 32; // frame width
export const CH = 48; // frame height

/**
 * A 32x48 chibi character in four directions — rig v2, built to the P1 lock.
 *
 * Proportions follow the user's references (P1_P2 §2.3 + the townsfolk
 * sheet): a 14px head on a 10px torso and 12px legs — roughly 1 : 1.6 head to
 * body — with 2x2 eyes and a clean 1px dark outline on head, torso and legs.
 * Every colour is a design-system token resolved against palette.gpl, so a
 * sheet cannot leave the palette by construction.
 *
 * Sheet layout matches what BootScene expects: 4 columns x 4 rows, rows
 * ordered down, left, right, up, each row [stride, idle, opposite stride,
 * idle] so the middle frame doubles as that direction's idle pose.
 *
 * Geometry is pinned to the collision box Player uses — a 20x12 body offset
 * (6, 35) — so the shoes end at y=42 and the character stands *in* the scene.
 *
 * A look is base body (gender) × skin tone × attire × bag; see `LOOKS` in
 * generate-art.mjs for how the player and citizen sheets are composed.
 */

const HEAD_X = 9;
const HEAD_Y = 3;
const HEAD_W = 14;
const HEAD_H = 14;
const TORSO_X = 10;
const TORSO_W = 12;
const TORSO_H = 10;
const FOOT_Y = 42; // bottom edge of the shoes (exclusive)

/** Resolve a look into concrete colours. */
function colours(look) {
  const skinKey = `skin.${look.skin ?? 3}`;
  return {
    skin: T[skinKey],
    skinShade: T[`${skinKey}.shade`],
    hair: look.hair === 'brown' ? T['hair.brown'] : T['hair.black'],
    top: look.top ?? T['cloth.shirt.blue'],
    topShade: look.topShade ?? T['cloth.shirt.blue.shade'],
    collar: look.collar ?? T['cloth.shirt.white'],
    bottom: look.bottom ?? T['cloth.trouser.grey'],
    bottomShade: look.bottomShade ?? T['cloth.trouser.grey.shade'],
    bag: look.bagColour ?? T['bag.dark'],
    bagLit: look.bagLit ?? T['bag.dark.lit'],
    ink: T['ui.line'],
    shoe: T.shoe,
    shadow: T.shadow,
  };
}

/** One frame. `phase`: 0 = lead stride, 1 = idle, 2 = opposite stride. */
function drawFrame(c, dir, phase, look) {
  const k = colours(look);
  const female = look.gender === 'F';
  const bag = look.bag ?? 'none';

  // A one-pixel lift on the stride frames. Without it the walk reads as a
  // slide, however much the legs move.
  const bob = phase === 1 ? 0 : -1;
  const hx = HEAD_X;
  const hy = HEAD_Y + bob;
  const ty = hy + HEAD_H + 1; // torso top (one row of neck between)
  const legTop = ty + TORSO_H;
  const side = dir === 'left' || dir === 'right';
  const facing = dir === 'left' ? -1 : 1; // which way a profile looks

  // ── Contact shadow, first so everything draws over it ──
  // Sits directly under the feet. A gap here is what makes a top-down
  // character look like it is hovering.
  c.hline(TORSO_X, FOOT_Y + 1, TORSO_W, k.shadow);
  c.hline(TORSO_X + 2, FOOT_Y + 2, TORSO_W - 4, k.shadow);

  // ── Legs (under the torso/kurti) ──
  // The stride is carried by one leg lifting while the other stays planted.
  // A horizontal offset alone does not read at this size; a length
  // difference does, because the silhouette changes.
  const plantedH = FOOT_Y - 2 - legTop;
  const liftedH = plantedH - 3;
  const drawLeg = (x, h, col, shoeShift) => {
    c.rect(x, legTop, 4, h, col);
    c.outline(x, legTop, 4, h, k.ink);
    c.rect(x + shoeShift, legTop + h, 4, 2, k.shoe);
  };
  const lead = phase === 0, trail = phase === 2;
  if (side) {
    const fwd = facing * 2;
    const back = TORSO_X + 2, front = TORSO_X + 6;
    if (lead) { drawLeg(back, plantedH, k.bottomShade, -fwd); drawLeg(front, liftedH, k.bottom, fwd); }
    else if (trail) { drawLeg(back, liftedH, k.bottomShade, fwd); drawLeg(front, plantedH, k.bottom, -fwd); }
    else { drawLeg(back, plantedH, k.bottomShade, 0); drawLeg(front, plantedH, k.bottom, 0); }
  } else {
    const l = TORSO_X + 1, r = TORSO_X + 7;
    if (lead) { drawLeg(l, plantedH, k.bottom, 0); drawLeg(r, liftedH, k.bottomShade, 0); }
    else if (trail) { drawLeg(l, liftedH, k.bottom, 0); drawLeg(r, plantedH, k.bottomShade, 0); }
    else { drawLeg(l, plantedH, k.bottom, 0); drawLeg(r, plantedH, k.bottomShade, 0); }
  }

  // ── Torso ──
  c.roundRect(TORSO_X, ty, TORSO_W, TORSO_H, k.top, k.ink);
  c.vline(TORSO_X + 1, ty + 1, TORSO_H - 2, k.topShade);
  if (dir !== 'up') c.vline(TORSO_X + TORSO_W - 2, ty + 1, TORSO_H - 2, k.topShade);

  if (female) {
    // Kurti: the top carries on over the hips, with a shaded hem.
    const hemH = 4;
    c.rect(TORSO_X, legTop, TORSO_W, hemH, k.top);
    c.hline(TORSO_X + 1, legTop + hemH - 1, TORSO_W - 2, k.topShade);
    c.vline(TORSO_X, ty, TORSO_H + hemH, k.ink);
    c.vline(TORSO_X + TORSO_W - 1, ty, TORSO_H + hemH, k.ink);
    c.hline(TORSO_X, legTop + hemH, TORSO_W, k.ink);
    if (dir === 'down') c.set(TORSO_X + 5, legTop + hemH - 1, k.ink); // centre slit
  } else if (dir === 'down') {
    // Shirt collar: a small V of lighter cloth at the neck.
    c.set(TORSO_X + 5, ty + 1, k.collar);
    c.set(TORSO_X + 6, ty + 1, k.collar);
    c.set(TORSO_X + 4, ty + 1, k.collar);
    c.set(TORSO_X + 7, ty + 1, k.collar);
  }

  // ── Bags that sit behind the body (drawn before arms so straps read on top) ──
  if (bag === 'backpack') {
    if (dir === 'up') {
      c.rect(TORSO_X + 2, ty + 1, 8, 8, k.bag);
      c.outline(TORSO_X + 2, ty + 1, 8, 8, k.ink);
      c.hline(TORSO_X + 3, ty + 2, 6, k.bagLit);
    } else if (side) {
      const bx = facing < 0 ? TORSO_X + TORSO_W : TORSO_X - 3;
      c.rect(bx, ty + 1, 3, 8, k.bag);
      c.outline(bx, ty + 1, 3, 8, k.ink);
    }
  }

  // ── Arms, swinging opposite the legs ──
  const swing = lead ? 1 : trail ? -1 : 0;
  const armTop = ty + 1;
  const armH = 7;
  const drawArm = (x, dy) => {
    c.rect(x, armTop + dy, 2, armH, k.top);
    c.rect(x, armTop + armH + dy, 2, 2, k.skin);
    c.vline(x - (x < TORSO_X ? 1 : -2), armTop + dy, armH + 2, k.ink);
  };
  if (side) {
    // Only the near arm is visible in profile.
    drawArm(facing < 0 ? TORSO_X - 2 : TORSO_X + TORSO_W, swing);
  } else {
    drawArm(TORSO_X - 2, -swing);
    drawArm(TORSO_X + TORSO_W, swing);
  }

  // ── Straps and bags on the front / side ──
  if (bag === 'backpack' && dir === 'down') {
    c.vline(TORSO_X + 2, ty + 1, 6, k.bag);
    c.vline(TORSO_X + 9, ty + 1, 6, k.bag);
  }
  if (bag === 'laptop' || bag === 'sling') {
    const bagCol = bag === 'sling' ? T['bag.mustard'] : k.bag;
    const bagShade = bag === 'sling' ? T['bag.mustard.shade'] : k.bagLit;
    if (dir === 'down' || dir === 'up') {
      // Diagonal strap, shoulder to opposite hip.
      for (let i = 0; i < 8; i++) c.set(TORSO_X + 2 + i, ty + 1 + i, k.ink);
      // Bag at the hip.
      const bx = dir === 'down' ? TORSO_X + TORSO_W - 2 : TORSO_X - 2;
      c.rect(bx, legTop - 2, 4, 4, bagCol);
      c.outline(bx, legTop - 2, 4, 4, k.ink);
      c.set(bx + 1, legTop - 1, bagShade);
    } else {
      const bx = facing < 0 ? TORSO_X + TORSO_W - 1 : TORSO_X - 3;
      c.rect(bx, legTop - 3, 4, 5, bagCol);
      c.outline(bx, legTop - 3, 4, 5, k.ink);
      c.vline(facing < 0 ? TORSO_X + TORSO_W - 3 : TORSO_X + 2, ty + 1, legTop - ty - 3, k.ink);
    }
  }
  if (bag === 'tote') {
    const bagCol = T['bag.mustard'], bagShade = T['bag.mustard.shade'];
    const bx = side ? (facing < 0 ? TORSO_X + TORSO_W + 1 : TORSO_X - 6) : TORSO_X + TORSO_W + 2;
    c.rect(bx, legTop - 4, 5, 6, bagCol);
    c.outline(bx, legTop - 4, 5, 6, k.ink);
    c.hline(bx + 1, legTop - 3, 3, bagShade);
    c.vline(bx + 2, armTop + armH - 1, 3, k.ink); // handle up to the hand
  }

  // ── Neck ──
  c.rect(hx + 5, ty - 1, 4, 1, k.skinShade);

  // ── Head ──
  c.roundRect(hx, hy, HEAD_W, HEAD_H, k.skin, k.ink);

  if (dir === 'up') {
    // Back of the head: hair over everything but the nape.
    c.rect(hx + 1, hy + 1, HEAD_W - 2, HEAD_H - 3, k.hair);
    c.set(hx + 1, hy + 1, k.ink); c.set(hx + HEAD_W - 2, hy + 1, k.ink); // rounded crown
    if (female) {
      c.rect(hx + 5, hy - 2, 5, 3, k.hair); // low bun
      c.outline(hx + 5, hy - 2, 5, 3, k.ink);
      c.rect(hx + 1, hy + HEAD_H - 2, HEAD_W - 2, 3, k.hair); // falls onto shoulders
    }
  } else if (dir === 'down') {
    // Cap of hair with a jagged fringe: every third column dips one row
    // lower so the hairline reads as hair, not a hat.
    c.rect(hx + 1, hy + 1, HEAD_W - 2, 4, k.hair);
    for (let i = 2; i < HEAD_W - 2; i += 3) c.set(hx + i, hy + 5, k.hair);
    c.set(hx + 1, hy + 5, k.hair);
    c.set(hx + HEAD_W - 2, hy + 5, k.hair);
    if (female) {
      // Hair frames the face and reaches the shoulders.
      c.rect(hx, hy + 5, 1, HEAD_H - 4, k.hair);
      c.rect(hx + HEAD_W - 1, hy + 5, 1, HEAD_H - 4, k.hair);
      c.rect(hx - 1, hy + 6, 1, HEAD_H - 3, k.hair);
      c.rect(hx + HEAD_W, hy + 6, 1, HEAD_H - 3, k.hair);
      c.hline(hx + 2, hy + 4, 3, k.hair); // fringe sweep
    } else {
      c.set(hx + 1, hy + 6, k.hair); // sideburns
      c.set(hx + HEAD_W - 2, hy + 6, k.hair);
    }
    // Eyes: 2x2, with a 1px catchlight so they read as eyes, not holes.
    c.rect(hx + 3, hy + 8, 2, 2, k.ink);
    c.rect(hx + 9, hy + 8, 2, 2, k.ink);
    c.set(hx + 3, hy + 8, k.collar);
    c.set(hx + 9, hy + 8, k.collar);
    c.hline(hx + 6, hy + 12, 2, k.skinShade); // mouth
  } else {
    // Profile: hair covers the rear two-thirds; one eye and a nose pixel at
    // the leading edge.
    const front = facing < 0 ? hx : hx + HEAD_W - 1;
    const rearX = facing < 0 ? hx + 5 : hx + 1;
    c.rect(hx + 1, hy + 1, HEAD_W - 2, 4, k.hair);
    c.rect(rearX, hy + 1, 8, female ? HEAD_H - 2 : 9, k.hair);
    // Fringe tip over the brow and a chamfer on the nape so the hair follows
    // the rounded skull instead of reading as a block.
    c.set(front - facing, hy + 5, k.hair);
    if (!female) c.set(facing < 0 ? rearX : rearX + 7, hy + 9, k.skin);
    if (female) c.rect(facing < 0 ? hx + 9 : hx, hy + 6, 5, HEAD_H - 4, k.hair);
    const eyeX = facing < 0 ? hx + 2 : hx + HEAD_W - 4;
    c.rect(eyeX, hy + 8, 2, 2, k.ink);
    c.set(eyeX + (facing < 0 ? 0 : 1), hy + 8, k.collar);
    c.set(front + facing, hy + 10, k.skin); // nose
    c.set(front + facing, hy + 11, k.ink);
    c.hline(facing < 0 ? hx + 1 : hx + HEAD_W - 3, hy + 12, 2, k.skinShade);
  }
}

const ROWS = ['down', 'left', 'right', 'up'];
const PHASES = [0, 1, 2, 1]; // stride, idle, opposite stride, idle

/** Build the 128x192 sheet for one look. */
export function buildCharacterSheet(look = {}) {
  const sheet = new Canvas(CW * 4, CH * 4);
  ROWS.forEach((dir, row) => {
    PHASES.forEach((phase, col) => {
      const frame = new Canvas(CW, CH);
      drawFrame(frame, dir, phase, look);
      sheet.blit(frame, col * CW, row * CH);
    });
  });
  return sheet;
}
