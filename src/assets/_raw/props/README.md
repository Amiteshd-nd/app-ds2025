# Raw prop sheets (pipeline input — never loaded by the game)

`pnpm art` runs `scripts/import-props.mjs`: each sheet is a strict grid on magenta, one item per cell; every cell is keyed, trimmed, scaled to the sheet's target height and snapped to `palette.gpl`, written to `src/assets/props/<name>_<nn>.png`.

| Raw | Grid / height | Generated with | Date | Prompt gist |
| --- | --- | --- | --- | --- |
| `luggage.png` | 4×3 / 18 px | Figma AI `generate_image`, gpt-image-2.5-sunburst, user's personal plan | 2026-10-13 | "twelve travel luggage items seen from above like RPG Maker objects, strict 4×3 grid on magenta: red/navy/silver/purple/orange/grey hard-shell suitcases, black soft case with a yellow ribbon, green duffel, tan leather bag, cardboard box tied with rope, blue backpack, checked jute bag; no text" — first try. Ridden around the carousel by `beh_carousel` |
