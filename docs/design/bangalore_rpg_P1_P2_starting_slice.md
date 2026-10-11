# NAMMA OUTBREAK — Starting Slice Recipe: P1 Style Lock + P2 Character Creation & Select v1.0
> Agile: build P1, audit, then P2, audit. Exact pipeline, tools, and prompts below. Zelter-angle (3/4 top-down). Tiles 32×32, characters 32×48.

## How a pixel scene is built (shared vocabulary)
A scene = a grid of 32×32 tiles in stacked LAYERS, assembled in **Tiled** (our engine reads Tiled JSON):
1. `ground` (roads, mud, grass) → 2. `ground_detail` (paint, manholes, puddles) → 3. `props_below` (wall bases) → 4. **player/characters** → 5. `props_above` (tree tops, awnings — draw over player) → 6. `collision` (invisible, marks blocked tiles).
Two art jobs: **tilesets** (reusable Indian pieces) and **character sprite sheets**. We never trace real photos; photos are reference only.

---
## P1 — STYLE LOCK (do first, one audit gate)
**Goal:** one approved reference image + a 48-colour palette that EVERY later generation copies, so the whole game looks like one game.
**Steps:**
1. User provides 6–9 Bangalore reference photos (a PG lane, a Darshini, an auto, a BMTC bus, a street). ← needed to start.
2. Claude Code (via Retro Diffusion) generates ONE 3/4-view street scene: an independent house + a Darshini + an auto + 2 people, morning haze.
3. Iterate with the user until approved.
4. Extract palette → `assets/_meta/palette.gpl` (48 colours). Save prompt + seed + model → `assets/_meta/style.json`. **This image = reference #1 for all future gens.**
**P1 prompt (Retro Diffusion):**
> `32-bit top-down pixel art, 3/4 perspective (Zelter style), Bangalore India street, narrow 3-storey independent house exposed red brick + cream plaster, black Sintex water tank on roof, grille balconies, overhead cable tangle, a small "Darshini" standing-eatery with steel counter, a black-and-yellow auto rickshaw, two Indian pedestrians, broken footpath slabs, rain-tree, muted desaturated warm palette, soft warm shadows, clean 1px dark outline, no anti-aliasing, grid-aligned, morning haze`
**Audit gate:** user says "that's the look" → lock. Record any style corrections in AUDIT_LOG.

---
## P2 — CHARACTER CREATION + SELECT (second audit gate)
### 2.1 The form (mostly UI, little art)
Pixel "offer-letter" panel. Fields → `player.profile` (profile doc §1): name, gender (M/F), age (20–26), hometown (state dropdown + town), college, degree.
**age + gender assign the sprite** (user decision): young-adult male or female base; age tunes face slightly (fresher vs late-20s). No player sprite customisation — assigned, not customised (user decision).
Art needed: 1 panel frame, input field tiles, 1 button, cursor. Minimal.

### 2.2 Character sprites — how they're made
**Tool: PixelLab** (built for game characters: skeleton → 4-direction walk + idle, commercial use OK). Pipeline: generate base body → generate attire as layers → composite at load by hash → run through `asset_pipe.py` (palette quantise to palette.gpl, 1px outline, pack sprite sheet).
**Structure:** base body × attire layer × skin tone (5 Indian tones). 32×48. 4 directions (down/up/left/right) × walk (4 frames) + idle (1). Build ONLY 2 bases now (M, F) in default office-commute attire; more attire later.

### 2.3 P2 PROMPTS (PixelLab) — included for user to eyeball & correct
**Male base:**
> `32x48 pixel character sprite, top-down 3/4 view (Zelter style), young Indian man early 20s, wheatish skin, short black hair, formal light-blue shirt and grey trousers, black backpack, fresh-graduate look, clean 1px dark outline, muted palette matching reference, no anti-aliasing. Generate 4-direction walk cycle (down/up/left/right, 4 frames each) + idle.`
**Female base:**
> `32x48 pixel character sprite, top-down 3/4 view (Zelter style), young Indian woman early 20s, wheatish skin, dark hair in a low bun, kurti and leggings, sling bag, fresh-graduate look, clean 1px dark outline, muted palette matching reference, no anti-aliasing. Generate 4-direction walk cycle (down/up/left/right, 4 frames each) + idle.`
**Skin-tone variants:** regenerate each base swapping `wheatish skin` → `light wheatish | wheatish | dusky | deep brown | dark brown` (5 tones). Keep everything else identical (same seed where possible) so only skin changes.
**Reference:** pass the P1 locked image + style.json as a reference image to every character gen so palette/outline match.

### 2.4 Acceptance for P2
- Form writes a valid `profile` object; wrong age/gender still playable (profile gates flavour only, ADR-15).
- Selecting shows the correct assigned sprite walking in 4 directions on a test tile.
- Sprites sit on palette.gpl; 1px outline; readable at game zoom.
- **Audit gate:** user reviews the 2 sprites + form look → corrections → AUDIT_LOG → proceed to P3 (M0).

## What Claude Code needs from the user to START
**Claude Code asks the user directly** (not pre-collected): 1. 6–9 Bangalore reference photos (P1). 2. Any UI reference for the form look (ADR-30). Only then does P1 generation begin.
