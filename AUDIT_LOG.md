# NAMMA OUTBREAK — Audit Log
> After each phase the user audits; Claude records corrections here as REUSABLE style rules, then applies them to all later phases.
Updated: 2026-10-12

## Format
### [Phase] — YYYY-MM-DD
- Correction: <what the user asked to change>
- Rule going forward: <the generalised rule Claude will now always follow>

## Entries

### [P0 foundations] — 2026-10-12
- Correction: the game is titled **Bangalore Times** (not Namma Quest / Namma Outbreak).
- Rule going forward: every user-facing string, package/app id and doc header says *Bangalore Times*; "NAMMA OUTBREAK" survives only inside the settled `docs/design/` files as the historical working title. Never introduce a third name.
- Correction: on ADR-66 (`src/` layout) and ADR-67 (layer names) the user delegated: "if anything better is there you can make it". Decided: keep both as built.
- Rule going forward: when the user delegates an engineering call, record the decision in `DECISIONS.md` and move on — do not re-ask. Reserve audit questions for taste, story and product calls.
- Correction: ADR-75 (Capacitor appId / SPM / plugins) was not understandable as written.
- Rule going forward: proposed ADRs shown at an audit get a one-line plain-English "what this means for you" before the technical text; purely technical calls with no product impact are decided, not asked.
- Mobile smoke: **sync OK, not booted** (no Xcode / Android SDK on this Mac — T-018).

### [P1 Style Lock — round 1] — 2026-10-12
- Correction: candidate B's **rendering** (GPT image model: rich, slightly muted colour, detailed facades) is the register the user wants; candidate A rejected. But neither matched the **camera** of the references: the game must read as Pokémon LeafGreen / RPG Maker top-down.
- Rule going forward: every environment prompt states the camera explicitly and negatively — "orthographic, straight down, no perspective, no vanishing point, no isometric, no horizon; flat roof on top with the front facade as a flat band beneath; street runs left→right on a 32px grid". "3/4 top-down" alone is not enough — image models read it as isometric.
- Rule going forward: when picking between candidates, judge camera/projection first, rendering second — projection is what the tile pipeline cannot fix afterwards.

### [P1 Style Lock — locked] — 2026-10-12
- Decision: **candidate D locked** as `src/assets/_meta/style/style_sheet.png`; its 48 colours are `src/assets/_meta/palette.gpl`. (C: richer facades but taller than a LeafGreen map draws them; A/B rejected in round 1.)
- Correction: the style sheet is a reference, never game content. The people drawn in it are not sprites.
- Rule going forward: nothing is ever cut out of a reference image. Tiles, placed objects and characters are each generated as their own sheets (tilesets → Tiled layers; objects → depth-sorted placed layer; characters → 32×48 sheets on the entity layer), all quantised to `palette.gpl`. Reference images are cited in prompts, not loaded by the game.

### [P2 Character creation — round 1] — 2026-10-12
- Correction: the code-drawn rig v2 sprites "are not at all like the screenshots" — the references have rounded heads, large eyes with whites and irises, hair with strands and highlights, 2–3 shade tones per material, soft coloured outlines. A rectangle rig cannot reach that.
- Rule going forward: character and prop art is **generated in the reference style and imported** through the pipeline (art_pipeline_v1 §4–5: chroma-key → grid-snap → bottom-align → quantise to `palette.gpl` → pack), never drawn as rectangles in code. The procedural generator is for ground tiles and placeholders only.
- Rule going forward: before showing any sprite to the user, put it side by side with the reference at the same zoom and ask "would this sit in the reference sheet?" — if not, don't ship it to the audit.

### [P2 Character creation — round 2] — 2026-10-12
- Correction: "better than the previous sprites", but (1) the standing pose appears twice per row — one is enough; (2) in the side views the walk frames do not swap legs: the same leg stays in front, so the stride never visibly changes.
- Rule going forward: sheet contract is **3 frames per row — [stride, idle, opposite stride]** (96×192). The animation plays 0,1,2,1; the sheet never stores a duplicate frame. Matches the user's reference sheets.
- Rule going forward: a walk cycle's two stride frames must be visibly different; in profile the near and far leg must swap. The import pipeline measures the two strides per row and, if they are near-identical, synthesises the opposite stride (mirror the leg band about the hips) rather than shipping a stride that does not alternate. Generation prompts spell out which leg is forward in each cell.

### [P2 Character creation — approved] — 2026-10-12
- Decision: round 3 approved ("yes looks better"). Player bases locked: `_raw/characters/player_m.png`, `player_f.png`; sheet contract 96×192 [stride, idle, opposite].
- Mobile smoke: sync OK, not booted (T-018).

### [P3 M0 minimal loop — approved] — 2026-10-12
- Decision: approved ("go for P4"). No corrections raised.
- Mobile smoke: joystick + A verified on a phone viewport (stepped loop; pane hidden); sync OK, not booted (T-018).

