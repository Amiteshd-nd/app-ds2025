/**
 * Bake breathing frames (AUDIT_LOG: "upper body only, 1px DOWN at the
 * waistline, feet planted, baked frames, never whole-sprite offset").
 *
 * For every character sheet whose base has lines in
 * src/assets/_raw/characters/breath.json, derive F1–F3 from each direction's
 * idle frame (scripts/art/breath.mjs) and write src/assets/sprites/<sheet>__breath.png:
 * the same 96×192 contract as a walk sheet — rows down/left/right/up,
 * columns F1, F2, F3 (F0 is the idle frame of the sheet itself). Player bases
 * cover all five skin sheets. A derived variant: no new art.
 *
 *   node scripts/import-breath.mjs     (also runs inside `pnpm art`)
 */
import sharp from 'sharp';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W, deriveBreath, readFrame, writeFrame } from './art/breath.mjs';
import { applyPaletteRGBA, readGpl } from './art/quantize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const sprites = join(assets, 'sprites');
const DIRS = ['down', 'left', 'right', 'up'];

/** Which base a sheet belongs to: player_m_3 → player_m; npc_x → npc_x. */
export const baseOf = (sheet) => (sheet.startsWith('player_') ? sheet.replace(/_[1-5]$/, '') : sheet);

export async function importBreath() {
  const lines = JSON.parse(readFileSync(join(assets, '_raw/characters/breath.json'), 'utf8'));
  const palette = readGpl(readFileSync(join(assets, '_meta/palette.gpl'), 'utf8'));
  for (const f of readdirSync(sprites)) if (f.endsWith('__breath.png')) rmSync(join(sprites, f));

  const sheets = readdirSync(sprites).filter((f) => f.endsWith('.png') && !f.includes('__')).map((f) => f.replace(/\.png$/, ''));
  let made = 0, repaired = 0;
  const skipped = [];
  for (const sheet of sheets.sort()) {
    const entry = lines[baseOf(sheet)];
    if (!entry || DIRS.some((d) => !entry[d]?.enabled)) { skipped.push(sheet); continue; }
    const { data, info } = await sharp(join(sprites, `${sheet}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(3 * FRAME_W * 4 * FRAME_H * 4);
    for (const [row, dir] of DIRS.entries()) {
      const { f1, f2, f3, repaired: r } = deriveBreath(readFrame(data, info.width, 1, row), entry[dir]);
      repaired += r;
      [f1, f2, f3].forEach((f, col) => writeFrame(out, 3 * FRAME_W, col, row, f));
    }
    applyPaletteRGBA(out, palette);
    await sharp(out, { raw: { width: 3 * FRAME_W, height: 4 * FRAME_H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(sprites, `${sheet}__breath.png`));
    made++;
  }
  console.log(`✓ breathing: ${made} __breath sheets baked (${repaired} seam px repaired)${skipped.length ? `; no lines for ${skipped.join(', ')}` : ''}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await importBreath();
}
