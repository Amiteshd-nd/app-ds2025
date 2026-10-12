# Raw title-screen art (pipeline input — never loaded by the game)

`pnpm art` runs `scripts/import-title.mjs` on these three files and writes
`src/assets/title/` (640×360 background, foreground cut-out, logo, 11 props),
each on its own 64-colour palette (ADR-101). Prop rectangles and target heights
live at the top of the script.

Style reference: a screenshot the user shared (a fan-made pixel title screen) —
layout and feel only, nothing copied (AUDIT_LOG, P5 approval).

| Raw | Generated with | Date | Prompt gist |
| --- | --- | --- | --- |
| `title_bg.png` (1536×864) | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-12 | "SNES/GBA pixel title-screen background, wide side view, Bengaluru at golden hour: clear upper sky for a logo; skyline in warm haze (glass towers, apartment blocks with water tanks, gopuram, domed government building, cranes, rain trees); elevated metro viaduct across the width (no train); an empty road with streetlamps switching on, bus shelter, chai stall; foreground park on a rise with a gulmohar tree, stone bench, marigolds, stone steps; open lawn centre-left for a menu; no people, vehicles or text" — first try |
| `title_props.png` (1536×1024) | same | 2026-10-12 | "separate items on magenta, side view facing right, golden-hour light: Bengaluru auto (yellow canopy, green body), red city bus, white hatchback, scooter with helmeted rider; purple three-coach metro; three warm cumulus clouds; flock of five birds; steel filter-coffee tumbler with steam; one gulmohar petal; no text" — first try |
| `title_logo.png` (1536×1024) | same | 2026-10-12 | "pixel title logo reading exactly BANGALORE / TIMES, chunky slanted blocky letters, marigold-to-orange fill, thick maroon outline, deep red 3D extrusion, on magenta" — spelled correctly first try |
