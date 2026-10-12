# Character sheet prompt template (locked at P2, 2026-10-12)

> A pixel art character sprite sheet for a 16-bit top-down RPG, in the style of Pokémon Emerald / Stardew Valley townsfolk sprites: chibi proportions, head about 40% of total height, rounded head, large expressive eyes with white and dark iris, small mouth, hair drawn with strands and a lighter highlight, clothes with two shade tones and soft dark outlines, crisp square pixels, no anti-aliasing, no blur.
>
> The character: **<description — age, skin, hair, attire, bag>**.
>
> Layout: a strict 3-column × 4-row grid of 12 equally sized cells on a flat solid magenta background (#FF00FF). Each cell contains exactly one full-body pose, centred, feet on the same baseline, no shadow. The three cells of a row are the three key frames of ONE walk cycle and must be clearly different from each other:
> Row 1, facing DOWN toward the viewer: cell 1 = character's LEFT leg stepped forward and right arm swung forward; cell 2 = standing still, feet together; cell 3 = character's RIGHT leg stepped forward and left arm swung forward (the mirror of cell 1).
> Row 2, facing LEFT in profile, walking to the left: cell 1 = the leg NEARER the viewer stretched forward and the far leg trailing behind; cell 2 = standing still in profile, legs together; cell 3 = the FAR leg stretched forward and the near leg trailing behind — the legs have swapped compared with cell 1, so the stride is visibly different.
> Row 3, facing RIGHT in profile, walking to the right: the same three frames as row 2 but facing right.
> Row 4, facing UP, back to the viewer **<what shows from behind>**: cell 1 = left leg forward; cell 2 = standing still; cell 3 = right leg forward.
> The same character at the same size in every cell. No text, no labels, no grid lines, no borders, no watermark, nothing else in the image.

Rules that made it work: spell out which leg is forward in every cell (otherwise both strides come back identical); name real games for the register, say "strict 3×4 grid" and "same size in every cell", put the background colour in hex, and describe what the back view must show so row 4 is not a guess.
