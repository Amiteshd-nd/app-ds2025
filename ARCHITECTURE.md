# Architecture (current state)
Updated: 2026-10-12 — after P0 + P1 candidates. Places are data; no scene per place.

## Scenes (`src/scenes/`)
| Scene | Role | Status |
|---|---|---|
| `BootScene` | loads every sprite sheet / tileset / tilemap by glob, registers `<sheet>-walk/idle-<dir>` anims, placeholder textures; starts `registry.startDistrict` (→ World) or `registry.startScene` (default Title) | keep |
| `WorldScene` (M0 content) | airport: 7 NPCs incl. `npc_chai_anna` (generated sheet), cab tout, HIVR lanyard man; `hivr_zone` trigger sets `seen_hivr_lanyard`; exit `zone_exit` fare ₹250 → `whitefield_street` | P3 |
| `WorldScene` (hotel) | `whitefield_hotel`: reception NPC (check-in sets `hotel_checked_in` → countdown), `room` trigger → Divya's call, `bed` trigger → sleep (fade, next 07:00), `exit` → street `hotel_door`; `hotelNightTimer` behaviour | P4 |
| `WorldScene` (PG lane, P5) | `prashanth_layout`: six NPCs (gate owner `unlessFlag pg_token_paid`, Leela, Shanthamma, Rhea, Raju, Basavaraj), `lane_arrival` trigger, exits `main_road` → street `lane_return` and `gate10` → `shanthamma_pg` (locked until `pg_signed`, `lockedText`). `shanthamma_pg`: `doorway` sets `pg_moved_in`, `bed` = Amma's call once (`unlessFlag amma_called`) + sleep | P5 |
| `TitleScene` | living golden-hour Bengaluru (ADR-101/102): `src/assets/title/*` from `scripts/import-title.mjs`; traffic, metro, clouds, birds, petals, lamp glow, walker; reduced motion = everything placed, no tweens. New Game (resets store → CharacterSelect) · Continue (restores save → `WorldScene{districtId,x,y}`) · Settings (P6) | P5+ |
| `CharacterSelectScene` | character creation: offer-letter form (name, gender, age, home state/town, college, degree, skin) → `store.setProfile` (derives sprite) → 4-direction walk preview on test tiles → `WorldScene{airport}`. Hidden DOM `<input>` for text (mobile keyboard) | P2 |
| **`WorldScene`** | the ONE place renderer: `create({districtId, spawnId?, x?, y?, fromDistrict?})` reads `districts.json` + `maps.manifest.json`; layers in `layerOrder`; Populate / Exits / Triggers / behaviours; dialogue + E-interact; autosave on entry and shutdown. **No district-specific branches.** | new |
| `TransitScene` | fade-to-black between places; ride card ("Vayu Vajra KIA-8 → Whitefield") for bus/metro/cab/scooter, plain fade for walk; lands `WorldScene{to, spawn}` | new (minimal) |

## Data flow
`src/data/index.ts` globs `dialogue/ quests/ items/ npcs/ objects/` + `districts.json` → managers in `src/systems/` (Stats, Inventory, Quest, Dialogue, Reputation, Save — singletons, rules only) → `src/store.ts` (Zustand; same shape as `SaveData`; `activeDistrict`, `appearance`) → WorldScene + React HUD (`BangaloreTimes.tsx`, shown only in `WorldScene`).
World modules emit facts on `src/core/events.ts` — `zone:reached {zoneId, districtId}`, `district:entered`, `entity:interacted`, `dialogue:ended`, `item:added` — and `QuestManager` draws conclusions. Exits emit `zone:reached` *before* checking `ReputationManager.canEnter(to)`, so a quest whose last objective is "reach the exit" completes and opens the gate in the same step.

## District entry (`src/data/districts.json`, type `DistrictDef`)
`id · name · map (manifest key) · defaultSpawn · fadeMs? · unlock?{quest, reputation, flags} · quests?[] (started on entry) · npcs?[{id, spawn}] · objects?[{id, at, requires?}] · ambient?{base[], count, area?} · exits?[{zone, to, spawn, transit, card?}] · triggers?[{zone, once?}] · behaviours?[]`
NPC definitions live once in `npcs/*.json` (`id, name, tier, dialogue?, sheet?, tint?`); a district only says who stands where. Zones/spawns are objects in the map's `Spawns` layer (rect → its bounds; point → 3×3 tiles).

## Save (`SaveManager`, v1.2.0)
`player.position = {districtId, x, y}` — never a scene class. Migrations: 1.0.0/1.1.0 map `position.scene` via `LEGACY_SCENE_DISTRICTS` (unknown → airport). Only `TitleScene.continueGame` restores; `WorldScene` never hydrates from disk, so New Game cannot inherit an old run.

