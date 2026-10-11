# NAMMA OUTBREAK — Design System v1.0
> Single source of truth for how the game LOOKS and FEELS. Everything is a named token, defined once, referenced by id. Mirrors the atomic trees. Obeys ADR-30 (confirm against user references before locking).

## 1. Colour tokens (48-colour master → `assets/_meta/palette.gpl`)
Named roles, not raw hex scattered in code. (Hex set at P1 Style Lock from user refs.)
| Token | Role |
|---|---|
| `c.ground.tar`, `c.ground.paver`, `c.ground.mud`, `c.ground.grass`, `c.ground.water` | ground |
| `c.brick`, `c.plaster.cream`, `c.plaster.pastel`, `c.tank.black`, `c.grille` | buildings |
| `c.skin.1..5` | 5 Indian skin tones |
| `c.accent.auto` (yellow), `c.accent.bmtc` (blue-grey), `c.accent.metro` (purple), `c.accent.uv` (purple-blue) | identity |
| `c.ui.bg`, `c.ui.panel`, `c.ui.text`, `c.ui.text.dim`, `c.ui.line`, `c.ui.good`, `c.ui.warn`, `c.ui.bad` | UI |
| `c.time.morning/noon/evening/night` | time-of-day tint multipliers |
| `c.state.desat20`, `c.state.desat50`, `c.fog.green`, `c.vignette.red` | stability grades (ADR-27) |
Rule: no raw hex in code or art; everything references a token. Outline = always `c.ui.line` (1px dark).

## 2. Grid & spacing
Base unit = **32px** (1 tile). Characters 32×48. Doors 32×48. UI spacing in multiples of 8px (8/16/24/32). Camera: integer scale only, `roundPixels` on. No sub-pixel art.

## 3. Typography
One pixel font (e.g. a free CC0/OFL pixel font). Sizes: `t.hud` (small), `t.body` (dialogue), `t.title`. Kannada+English dual rendered as texture where diegetic (signboards). No anti-aliasing. Line length ≤ 40 chars in dialogue boxes.

## 4. UI kit (molecules → `assets/molecules/ui/`)
Panel (9-slice), button (idle/hover/press/disabled), input field, toggle, dropdown, cursor, toast ("₹ credited"), meter bar (health/food/stress/stamina/fuel/battery/signal), padlock icon, `!`/`?` markers, choice list (accept/decline/later). All on `c.ui.*` tokens. States mandatory (never a single-state control).

## 5. HUD (organism)
Minimal, top-left stack: health, food, stress (only when >0), wallet. Contextual: fuel (on scooter), signal (on hill), battery (phone open). Rule: **a meter appears only when relevant**; never clutter. Feedback tokens: `fx.spend` (coin particles), `fx.clue` (sparkle), `fx.hit` (red flash + shake), `fx.detect` (sting), haptic on Android.

## 6. Phone (nested organism → molecules)
Frame (atom) → app icons (molecules: maps, chats, call, upi, reels, news, gallery, dating) → panels (renderers: list/feed/map/pay/call). One `network` token drives all Act 4 degradation ("server busy", no signal). Apps greyed until their mechanic is taught (ADR-39).

## 7. Motion
Area transition: fade-to-black 400ms + 4-step auto-walk (LeafGreen). Dialogue: typewriter 30ms/char, skippable. Encounter: 100ms flash + 0.5s slow-mo (no freeze, ADR-50). Everything else snaps (pixel game); no easing on sprites.

## 8. Audio tokens (→ AudioSystem, ADR-29)
Beds: `a.bed.normal/warning/infected/deep`. Stings: `a.sting.detect`, `a.ui.ding`, `a.ui.buzz`. Music: `a.music.calm/chase/relief`. Driven by stability/noise/chase tokens. Crossfade times fixed (3s approach, 5s return).

## 9. State grading (one rule, whole game — ADR-27)
`grade(stability)` → sets `saturation`, `tint`, `fog`, `vignette`, audio bed, NPC density, infected density. Levels 0–4 (safe→ground zero). Same function for City Pulse and `_ruined`. **No per-scene bespoke grading.**

## 10. Governance
- New colour? Add a token or reuse; never raw hex. New control? Must have all states. New sound? A token.
- `_index.json` + validator enforce it. Design changes = edit a token = propagates. This file is the contract; CLAUDE.md §0 points here before any visual work.
