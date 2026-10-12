/**
 * Import the title screen (ADR-101): one generated background, one logo and one
 * sheet of moving props, all from src/assets/_raw/title/, into
 * src/assets/title/*.png at game resolution (640×360).
 *
 * The title keeps its golden-hour sky: it is quantised to its OWN 64-colour
 * palette (no dither) instead of the world's palette.gpl, which has no sunset
 * ramp and turns the sky into grey bands. Everything is still hard-edged
 * pixel art — alpha is thresholded, colours are few.
 *
 * Props are cut from the magenta sheet by the source rectangles below, keyed,
 * trimmed and scaled to the height they should have in the scene (a bus is
 * taller than an auto; the metro is far away). The foreground (lawn, hedges,
 * steps, flowers) is cut out of the background so traffic passes behind it.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { occluderMask } from './import-map.mjs';
import { applyPalette, applyPaletteRGBA, paletteFor } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const raw = resolve(here, '../src/assets/_raw/title');
const out = resolve(here, '../src/assets/title');
const W = 640, H = 360;
const COLOURS = 64;

/** Source rect [x, y, w, h] on title_props.png → target height in game px. */
const PROPS = {
  auto: { rect: [40, 95, 250, 180], height: 18 },
  bus: { rect: [330, 80, 545, 190], height: 30 },
  car: { rect: [930, 115, 300, 155], height: 16 },
  scooter: { rect: [1285, 95, 210, 180], height: 18 },
  metro: { rect: [40, 345, 1460, 155], height: 15 },
  cloud_l: { rect: [40, 530, 495, 225], height: 46 },
  cloud_m: { rect: [570, 565, 325, 170], height: 34 },
  cloud_s: { rect: [945, 620, 215, 125], height: 24 },
  birds: { rect: [1210, 560, 285, 190], height: 22 },
  tumbler: { rect: [565, 770, 130, 210], height: 18 },
  petal: { rect: [785, 840, 170, 125], height: 4 },
};

/** Snap a raw buffer to its own COLOURS-colour median-cut palette and write it. */
const quantOut = async (buf, width, height, channels, file) => {
  const palette = paletteFor(buf, channels, COLOURS);
  if (channels === 4) applyPaletteRGBA(buf, palette); else applyPalette(buf, palette);
  await sharp(buf, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toFile(join(out, file));
};

/** Magenta → transparent, by distance from #FF00FF. */
const keyMagenta = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const dr = 255 - data[i], dg = data[i + 1], db = 255 - data[i + 2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < 110) data[i + 3] = 0;
  }
};

/** Hard alpha after a downscale, so edges stay pixel-crisp. */
const hardAlpha = (data) => { for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0; };

async function keyedCrop(file, [x, y, w, h], targetH, name) {
  const { data, info } = await sharp(join(raw, file)).extract({ left: x, top: y, width: w, height: h })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  keyMagenta(data);
  const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer().then((b) => sharp(b).trim({ threshold: 0 }).toBuffer({ resolveWithObject: true }));
  const scale = targetH / trimmed.info.height;
  const tw = Math.max(1, Math.round(trimmed.info.width * scale));
  const small = await sharp(trimmed.data).resize(tw, targetH, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  hardAlpha(small.data);
  await quantOut(small.data, tw, targetH, 4, `title_${name}.png`);
}

export async function importTitle() {
  mkdirSync(out, { recursive: true });

  // Background at game resolution.
  const bg = await sharp(join(raw, 'title_bg.png')).resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().raw().toBuffer();
  // Quantised in place, so the foreground is keyed on few colours ("ground" is a real set).
  await quantOut(bg, W, H, 3, 'title_bg.png');

  // Foreground cut-out (source px → game px): lawn, hedges, steps, flowers,
  // and the trunk — everything in front of the road.
  const s = W / 1536;
  const X = (v) => Math.round(v * s), Y = (v) => Math.round(v * s);
  const rect = { x0: 0, y0: Y(612), w: W, h: H - Y(612) };
  const keep = occluderMask(bg, W, H, rect, {
    mode: 'key',
    bg: [[760, 648, 370, 40], [300, 615, 1100, 14], [1140, 655, 250, 30]],
    seeds: [[200, 700], [100, 800], [600, 800], [900, 760], [1250, 760], [1300, 820], [1480, 700], [30, 640], [760, 690], [1180, 720], [1500, 780], [1520, 700], [1480, 840]],
  }, X, Y);
  // Stone the keying cannot tell from the road (same greys): the bench, the
  // step posts and the steps below the road's edge are always foreground.
  for (const [sx, sy, sw, sh] of [[65, 650, 290, 125], [1135, 688, 52, 80], [1352, 702, 70, 70], [1140, 722, 300, 142]]) {
    for (let yy = Y(sy); yy < Y(sy + sh); yy++) for (let xx = X(sx); xx < X(sx + sw); xx++) {
      const ry = yy - rect.y0;
      if (ry >= 0 && ry < rect.h && xx >= 0 && xx < W) keep[ry * rect.w + xx] = 1;
    }
  }
  const fg = Buffer.alloc(rect.w * rect.h * 4);
  for (let yy = 0; yy < rect.h; yy++) for (let xx = 0; xx < rect.w; xx++) {
    const k = yy * rect.w + xx;
    if (!keep[k]) continue;
    const i = ((rect.y0 + yy) * W + xx) * 3;
    fg[k * 4] = bg[i]; fg[k * 4 + 1] = bg[i + 1]; fg[k * 4 + 2] = bg[i + 2]; fg[k * 4 + 3] = 255;
  }
  await sharp(fg, { raw: { width: rect.w, height: rect.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(out, 'title_fg.png'));

  // Logo: keyed, trimmed, 300 px wide.
  const logo = await sharp(join(raw, 'title_logo.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  keyMagenta(logo.data);
  const logoTrim = await sharp(logo.data, { raw: { width: logo.info.width, height: logo.info.height, channels: 4 } })
    .png().toBuffer().then((b) => sharp(b).trim({ threshold: 0 }).toBuffer({ resolveWithObject: true }));
  const lw = 300, lh = Math.round(logoTrim.info.height * (lw / logoTrim.info.width));
  const logoSmall = await sharp(logoTrim.data).resize(lw, lh, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  hardAlpha(logoSmall);
  await quantOut(logoSmall, lw, lh, 4, 'title_logo.png');

  for (const [name, { rect: r, height }] of Object.entries(PROPS)) {
    await keyedCrop('title_props.png', r, height, name);
  }
  console.log(`✓ title: bg 640x360 + foreground cut-out (${rect.y0}px down) + logo ${lw}x${lh} + ${Object.keys(PROPS).length} props, own ${COLOURS}-colour palette (ADR-101)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await importTitle();
}
