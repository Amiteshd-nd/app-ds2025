# Raw map renders (pipeline input — never loaded by the game)

Small interiors are generated as ONE top-down picture in the locked style and
sliced by `scripts/import-map.mjs` into a unique-tile tileset + Tiled map
(art_pipeline §5 "grid snap"). Each `<name>.png` has a `<name>.spec.json`
beside it: tile count, solid rectangles, spawns and zones, authored by
looking at the render on a 32px grid. `pnpm art` re-imports every spec.

| Raw | Generated with | Date | Prompt gist |
| --- | --- | --- | --- |
| `whitefield_hotel.png` (1536×1024 → 24×16 tiles) | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-12 | "2D top-down RPG interior exactly like RPG Maker MV / FireRed indoor map, orthographic, walls as flat bands along the top of each room; budget Whitefield hotel: reception (counter, bell, register, lift, clock, calendar, god-picture, tube light, carpet runner to double doors, chairs, water cooler) + one guest room (single bed, side table, AC, barred window, wardrobe, mirror, bathroom door, ceiling fan); cream plaster + green band; ~48 colours; no characters, no text" |

Rules that worked: say "walls as flat bands along the top of each room", list the rooms with their share of the width, name every prop, end with "fill the whole image edge to edge; no outside, no border".
