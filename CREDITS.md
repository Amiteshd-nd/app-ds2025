# Credits and asset provenance

Attribution is recorded when an asset arrives, not reconstructed later.
Working out which of three packs a sprite came from six months on is genuinely
unpleasant, so every asset in this package is accounted for below.

## Generated in this repository

| Asset | Source | Licence |
| --- | --- | --- |
| `src/assets/tilesets/street.png` | `scripts/generate-art.mjs` | Same as this repository |
| `src/assets/_meta/style/style_sheet.png`, `palette.gpl`, `tokens.json` | P1 style lock: Figma AI image generation (gpt-image-2.5-sunburst) from the prompt in `_meta/style.json`; palette by `scripts/extract-palette.mjs`. Reference only — never loaded by the game | Generated output, used as reference |
| `src/assets/tilemaps/whitefield_street.tmj` | `scripts/generate-street-map.mjs` | Same as this repository |
| `src/assets/sprites/player_*.png`, `npc_*.png`, `crowd_*.png`, `src/assets/overlays/*.png`, `src/assets/props/*.png`, `tilesets/` + `tilemaps/` `kempegowda_arrivals`, `whitefield_hotel`, `prashanth_layout`, `shanthamma_pg`, `src/assets/title/*.png` | Figma AI image generation (gpt-image-2.5-sunburst, user's personal plan) → raws in `src/assets/_raw/{characters,maps}/` (prompts in their READMEs) → `scripts/import-sheet.mjs` / `import-map.mjs` (quantised to `palette.gpl`) | Generated output |
| `public/pwa-*.png`, `public/favicon.png` | `scripts/generate-art.mjs` lineage | Same as this repository |

These are reproducible: rerunning `pnpm art` regenerates them byte-identically.
The generator, not the PNG, is the source of truth.

## Carried over from the reference project — removed

The airport tilesets and `airport_interior.tmj` ported from the earlier
incarnation of this game (`cityhunter-x-y-z/bt`, provenance never resolved)
were **deleted on 2026-10-13** (T-031, ADR-109). The airport is now the
generated `kempegowda_arrivals` map above, so no asset of unknown origin ships.

## Third-party packs

None yet. When one is added, record it here on the day it is downloaded, with:
pack name, author, URL, licence, whether attribution is required, and whether
commercial use is permitted.