### [P4 Hotel — approved] — 2026-10-12
- Decision: approved ("proceed"). No corrections raised.
- Mobile smoke: unchanged since P3 (no new input surface); sync OK, not booted (T-018).

### [P5 PG Hunt — round 1] — 2026-10-12
- Decisions: Shanthamma's voice approved as drafted (T-025); ADR-97 food drain (−1 per 6 game minutes) confirmed over the profile doc; HiveNest ₹62,000 retune confirmed.
- Correction 1: the walking crowd was the old code-drawn rig — "not according to what we discussed, their art style is different". Static NPCs and the player were fine.
- Rule going forward: **every character on screen — player, named NPC, walking crowd — comes through the generated-sprite pipeline.** No rig or tinted placeholder ships to an audit (extends ADR-98 to the crowd).
- Correction 2: in the generated lane the lamppost did not cover the player walking behind it; the player walked over ground objects and static NPCs; some road was blocked for no visible reason; at the blue gate the player's feet went up onto the gate instead of stopping at its bottom edge.
- Rule going forward: **collision follows the art, at pixel precision, where things meet the ground** — gate and wall bottoms, pole bases, bins, cart wheels, table legs, scooters, trunks. Air is never blocked (no blocking a canopy or the space above a pole); roads and pavements are open unless something visibly stands on them.
- Rule going forward: **anything that stands up in front of a character behind it is an occluder** — lamp, poles, canopies, gate pillars, carts, counters — a transparent cut-out of the render depth-sorted by the line where it meets the ground. Low foliage at the edge of a path is an occluder, not a wall.
- Rule going forward: **people are solid.** NPCs and the crowd have feet bodies the player cannot walk through.
- Rule going forward: before showing a generated map, render the debug preview (blocks + occluders over the darkened map) and walk every route in the browser — road, lane, both pavements, every shop front, every door.
- Correction 3: inside the PG room the player was tiny next to the table and chair, and the whole background looked enlarged.
- Rule going forward: **interiors are imported at the characters' scale** — a cot about 2 tiles, a chair under 1 tile, art pixels close to sprite pixels. A room smaller than the screen sits centred on black, like Pokémon LeafGreen. Specs are authored in source pixels so the scale is one number (`cols`/`rows`).
- Mobile smoke: joystick moves the player in the lane on a phone viewport; sync OK, not booted (T-018).

### [P5 PG Hunt — approved] — 2026-10-12
- Decision: round-1 fixes approved ("approved, go for P6").
- Request before P6: rebuild the opening title screen after a reference screenshot (a fan-made pixel title: big blocky logo top-centre, living landscape, short menu with a sprite cursor), "in our native style", with motion and warmth — "a cityscape with moving trees and cars along with actions to proceed".
- Rule going forward: a reference image from the user is a **style and layout reference only** — nothing is copied from it (no characters, lettering or composition details); everything is generated in our own Bengaluru context.
- Rule going forward: the title screen is the game's first promise — warm (golden hour), alive (traffic, metro, clouds, birds, falling petals, the newcomer walking in) and still fully legible with reduced motion (everything shown, nothing moving).

### [Idle breathing — round 1] — 2026-10-12
- Correction: "the whole body is moving up and down" — the whole-sprite 1px offset (ADR-106) lifted the feet off the ground; the character floated.
- Rule going forward: **Breathing = upper body only, 1px DOWN at the waistline, feet planted, baked frames, never whole-sprite offset.** Head dips first, then head+torso (overlapping action); never shift up (it would open a gap at the waist).
- Rule going forward: breath lines (`head_y`, `waist_y`) are per character and direction in `_raw/characters/breath.json`, proposed by detection + eye and approved by the user before any batch bake.

