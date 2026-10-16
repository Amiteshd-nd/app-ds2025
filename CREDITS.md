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
| `src/assets/sprites/player_*.png`, `npc_*.png`, `crowd_*.png`, `src/assets/overlays/*.png`, `src/assets/props/*.png`, `tilesets/` + `tilemaps/` `kempegowda_arrivals`, `whitefield_hotel`, `prashanth_layout`, `shanthamma_pg`, `office_gate`, `ambedkar_nagar_hill`, `hill_flat`, `cubbon_park`, `bus_interior`, `scooter_showroom`, `src/assets/backdrops/*.png`, `src/assets/title/*.png` | Figma AI image generation (gpt-image-2.5-sunburst, user's personal plan) → raws in `src/assets/_raw/{characters,maps,props,backdrops}/` (prompts in their READMEs). The office gate's architecture was matched by eye to Google Maps place photos of the International Tech Park (look-only; nothing copied, traced or stored — AUDIT_LOG 2026-10-16) → `scripts/import-sheet.mjs` / `import-map.mjs` (quantised to `palette.gpl`) | Generated output |
| `public/pwa-*.png`, `public/favicon.png` | `scripts/generate-art.mjs` lineage | Same as this repository |

These are reproducible: rerunning `pnpm art` regenerates them byte-identically.
The generator, not the PNG, is the source of truth.

## Carried over from the reference project — removed

The airport tilesets and `airport_interior.tmj` ported from the earlier
incarnation of this game (`cityhunter-x-y-z/bt`, provenance never resolved)
were **deleted on 2026-10-13** (T-031, ADR-109). The airport is now the
generated `kempegowda_arrivals` map above, so no asset of unknown origin ships.

## Map data

| Asset | Source | Licence |
| --- | --- | --- |
| `src/data/map/city.json` (region outlines, road and metro traces, station positions) | Typed by hand in this repository from general knowledge of Bengaluru's geography; simplified and snapped to an 8px grid at draw time. No map tiles, screenshots or traced map images are used or shipped (map_navigation §5) | Same as this repository |

## OpenStreetMap data

| Asset | Source | Licence |
| --- | --- | --- |
| `src/data/map/areas/*.json` (streets, parks, water around each pocket) | © OpenStreetMap contributors — <https://www.openstreetmap.org/copyright>, fetched via the public Overpass API by `scripts/fetch-osm-area.mjs` (date in each file's `$comment`), simplified to 4 m | Open Database License (ODbL) 1.0 — attribution shown on the map's Area view and in Settings → About (ADR-119); these files stay open data. ODbL is allowed for map data files only (ADR-117) |

## Third-party fonts

| Asset | Source | Licence |
| --- | --- | --- |
| `src/assets/_raw/fonts/PixelifySans-wght.ttf` → `src/assets/fonts/px.*`, `pxb.*` (bitmap font "based on Pixelify Sans", modified: grid-sampled, pixel bold, hand-drawn ₹ 5 Z B ( ) , and UI marks) | Pixelify Sans by The Pixelify Sans Project Authors — <https://github.com/eifetx/Pixelify-Sans>, downloaded 2026-10-13 from the official <https://github.com/google/fonts/tree/main/ofl/pixelifysans> | SIL Open Font License 1.1 — `src/assets/_raw/fonts/OFL.txt`, shipped as `public/licenses/OFL-PixelifySans.txt`; no Reserved Font Name. OFL is allowed for font files only (ADR-114). Credited in Settings → About (ADR-119) |

## Third-party packs

None yet. When one is added, record it here on the day it is downloaded, with:
pack name, author, URL, licence, whether attribution is required, and whether
commercial use is permitted.
