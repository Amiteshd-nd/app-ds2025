# Architecture (current state)
Updated: 2026-10-16

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
`src/data/index.ts` globs `dialogue/ quests/ items/ npcs/ objects/` + `districts.json` → managers in `src/systems/` (Stats, Inventory, Quest, Dialogue, Reputation, Save — singletons, rules only) → `src/store.ts` (Zustand; same shape as `SaveData`; `activeDistrict`, `appearance`) → WorldScene + the in-canvas `HudScene` (ADR-118; the React shell `BangaloreTimes.tsx` is only the canvas and the host's back pill).
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
├── scenes/        Boot · Title · CharacterSelect · World · Transit · Workday · Hud · Phone · Map · Menu · Orientation
├── systems/       Stats · Inventory · Quest · Dialogue · Reputation · Save
├── world/         Zones.ts (findObject, zoneFromObject, EntryWatcher) · Populate.ts (npcs/objects/wander) · Exits.ts · Triggers.ts · behaviours/{index,names}.ts
├── ui/            DialogueBox.ts (on the HUD's card) · kit/ · hud/ · menu/ · phone/ · map/ · tokens.ts
├── utils/         constants.ts (SCENE_KEYS, LAYER_DEPTH, START_DISTRICT, FADE_MS…), types.ts, placeholders.ts, hue.ts
├── store.ts · PhaserGame.tsx · BangaloreTimes.tsx (canvas + host back pill only) · main.tsx · index.ts (library entry)
│   └── _meta/     platform.json · style.json (P1 lock record) · style/ (candidates, .gpl palettes, swatches)
scripts/           validate-*.{mjs,ts} · generate-art.mjs · generate-street-map.mjs · extract-palette.mjs · art/ (canvas, palette, tiles, character, quantize)
```

## Time (P4, ADR-91)
`TimeManager` (singleton, engine-free) over `store.clock`; `tick(deltaMs)` from `WorldScene.update` while free; `advance()`, `sleep()`; `counters` for behaviours. The HUD's clock plate shows `DAY N · HH:MM` with a sky glyph.

## Behaviours (ADR-93)
`src/world/behaviours/`: `index.ts` registry + `names.ts` (validator list). `hotelNightTimer` is the worked example; `signalZones` and `salaryCountdown` (ADR-122); `officeClockIn` (story 1.1 lateness: `office_arrived` → on-time/late flags, stress) and `pgNoticeTimer` (story 1.3: `pg_notice_given` → 7 nights → `pg_notice_due`) follow it (ADR-120). Triggers: `setFlags`, `dialogue`, `action: 'sleep' | 'workday'` (`TimeManager.workday()` behind a fade: clock → 18:00, canteen food cost, first-day nerves once, `time:workday`). Quest objectives: `interact | dialogue | collect | reach | flag`.

## Act 1 — Monday / office (P7, ADR-120/121)
`office_gate` district (36×24, Whitefield Road south kerb, `realworld.area` + OSM extract; render + spec in `_raw/maps/office_gate`; zones `auto_drop` · `auto_stand` (auto home, ₹80, 15 min) · `walk_out` (40 min) · `office_arrival` (→ `office_arrived`, `officeClockIn`) · `office_door` (trigger `action: workday`, `requiresFlag: divya_met_monday`, sets `act1_first_day_done`)); Prashanth's main-road strip holds the three drivers + an `auto_stand` exit (`requiresFlag: auto_fare_paid`, spent on boarding, 15 min); Whitefield street's west end is `office_walk` (40 min). Exits: `minutes` advance the clock in TransitScene; NPC refs and triggers accept `requiresFlag`; `WorldScene.arrivals()` after the workday places late NPCs (Sameer, Ravi) and starts newly open quests. `WorkdayScene` (sky ramp `skyAt`, `sunAt`, skyline backdrop `skyline_whitefield` via `import-backdrop.mjs`, `m.workday`) plays inside the office door's fade and emits `workday:done`. `npcs/act1.json` (autos ×3 on one `npc_auto_driver` sheet, guard on `npc_security_guard`, Prakash, Divya, Sameer, Ravi), dialogues `dlg_auto_*`, `dlg_office_guard`, `dlg_prakash`, `dlg_divya_monday` (enter-branches on `late_first_day` / `on_time_first_day` / `act1_first_day_done`), `dlg_sameer_intro`, `dlg_ravi_intro`; `neg_auto_meter`; `dlg_provision` and `dlg_shanthamma` gain enter-branches for the furniture and the notice; chats `sameer`, `ravi`, Divya 3–4; items `id_card`, `folding_table_chair`. Quests `q_act1_first_day` · `q_act1_ravi_intro` · `q_act1_pg_exit` and scene components `act1_first_day` · `act1_ravi_intro` · `act1_pg_exit` are live.

## Act 1 — Ambedkar Nagar hill flat (P8, ADR-122)
`ambedkar_nagar_hill` (36×24 on Seetharampalya Road; zones `road_out` (bus home) · `hill_arrival` · `room1_door` / `room2_door` / `room3_door` (signal 0 / 1 / 2 bars → `room1_checked`… when a Reel is tested there) · `room3_door` exit → `hill_flat`, locked until `flat_signed`) and `hill_flat` (24×16; objects by flag: `CARDBOARD_BOX` on `flat_signed`, `COT` + `TABLE_CHAIR` on `bed_bought`, `INDUCTION` on `stove_bought`, `WATER_DRUM` always; `bed` trigger `action: sleep` once `bed_bought` → `slept_in_flat`; behaviour `salaryCountdown`). Whitefield street's `hill_bus` zone → bus 335-E (₹20, 25 min). Behaviours: `signalZones` (per-frame feet test → `store.signalOverride`/`signalZoneFlag`), `salaryCountdown` (`SALARY_DAYS` → `earn(SALARY)` + `first_salary`), `pgNoticeTimer` refunds `neg.neg_shanthamma.deposit` on the last night. Sprite objects: `ObjectDef.sprite` (a prop PNG, `tiles` absent) drawn by `PlacedObject`; `DistrictObjectRef.requiresFlag`; `import-props.mjs` `heights` per cell (`furniture` sheet). Reels: `data/phone/reels.json` (`REELS`, flag-gated, parody handles) → PhoneScene routes `reels` (list) and `reel` (viewer with a 200 ms redraw timer); `reelState(bars, elapsed)`; resolving sets the zone flag and `reels_<id>_seen`. Content: `npcs/act1_hill.json`, `dlg_manju` (unlocks Reels), `dlg_owner_aunty` + `neg_hill_flat` (firm), `dlg_hill_chai`, `dlg_hill_furniture`, quest `q_act1_hill_flat`, scene `act1_hill_flat`, chats Amma 5 / Sameer 3.

## Saves, settings, phone (P6 systems, ADR-110/111/112)
`SaveManager`: slots `autosave|slot1|slot2|slot3` via `platform.saves`, read once at boot (`init()`), cached, written through; format 1.6.0; `summaries()` for the Load menu; autosave on area change, sleep, purchase, quest step. `SettingsManager` (`useSettings`): `data/settings.defaults.json`, persisted via `platform.storage`, live (difficulty → food drain, DND → buzzes, joystick side/size → the HUD's stick, `hud.*` → objective auto-hide and meters). `PhoneManager`: apps (`data/phone/apps.json`, flag-unlocked), chats (`data/phone/chats/*.json`, delivered on flags + district entry, toasts), UPI (`store.transactions`, labelled by spend/earn callers), Maps (district `realworld` + objective `destination`); emits `phone:buzz` (DND-aware) and `phone:app-unlocked`.

## UI kit + phone (P6a, ADR-113/114)
- `src/ui/kit/` — atoms and molecules, pure over a `PixelCtx` (`fillStyle`/`globalAlpha`/`fillRect`), tested without Phaser: `pixel.ts` (rows-of-rects rounded boxes, rings, dither, bitmaps), `icons.ts` (our 2px-stroke set; `apps.json` `icon` must name one), `text.ts` (bitmap-font metrics: `measure`, `wrap`, `truncate`, `rupees` Indian grouping, `clockText`), `molecules.ts` (`phonePill`, `appTile`, `badge`, `dockBar`, `hudPlate`, `labelCard`, `blockRow`, `speechBubble`, `choicePill`, `tapZone`; states default·focus·pressed·disabled·locked; `MIN_TAP` 44 game px), `focus.ts` (directional `nextFocus`), `phaser.ts` (`bake` paint → cached CanvasTexture, `pxText` places BitmapText by its cap line, `pxTextShadow` adds the 1px drop shadow).
- Font: `scripts/import-font.mjs` (in `pnpm art`) → `src/assets/fonts/px|pxb.{png,xml}` + `metrics.json`; BootScene loads them as `px` / `pxb`.
- `src/ui/phone/` — `layout.ts` (geometry, safe bottom, slide steps), `viewModel.ts` (home tiles, status bar, chat rows, bubbles, UPI rows, map rows — no Phaser), `paint.ts` (frame, LCD + dot grid, wallpaper, status icons).
- `PhoneScene` (launched by WorldScene, stopped with it): closed = phone button in the HUD's top-right corner (`HUD.phoneButton`; wiggles on `phone:buzz`); open = WorldScene paused + camera ColorMatrix (half desaturated, dimmed), `store.overlay = 'phone'` (HudScene hides), 4-step slide-up, routes home · chats · thread · upi · maps (list until P6b) · stub. Redraws from state on every change. Keys: P, arrows/WASD, Enter/Space/E, Esc/Backspace (+ Android back); touch: tap, drag-scroll, tap outside closes. `WorldScene.canOpenOverlay()` / `overlayClosed()`.
- Tokens: world `palette.gpl` (48) + UI `ui-palette.gpl` (12) → `tokens.json`; `rgba(token, a)` + `HUD_PLATE_ALPHA` for translucency. `validate-content` checks app icons, dock ≤ 4, grid ≤ 12, district `signal` 0–4, and that every player-visible string (dialogue, choices, chats, app names/hints, objectives) is drawable by the bitmap font.

## HUD (P6c, ADR-118)
- `src/ui/hud/` — `layout.ts` (plate geometry, phone-button corner, safe bottom 340, touch layout by joystick side/size, `plateWidth`, sky hours, typewriter ms), `viewModel.ts` (objective line = first open non-optional step of the oldest active quest · `clockGlyph` · `locationCard` · `walletView` · `meters` (shows: health < 70, food < 50, stress > 0; bites: 30 / `HUNGRY_AT` / 70) · `stackRows` · `promptLabel` · `ToastQueue` (one at a time, hold, dedupe, cap 8) · `revealedChars`), `dialogue.ts` (card layout: body wrap, bill line, choice pills flowing into rows, `pillAt` nearest-rect hit test, `onCard`), `glyphs.ts` (★ shared with the map, sky, tap, chevron, floppy, meter icons, cursor).
- `HudScene` (launched by WorldScene with `{ firstVisit }`, above the world, below Phone/Map; hidden while `store.overlay` is set; torn down on SHUTDOWN *and* DESTROY): repaints one 640×360 chrome texture + BitmapTexts from state (store subscribe, `ui:toast`, `wallet:*`, `save:written`, settings, `changedata-touchControls`), one timer for the next plate to leave; per frame only the prompt bubble (`WorldScene.nearestInteractable()` → world camera → screen), the joystick knob and the 1px bob. Touch: `platform.input.coarsePointer()` or registry `touchControls = 'always'` → stick (pointer-captured, released on up/out/blur/overlay) + context action button (verb from the prompt, disabled when nobody is near) writing `InputMap`; `touchTargets()` for the Test Playground's thumb overlay.
- `DialogueBox` (hosted by HudScene; `WorldScene.openDialogue` → `hud.openDialogue(id, callbacks)`, queued if the HUD has not created yet; WorldScene keeps `talking`): label card along the bottom, speaker pill, typewriter (`gameplay.dialogueSpeed`; reduced motion = instant; first press skips), bill in `hud.star`, pills (focus ▶ / locked dotted + reason), blinking chevron; keys arrows/WASD · E/Enter/Space; taps on pills (MIN_TAP zones) or the card.
- `OrientationScene` (launched by Boot, WorldScene keeps it on top; the dev API never stops it — nor MenuScene): black panel + "ROTATE YOUR PHONE" while a coarse-pointer device is upright.
- Presets for the audit: `hud-landing`, `hud-hotel-evening`, `hud-pg-lane-talk`, `hud-toast-burst`, `hungry-and-stressed`.

## Menus (P6d, ADR-119)
- `data/menus/settings.json` (`SETTINGS_MENU`): sections → rows `note | toggle | choice | slider | action`, each row editing one dotted `setting` path; `validateSettingsMenu` (in `validate-content.ts`, run by the CLI and `menu.test.ts`) checks the path exists in `settings.defaults.json`, the kind matches the atom's type, choices include the default, labels are drawable.
- `src/ui/menu/` — `layout.ts` (`menuLayout(k)`: title card, label-card rows 19/24 px, slot rows 31/36, BACK plate, hint line, confirm plate; `visibleRows`, `scrollFor`, `rowAt` by band, `zone`), `viewModel.ts` (`pauseRows(mode)`, `sectionRows`, `settingRows` with live values, `stepValue`/`coerceLike`, `slotRows`/`slotConfirm`/`playtime`, `aboutLines(version)`, `hintLine(input)`).
- `MenuScene` (started by Boot, never stopped; WorldScene/TitleScene `bringToTop` it under OrientationScene): `open({ mode: 'world' | 'title', screen?: 'settings' | 'load', fromOverlay? })` pauses + autosaves + desaturates the world (or dims the title), `store.overlay = 'menu'`; a stack of screens (pause · settings · section · slots(save|load|delete) · about · confirm); keys arrows/WASD · ◀▶ adjust · E/Enter/Space · Esc/Backspace; gamepad A/B/START + d-pad/stick; touch: tap a row band (slider: left half −, right half +), BACK plate. Opens on Esc / START / Android back / `platform.lifecycle.onPause` / the HUD's clock-plate tap / the phone's Settings app (`PhoneScene.handToMenu`) / Title's Load Game + Settings. Pause → MAP hands to `MapScene.open(true)`; LOAD restarts WorldScene at the slot's position (title: `TitleScene.startWorldAt`); QUIT stops the world (its shutdown autosaves) and starts the title. Display rows apply through `core/display.ts` (`applyDisplaySettings`: fullscreen, pixel scale → Scale.FIT or NONE+zoom), also run by Boot after settings load. Version from `__APP_VERSION__` (vite `define`).
- Gamepad: `src/ui/kit/gamepad.ts` — `PAD` standard-mapping indices, `attachGamepad(scene, { button, dir }, enabled)` (d-pad + left stick with 300/120 ms repeat), `walkAxis`. Used by Hud (walk, A), Phone (Y open, A/B), Map (X open, A/B, LB view, RB zoom, Y fast travel), DialogueBox (A/B, d-pad), Title, Menu. `PhaserGame` sets `input: { gamepad: true }`.
- HUD scale: `accessibility.largerText` → `hudLayout(2)` / `menuLayout(2)`; HudScene and MenuScene `root.setScale(k)` over a 320×180 virtual canvas; PhoneScene places and scales its button from the same layout. Touch controls and the dialogue card stay at 1× (T-040).

## Fullscreen map (P6b, ADR-113/115)
`data/map/city.json` (`CITY_MAP`: bounds, 16 px/km, regions by kind, roads with optional `connects`, metro lines/stations — an interchange is one id on two lines —, teaser `places`, `pois`) + districts' `realworld` (nodes; interiors fold into parents) + exits (journeys; each must have a drawn path — validator). `systems/MapManager`: `nodes()`, `edges()`, `route()` (Dijkstra, cost = km × mode + fare/100), `here()`, `destination()` (player's `store.mapDestination`, else the quest objective's), `setDestination()`, arrival → `visited:<id>` / `travelled:<path>` flags + REROUTING… / ARRIVED toasts, `pathState()` (undiscovered · reveal · travelled; `map_seen:<path>` once animated), `familiarity()`, `danger()` (Act 4 + stability only), `pois()`, `fastTravel()` (pockets with `metroStation`). `ui/map/`: `projection` (project/snap/orthogonal/walk/cellsInside), `glyphs` (region atoms, POIs, arrows, padlock), `paint` (`paintBase`, `stroke`, `accent`), `view` (pan/zoom maths, `nodeAt`, `cardFor`, `LEGEND`). `MapScene`: launched with WorldScene; M / phone Maps (`open(true)` hand-off keeps the pause) / Pause → Map (P6d); base texture baked per open, overlay (route, reveal, nodes, icons) rebaked per change, screen UI (compass, cards, pills, legend) rebuilt; `WorldScene.travelTo()` for metro fast travel.

## Area view — real streets (ADR-117)
District `realworld.area` `{ radiusM, pocket: { anchor, anchorTile, bearing, metresPerTile, tiles, streets } }` + `data/map/areas/<id>.json` (`AREAS`, OSM extract by `scripts/fetch-osm-area.mjs`, network, run by hand). `ui/map/area.ts`: `areaProjection` (1 px/m), `pocketToLatLng` (tile → real point along bearing / bearing+90), `pocketOutline`, `paintArea` (park/water glyph fields, roads by class, Bresenham `thickLine`), `paintPocket` (dashed ★ box), `placeLabels` (one per name, no overlap). `MapScene` opens in `view: 'area'` when the current pocket (or an interior's parent — the dot sits at the door it was entered by) has an area; `WorldScene.playerPosition()` gives tile + facing. `validateAreas` checks the OSM credit, the anchor inside the radius, character scale and pocket tiles = tilemap size.

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
`src/input/InputMap.ts` — axis/run/interact written by HudScene's joystick + context action (ADR-118; coarse-pointer devices or `touchControls='always'`) and merged with keyboard inside `Player.update()`.

## Scene components (ADR-89)
`src/data/scenes/*.json` per SCENE_TEMPLATE → `SCENES`; validated against districts/quests/NPCs/pacing. `act0_arrivals` is the worked M0 example. Triggers may `setFlags`; exits may charge `fare`.

## Profile & sprites (P2)
`PlayerProfile` (`src/utils/types.ts`) + pure helpers in `src/utils/profile.ts` (`validateProfile`, `sheetForProfile`, `ALL_PLAYER_SHEETS`, states/degrees). Sheet key = `player_<m|f>_<skin>`; `pnpm art` imports `src/assets/_raw/characters/player_{m,f}.png` (generated 3×4 sheets) through `scripts/import-sheet.mjs` into 10 on-palette 3×4 sheets (96×192, [stride, idle, opposite]), and still draws the 8 citizen looks with `scripts/art/character.mjs` (to be replaced, T-022). Save 1.3.0 persists `player.profile`; older saves migrate name/homeState into a default profile.

## Design tokens
`src/assets/_meta/palette.gpl` (48 colours, P1 lock) + `ui-palette.gpl` (12 UI colours, ADR-114) + `scripts/art/tokens.mjs` (`TOKEN_INDEX`, `UI_TOKEN_INDEX`, `MOTION_TOKENS`) → generated `_meta/tokens.json` → `src/ui/tokens.ts` (`hex`, `color`, `rgba`, `motion`, `PALETTE`, `GRID`=8). Scenes use tokens, never raw hex. `validate-maps` fails any sprite sheet off-palette or not 96×192; tilesets warn until T-021.

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