### [Breathing parked + playground direction] — 2026-10-12
- Decision: breathing switched OFF for now ("still the whole body is moving… switch it off and proceed; we can come back to this"). `CORE_BEHAVIOURS` is empty; the baked-frame pipeline (ADR-107) stays for later (T-029).
- Rule going forward: seated characters (on a chair, bench) never breathe — `breathing: false` for any sitting pose when breathing returns.
- Direction for the Test Playground (during the build): keep it simple — no wall of properties; a short read-only summary and the main actions, input fields only on request (closed "Edit…" folds); light mode by default with a dark toggle; left and right panel widths draggable; a phone-in-landscape simulation with thumbs and controls as its own item in the left panel, its settings on the right.
- Request recorded for the next task: replace the demo airport (the user's early rudimentary version) with a brand-new airport in the current generated style, related to the next scenes — keep the luggage carousel and make it move with luggage on it; replace every placeholder airport character with generated sprites (T-031).

### [Airport rebuild — built] — 2026-10-13
- Request (user): "remove this one and make something relatable to the next scenes… keep the carousel, make the carousel move with the luggage moving on top… replace the rudimentary sprites in the airport scene."
- Built: generated arrivals hall + kerb (`kempegowda_arrivals`, same pipeline and rules as the lane: pixel collision at ground lines, occluders, people solid), moving luggage carousel (`beh_carousel`), all six airport placeholders replaced with generated sheets; the old reference-project tilesets of unknown provenance are deleted.
- Rule going forward: when a generated render draws a doorway shut, open it with a reproducible spec `patch` (copy part of the same render), never by hand-painting the raw.
- Mobile smoke: joystick drives the player in the airport inside the playground's iPhone 15 frame. Finding from the simulation: at a real iPhone size the HUD + quest panel cover about a third of the screen (T-024).

### [Airport, Test Playground, title screen — approved] — 2026-10-13
- Decision: "approved, go for P6" — covers the new airport (ADR-109), the Test Playground (ADR-104/105/108) and the living title screen (ADR-101/102). ADR-101 (title keeps its own 64-colour palette) stands — not superseded.
- Breathing stays parked (T-029).

### [P6 style board + mocks — approved] — 2026-10-13
- Brief (user): a full UI style board for P6 — phone, fullscreen map, HUD, menus, font — with 4 reference images (dark symbolic map; notched phone with pill lists; olive dot-matrix LCD app grid; colour party plates). Mocks approved: "OK, start P6a".
- Decisions: ADR-113 (no minimap, fullscreen map only — the brief's "ADR-65") and ADR-114 (style board, Pixelify Sans, separate UI palette — the brief's "ADR-66"); renumbered because 65/66 were taken.
- Correction (user, on image numbering): "use them as per requirement, think like an art director and take the best call."
- Rule going forward: **when the user hands over art direction, decide, show it in the mock, and log the call in the ADR** — don't send the choice back as a question. Ask only where the brief conflicts with a logged decision.
- Rule going forward: **reference images are style references only** — never trace their artwork, icons, wallpaper or real app names; draw our own in that style (and no real brands — `NAMMA NET`, `NAMMA PAY` are parodies).
- Rule going forward: **one UI family**: map-style label cards (grey 2px border, open right edge, dotted trail), phone-style pills, block rows for every meter/slider; every piece is a UI-kit molecule with default / focus / pressed / disabled / locked.
- Rule going forward: **UI text is the bitmap font, never browser-rendered** — Pixelify Sans sampled on its own grid, integer scales only, pixel bold; any glyph that reads wrong at 1× is hand-drawn in `scripts/import-font.mjs` OVERRIDES (so far ₹ 5 Z B ( ) , and UI marks), and every player-visible string must be drawable (validator).
- Rule going forward: **touch zones ≥ 44 game px (≈ 48pt on an iPhone 15)** even when the drawing is smaller; nothing tappable in the bottom 19px (home indicator); motion stepped, reduced motion collapses it.
- Rule going forward: no raw hex — UI colours come from `ui-palette.gpl` tokens (`phone.*`, `hud.*`, `map.*`), translucency via `rgba(token, a)`.

### [P6a phone + font — approved] — 2026-10-13
- Decision: "approved, go for P6b" — covers the bitmap font (incl. the hand-drawn ₹ 5 Z B ( ) , and keeping Pixelify's H tooth), the UI palette, the kit molecules and PhoneScene. No corrections raised.
- Mobile smoke: phone opens by button tap and keys inside the playground's iPhone 15 frame; touch zones ≥ 48pt; dock clear of the home indicator; joystick + A hidden while open. Native: sync OK, not booted (T-018).

### [P6b map — approved, then extended] — 2026-10-13
- Decision: "approved, go for P6c" — the fullscreen symbolic map (ADR-115) stands.
- Request (user, before P6c): make the map relatable to the real place — "if they know the Prashanth Extension area in real life they can feel what is there before they explore", legible routes only, and "the game area should be proportional to what the player sees in the map". Choices made by the user: OpenStreetMap data (ODbL, credited); map side first (Area view), pocket art unchanged; anchor to the real Prashanth Extension, keep the name Prashanth Layout.
- Rule going forward: **every outdoor pocket has a real place**: `realworld.area` + an OSM extract (`scripts/fetch-osm-area.mjs`) + a pocket placement at character scale (1.2 m/tile) whose `tiles` equal its tilemap — the map box is always the true size of the walkable map.
- Rule going forward: **new pockets (P7+) are generated to follow their real streets** from the start (the lane's direction and junctions match the OSM extract); the Prashanth pocket is re-laid only if the user asks.
- Rule going forward: map data from OpenStreetMap only (never copied from Google Maps); "© OpenStreetMap contributors" visible wherever OSM data is drawn.
- Also: Test Playground moved to its own port 6175; mock boards live in the repo under `docs/mocks/` and run on 6176 (ADR-116).
