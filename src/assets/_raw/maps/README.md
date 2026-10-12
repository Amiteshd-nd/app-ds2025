# Raw map renders (pipeline input — never loaded by the game)

Small interiors are generated as ONE top-down picture in the locked style and
sliced by `scripts/import-map.mjs` into a unique-tile tileset + Tiled map
(art_pipeline §5 "grid snap"). Each `<name>.png` has a `<name>.spec.json`
beside it: tile count, solid rectangles, spawns and zones, authored by
looking at the render on a 32px grid. `pnpm art` re-imports every spec.

| Raw | Generated with | Date | Prompt gist |
| --- | --- | --- | --- |
| `whitefield_hotel.png` (1536×1024 → 24×16 tiles) | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-12 | "2D top-down RPG interior exactly like RPG Maker MV / FireRed indoor map, orthographic, walls as flat bands along the top of each room; budget Whitefield hotel: reception (counter, bell, register, lift, clock, calendar, god-picture, tube light, carpet runner to double doors, chairs, water cooler) + one guest room (single bed, side table, AC, barred window, wardrobe, mirror, bathroom door, ceiling fan); cream plaster + green band; ~48 colours; no characters, no text" |
| `prashanth_layout.png` (1536×1024 → 36×24 tiles) | same | 2026-10-12 | "2D top-down RPG town map exactly like FireRed/LeafGreen / RPG Maker MV town, orthographic, flat roofs with the facade as a flat band beneath; narrow Whitefield residential lane left→right across the middle third, open drains, main-road strip at the left edge; top row: yellow PG with green gate · cream/maroon house with blue double gate, tulsi pot, kolam · glass co-living; bottom row: darshini (red-yellow awning) · provision store · two houses with scooters; poles, dustbin, sleeping dog, handcart; no people, no text" — first try |
| `shanthamma_pg.png` (1536×1024 → 24×16 tiles) | same | 2026-10-12 | "RPG Maker MV indoor map, walls as flat bands; shared PG room in an old Bengaluru house, red-oxide floor, cream walls + pale blue band; left 70% bedroom (three steel cots, almirah, study table, bucket, clothes line, calendar, tube light, ceiling fan, barred window with green curtain); right 30% passage (shoe rack, water purifier, tiffin, front door + mat); no people, no text" — first try |
| `kempegowda_arrivals.png` (1536×1024 → 32×21 tiles) | same | 2026-10-13 | "RPG Maker MV / FireRed interior, small scale (bench seat ≈ 1/45 of the width): Bengaluru arrivals hall at dawn — windows with dawn sky, blank display screens, EMPTY oval baggage carousel, curved info desk, kiosk (water, snacks, SIM rack), benches, plants, trolleys, glass wall with an exit gate + green lamp + mat; outside: canopy, tea stall, blue-white bus shelter, bougainvillea planters, bollards, taxi lane; no people, luggage, vehicles or text" — reroll 1 (the first had no door). The model drew the glass wall closed, so the spec's `patches` carries the mat through it |

Outdoor lanes work the same way as interiors: shops whose open fronts face the viewer are served from the pavement BELOW them, so leave a walkable strip along the bottom edge and a way down to it.

Since the P5 audit (ADR-99/100), specs are authored in **source pixels** (`"units": "px"`): blocks trace where things meet the ground, spawns are feet points, occluders are cut out of the render. Pick `cols`/`rows` for scale (interiors 10×7 from a 1536×1024 render: cot ≈ 2 tiles). Check with a debug preview (blocks + occluders over the darkened map) and walk every route in the browser before the audit.

Rules that worked: say "walls as flat bands along the top of each room", list the rooms with their share of the width, name every prop, end with "fill the whole image edge to edge; no outside, no border".