## Folder map
```
src/
├── assets/        maps.manifest.json (layerOrder + per-map layers/spawns), maps.ts (MAPS, LAYER_ORDER), index.ts (glob → URLs)
│   ├── tilemaps/  airport_interior.tmj (hand), whitefield_street.tmj (GENERATED — edit scripts/generate-street-map.mjs)
│   ├── tilesets/  airport*.png (reference, placeholder), street.png (+ street.tiles.json)
│   └── sprites/   player.png (reference), citizen*.png (generated rig × 8 palettes)
├── core/          events.ts (typed bus), depth.ts (zY → depth)
├── data/          districts.json · dialogue/ quests/ items/ npcs/ objects/   (scenes/ arrives in P3)
├── entities/      Player.ts, PlacedObject.ts
├── scenes/        Boot · Title · CharacterSelect · World · Transit
├── systems/       Stats · Inventory · Quest · Dialogue · Reputation · Save
├── world/         Zones.ts (findObject, zoneFromObject, EntryWatcher) · Populate.ts (npcs/objects/wander) · Exits.ts · Triggers.ts · behaviours/{index,names}.ts
├── ui/            DialogueBox.ts
├── utils/         constants.ts (SCENE_KEYS, LAYER_DEPTH, START_DISTRICT, FADE_MS…), types.ts, placeholders.ts, hue.ts
├── store.ts · PhaserGame.tsx · BangaloreTimes.tsx (HUD) · main.tsx · index.ts (library entry)
│   └── _meta/     platform.json · style.json (P1 lock record) · style/ (candidates, .gpl palettes, swatches)
scripts/           validate-*.{mjs,ts} · generate-art.mjs · generate-street-map.mjs · extract-palette.mjs · art/ (canvas, palette, tiles, character, quantize)
```

## Time (P4, ADR-91)
`TimeManager` (singleton, engine-free) over `store.clock`; `tick(deltaMs)` from `WorldScene.update` while free; `advance()`, `sleep()`; `counters` for behaviours. HUD shows `Day N · HH:MM`.

## Behaviours (ADR-93)
`src/world/behaviours/`: `index.ts` registry + `names.ts` (validator list). `hotelNightTimer` is the worked example. Triggers: `setFlags`, `dialogue`, `action: 'sleep'`. Quest objectives: `interact | dialogue | collect | reach | flag`.

## Negotiation (P5, ADR-95)
`src/data/negotiations/<id>.json` (`NegotiationDef`: terms ask/floor, counters reason|compare|lowball, lines, on_deal flags/counters) → `NEGOTIATIONS` → `systems/NegotiationManager.ts` (`Negotiation` session: options, choose → null | 'deal' | 'walk'; `TEMPERAMENTS` table in constants). A dialogue node `negotiate: {id, deal, walk}` runs it inside `DialogueManager` (view gains `ledger`); `DialogueBox` sizes itself to the line + bill + up to 6 choices. Progress persists as counters `neg.<id>.<term>` and flags `neg.<id>.used.<counter>`. Emits `negotiation:ended`.

## Memory of the world (ADR-96)
Dialogue `enter: [{flag, node}]` · district NPC `unlessFlag` (WorldScene fades them after the dialogue that set it) · trigger `unlessFlag` · exit `lockedText` · effect `reputation`.

## Food (ADR-97)
`TimeManager.advance` drains food 1 per `FOOD_MINUTES_PER_POINT` (6) awake minutes; below `HUNGRY_AT` the Player walks at `HUNGRY_SPEED`. Sleep resets the carry.

## Shapes: collision + occlusion for generated maps (ADR-99/100)
`_raw/maps/<name>.spec.json` in source pixels → `import-map.mjs` → `.tmj` `Shapes` layer (`solid` rects, `occluder` objects with `image` + `baseY`) + `src/assets/overlays/<map>__<name>.png`. `world/Shapes.ts` builds static bodies and depth-sorted images (same band as characters, `depthForZY(baseY)`). NPCs join a static group with 20×12 feet bodies; the crowd (`crowd_*` sheets) collides with the player. Maps smaller than the screen are centred on black (`WorldScene.frameCamera`).

## Maps (ADR-92)
`src/assets/_raw/maps/<name>.png` + `<name>.spec.json` → `scripts/import-map.mjs` → `tilesets/<name>.png` + `tilemaps/<name>.tmj` (unique tiles). `whitefield_hotel` was the first; P5 added `prashanth_layout` (outdoor lane, 36×24) and `shanthamma_pg`. Streets still use the procedural `street.png` (T-021).

