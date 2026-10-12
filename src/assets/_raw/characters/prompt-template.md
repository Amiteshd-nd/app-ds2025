# Character sheet prompt template (locked at P2, 2026-10-12)

> A pixel art character sprite sheet for a 16-bit top-down RPG, in the style of Pokémon Emerald / Stardew Valley townsfolk sprites: chibi proportions, head about 40% of total height, rounded head, large expressive eyes with white and dark iris, small mouth, hair drawn with strands and a lighter highlight, clothes with two shade tones and soft dark outlines, crisp square pixels, no anti-aliasing, no blur.
>
> The character: **<description — age, skin, hair, attire, bag>**.
>
> Layout: a strict 3-column × 4-row grid of 12 equally sized cells on a flat solid magenta background (#FF00FF). Each cell contains exactly one full-body pose, centred, feet on the same baseline, no shadow.
> Row 1: facing DOWN toward the viewer — left foot forward step, standing idle, right foot forward step.
> Row 2: facing LEFT (profile) — step, idle, step.
> Row 3: facing RIGHT (profile) — step, idle, step.
> Row 4: facing UP, back to the viewer **<what shows from behind>** — step, idle, step.
> The same character at the same size in every cell. No text, no labels, no grid lines, no borders, no watermark, nothing else in the image.

Rules that made it work: name real games for the register, say "strict 3×4 grid" and "same size in every cell", put the background colour in hex, and describe what the back view must show so row 4 is not a guess.
