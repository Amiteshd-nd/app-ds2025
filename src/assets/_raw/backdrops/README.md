# Raw backdrops (pipeline input — never loaded by the game)

`scripts/import-backdrop.mjs` (inside `pnpm art`) keys the magenta out of each strip, paints the shape in one palette colour and scales it to the game's width → `src/assets/backdrops/<name>.png`. The sky behind it is drawn by code from `sky.*` tokens, never by the image.

| Raw | Used by | Generated with | Date | Prompt gist |
| --- | --- | --- | --- | --- |
| `skyline_whitefield.png` (1920×640 → 640×213) | `WorkdayScene` (story 1.1 F4, ADR-121) | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-16 | "flat solid black silhouette strip of the Whitefield tech-park skyline from a fourth-floor window — glass towers of different heights with water tanks and masts, a construction crane, a metro viaduct on pillars, coconut palms, a water tower, low rooftops at the edges; magenta background; no text" — first try |
| `still_hebbal_night.png` (1536×864 → 640×360, own 32 colours) | `CardScene`, `card_orr_night` (story 3.1, ADR-136) | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-17 | "16-bit era pixel art … the Hebbal flyover junction in Bangalore at midnight, seen from the seat of a small scooter: handlebar and round mirrors in the foreground, a wet road, a curving flyover on round pillars, sodium lamps, a signal blinking amber, a shuttered shop, coconut palms, a blank hoarding, light drizzle; one motorbike headlight on the down-ramp; blue-violet night; no text, no logos; fill edge to edge" — first try (the lake on the right is Hebbal lake) |
