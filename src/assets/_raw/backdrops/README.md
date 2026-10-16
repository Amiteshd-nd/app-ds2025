# Raw backdrops (pipeline input — never loaded by the game)

`scripts/import-backdrop.mjs` (inside `pnpm art`) keys the magenta out of each strip, paints the shape in one palette colour and scales it to the game's width → `src/assets/backdrops/<name>.png`. The sky behind it is drawn by code from `sky.*` tokens, never by the image.

| Raw | Used by | Generated with | Date | Prompt gist |
| --- | --- | --- | --- | --- |
| `skyline_whitefield.png` (1920×640 → 640×213) | `WorkdayScene` (story 1.1 F4, ADR-121) | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-16 | "flat solid black silhouette strip of the Whitefield tech-park skyline from a fourth-floor window — glass towers of different heights with water tanks and masts, a construction crane, a metro viaduct on pillars, coconut palms, a water tower, low rooftops at the edges; magenta background; no text" — first try |
