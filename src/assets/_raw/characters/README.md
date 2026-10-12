# Raw character sheets (pipeline input — never loaded by the game)

Each `<name>.png` is a generated 3-column × 4-row sheet on flat magenta, rows
down / left / right / up, columns [step, idle, step]. `pnpm art` runs
`scripts/import-sheet.mjs` on every file here and writes
`src/assets/sprites/<name>_1..5.png` (96×192, four directions × [stride, idle, opposite stride],
skin remapped onto the five `c.skin` ramps, every pixel on `palette.gpl`).

| Raw | Generated with | Date | Prompt |
| --- | --- | --- | --- |
| `player_m.png` (reroll 2, strides named per cell) | Figma AI `generate_image`, gpt-image-2.5-sunburst, 1024×1024, user's personal plan | 2026-10-12 | see `prompt-template.md` + "young Indian man, early twenties, wheatish skin, short neat black hair, light-blue formal shirt tucked into grey trousers, black shoes, a small dark backpack, fresh-graduate look" |
| `player_f.png` (reroll 2, strides named per cell) | same | 2026-10-12 | template + "young Indian woman, early twenties, wheatish skin, dark hair in a low bun, knee-length rust-red kurti with a small print, dark leggings, flat sandals, a mustard sling bag across her body" |

| `npc_chai_anna.png` | same | 2026-10-12 | template + "Chai Anna, cheerful tea-stall vendor in his fifties, dusky skin, grey-streaked hair, thick moustache, worn khaki half-sleeve shirt, checked gamcha over one shoulder, dark trousers, rubber chappals, small steel kettle in one hand" — imported as one sheet (no skin variants) |

Re-generating a character = new raw here (max 3 rerolls, art_pipeline §4), then `pnpm art`.