## Stats & economy (P3, ADR-87)
`PlayerStats` = health · wallet · social · stamina · food · stress · battery (`STAT_BOUNDS` clamps). `StatsManager.spend(cost, reason)` → `wallet:spent` or refusal; `earn()` → `wallet:earned`; `meet(npcId)` → social +1 once (`met` ledger). `applyEffect` routes negative `wallet` through `spend`. `DialogueManager` locks unaffordable choices with "Needs ₹N". Exits with `fare` spend on boarding. Save 1.4.0.

## Input (ADR-88)
`src/input/InputMap.ts` — axis/run/interact written by `TouchControls.tsx` (joystick + A, coarse-pointer only, safe-area CSS) and merged with keyboard inside `Player.update()`.

## Scene components (ADR-89)
`src/data/scenes/*.json` per SCENE_TEMPLATE → `SCENES`; validated against districts/quests/NPCs/pacing. `act0_arrivals` is the worked M0 example. Triggers may `setFlags`; exits may charge `fare`.

## Profile & sprites (P2)
`PlayerProfile` (`src/utils/types.ts`) + pure helpers in `src/utils/profile.ts` (`validateProfile`, `sheetForProfile`, `ALL_PLAYER_SHEETS`, states/degrees). Sheet key = `player_<m|f>_<skin>`; `pnpm art` imports `src/assets/_raw/characters/player_{m,f}.png` (generated 3×4 sheets) through `scripts/import-sheet.mjs` into 10 on-palette 3×4 sheets (96×192, [stride, idle, opposite]), and still draws the 8 citizen looks with `scripts/art/character.mjs` (to be replaced, T-022). Save 1.3.0 persists `player.profile`; older saves migrate name/homeState into a default profile.

## Design tokens
`src/assets/_meta/palette.gpl` (48 colours, P1 lock) + `scripts/art/tokens.mjs` → generated `_meta/tokens.json` → `src/ui/tokens.ts` (`hex`, `color`, `PALETTE`, `GRID`=8). Scenes use tokens, never raw hex. `validate-maps` fails any sprite sheet off-palette or not 96×192; tilesets warn until T-021.

## Platform (`src/platform/`, ADR-64)
`Platform.ts` = the interface (storage, saves, lifecycle, haptics, display, network, share, audio). `web.ts` implements it for browsers; `native.ts` spreads `web.ts` and overrides nothing yet (molecules arrive with their phases). `index.ts` picks one at boot via `Capacitor.isNativePlatform()`. Game code imports `{ platform }` from `src/platform` and nothing else — `scripts/validate-platform.mjs` fails the build otherwise. Used today: `platform.audio.unlock()` on the Title confirm (rule 8).
Native shells: `capacitor.config.ts` (webDir `dist`) → `android/` (Gradle) and `ios/` (Xcode, SPM). `pnpm cap:sync` = build + copy `dist/` into both. Icon/splash sources and feature flags: `src/assets/_meta/platform.json`.

## Validation (`pnpm validate`, runs before every build)
- `scripts/validate-maps.mjs` — tile size/orientation, layer taxonomy + order, hidden collision stencil, spawn + object layers, tileset images, City Pulse slot layer (named, unique, typed). **Warnings** (printed, non-fatal): doors not 32×48.
- `scripts/validate-platform.mjs` — no device/browser API outside `src/platform/` (ADR-76).
- `scripts/validate-content.ts` — `validateContent` (dialogue graphs, quests, items, NPCs, objects, district schema + references) and `validateWorld` (district ↔ map: every spawn/zone/area/pulse slot exists, exit landing spawns exist in the destination map, ambient sheets on disk, every district reachable from `START_DISTRICT`). **Warnings**: ADR-40 density (< 1 interactable per 10×10-tile screen).
- Tests drive both validators on the real data and on synthetic breakages (`validate-*.test.ts`).

## Rendering
640×360 native, `Scale.FIT`, `pixelArt` + `roundPixels`, integer upscale. Tiles 32, characters 32×48 (feet body 20×12 at offset 6,35). Layer depth from `LAYER_DEPTH[name]`; entities sort inside the ENTITIES band by bottom edge.

## Known debt
- Stat model is the old port (energy/stress/money ₹5,000, 4 educational backgrounds); the profile doc's model (ADR-15/17) lands in P2 (T-006/T-007).
- Quest types and reputation tier names are the old 10-type / Outsider→Important Player sets; T-015 migrates to ADR-18/22/26.
- `SaveManager` still talks to `localStorage` directly (allowlisted) — moves to `platform.saves` with the slot system (T-011).
- Native shells are generated and synced but unbuilt: no Xcode/Android SDK on this machine (T-018).
- Reference tilesets (`airport*.png`) are continuous-tone with unresolved provenance — placeholders until P1.
