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
