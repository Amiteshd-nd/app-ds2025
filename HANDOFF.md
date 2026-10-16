# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P9 pushed; Act 1 complete; render model (ADR-125) in, airport migrated — awaiting audit; then nine maps, Part B, then P10 (2.1 decided). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P9 approved and pushed** (ADR-110…124); Act 1 complete; Acts 2–4 are STUBS (2.1 "Credited" decided by the user: ₹42,000, EMI + outright, ITPL road, stays in Whitefield — build after the render fix). **The user's layering brief (render model, ADR-125) is in progress — Part A step 1 done: the engine, importers, validators and tests speak the seven-layer model and the airport is migrated; it awaits the user's audit** before the other nine maps are migrated (A5 walk each), then Part B (Playground Locations), then P10. Mobile smoke tests blocked on this Mac (no Xcode / Android SDK). Breathing parked + OFF. 402 tests, typecheck, validators, `pnpm build` all green. Uncommitted work is committed locally; push only when asked.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P9 (Acts 0–1) | approved — ADR-110…124 |
| **T-048 render model, Part A — airport** | **migrated 2026-10-16 — awaiting the user's audit** |
| T-048 remaining nine maps (A5 walk each) | next, after the audit |
| T-049 Part B Playground Locations | after Part A |
| P10 = 2.1 "Credited" build | after Part B (user's numbers recorded in the stub) |
| T-016/T-017 mobile smoke tests | blocked: toolchain missing |
| T-039 … T-047, T-050 | open |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-118…125), `MEMORY.md`, `AUDIT_LOG.md` (the render-model rule + the airport walk).
2. If the user has audited the airport: log corrections, then migrate the nine maps one by one — spec gains `buildings` / `sorted` (+footprints) / `above`, debug preview, `sop: true` in the manifest, re-import, run the A5 walk (script in §3), log in AUDIT_LOG. Then Part B. Then P10.
3. Art direction is delegated: decide, show, log. Ask only on a conflict with a logged decision.

## 3. Render model — how to audit the airport (playground, 6175, node 0.1 Arrivals)
Walk behind and in front of a bollard, a bougainvillea planter, a pot by the benches and the trolleys — you vanish behind them and cover them in front. Walk under the gate header — never drawn over it. Walk into the hall's top wall, the glass wall from both sides, the canopy band outside — stopped at the edge; the gate opening is the only way to the kerb. Press the playground's collision toggle to see the feet boxes and footprints. Decisions to overturn (ADR-125): one-render maps kept (cut-outs + rects) rather than a tileset rebuild; `collision` as pixel rects on generated maps and a tile stencil on tile-built ones; `above` cut-outs living in the `sorted` object layer (drawn at the props_above depth) because an image cannot live in a tile layer.
Scripted A5 walk (browser pane, this session's recipe): `game.loop.sleep()`, one virtual clock, stub `MenuScene.open`, patch `scene.tweens.getDelta`, then `tp` + `walk(dx, dy, n)` with the body's velocity and read `player.depth` against each cut-out's depth, `body.bottom` against each wall edge.

## 4. What exists, where the next steps plug in
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, speechBubble, choicePill, tapZone; 5 states) · `focus` · `phaser` (bake, pxText, pxTextShadow). P6d menus reuse `labelCard` (selected inverts with ▶) and `blockRow` for sliders — add molecules here, with tests in `uikit.test.ts` / `hud.test.ts`.
- **HUD** `src/ui/hud/{layout,viewModel,dialogue,glyphs}.ts` + `scenes/HudScene.ts` + `ui/DialogueBox.ts` (ARCHITECTURE "HUD"); `hudLayout(k)` — Larger text draws at 2× on a 320×180 virtual canvas.
- **Menus** `data/menus/settings.json` + `ui/menu/{layout,viewModel}.ts` + `scenes/MenuScene.ts` (global, started by Boot) + `ui/kit/gamepad.ts` + `core/display.ts` (ARCHITECTURE "Menus"). New setting = atom + row; the validator ties them.
- **Render model** `utils/constants.ts` (`LAYERS`, `LAYER_DEPTH`, `FEET_BOX`), `core/depth.ts` (`feetY`), `world/Shapes.ts` (collision rects, `cutout`/`above`), `assets/maps.manifest.json` (seven layers, `sortedLayer`, `sop`), `scripts/import-map.mjs` (`buildings` · `sorted` · `above`), `scripts/validate-maps.mjs` (rules 1–5), `scripts/validate-content.ts` `reachable()` (rule 7), `__tests__/render-model.test.ts`. Migrated: `_raw/maps/kempegowda_arrivals.spec.json`.
- **Act 1 / Cubbon** `whitefield_street.buses` + `bus_interior` + `cubbon_park` districts, `_raw/maps/{cubbon_park,bus_interior}.*`, `data/map/areas/cubbon_park.json`; behaviours `busSchedule` · `busRide` · `photoSpots` · `companion`; `systems/RelationshipManager.ts`; phone apps Camera / Contacts / Notes (`data/phone/{photos,contacts,notes}.json`, `PhoneManager.contacts/notes/photos/takePhoto`, `cameraView`); `street_props` + `animals` prop sheets; HUD timer plate (`ui:timer`) (ARCHITECTURE "Act 1 — Bus to town + Cubbon Park").
- **Act 1 / hill** `ambedkar_nagar_hill` + `hill_flat` districts, `_raw/maps/{ambedkar_nagar_hill,hill_flat}.*`, `data/map/areas/ambedkar_nagar_hill.json`; behaviours `signalZones`, `salaryCountdown`; sprite objects (`data/objects/furniture.json`, `_raw/props/furniture.png`, `import-props.mjs` heights); Reels (`data/phone/reels.json`, PhoneScene routes `reels`/`reel`) (ARCHITECTURE "Act 1 — Ambedkar Nagar").
- **Act 1 / office** `office_gate` district + `_raw/maps/office_gate.{png,spec.json}` + `data/map/areas/office_gate.json`; `scenes/WorkdayScene.ts` + `_raw/backdrops/skyline_whitefield.png` (`import-backdrop.mjs`); behaviours `officeClockIn`, `pgNoticeTimer`; exits with `minutes` / `requiresFlag`; NPC refs + triggers with `requiresFlag`; `WorldScene.arrivals()` (ARCHITECTURE "Act 1"). New pocket recipe in `MEMORY.md`.
- **Phone** `src/ui/phone/*` + `scenes/PhoneScene.ts`; button at `hudLayout(k).phoneButton` (604, 8 at 1×), hidden under the map and the menu. Settings app → `MenuScene.open({ screen: 'settings', fromOverlay: true })`. Unbuilt apps open "Nothing here yet."
- **Map** `data/map/city.json` + `systems/MapManager.ts` + `ui/map/*` + `scenes/MapScene.ts`; Area view data `data/map/areas/<id>.json` via `scripts/fetch-osm-area.mjs`. Pause → MAP hands over with `open(true)`.
- **Shell**: `BangaloreTimes.tsx` = canvas + optional host back pill; `touchControls` prop → registry (live). `OrientationScene` and `MenuScene` launched by Boot; `__APP_VERSION__` from vite `define`.

## 5. Pipelines (exact commands)
- `corepack pnpm dev` → http://localhost:6174 · `corepack pnpm playground` → http://localhost:6175/playground.html · `corepack pnpm mocks` → http://localhost:6176 · `corepack pnpm build` = validate → typecheck → vite → `scripts/check-dist.mjs`. Tokens only: `node scripts/generate-tokens.mjs`.
- `corepack pnpm art`: tokens, character sheets, props, breath frames (if approved), maps (`import-map.mjs`), title, font (`import-font.mjs`), street map.
- Image generation: Figma MCP `generate_image`, model `gpt-image-2.5-sunburst`, **planKey `team::1113684943164685803`** (user's personal team, never the Netradyne org); ≤ 3 rerolls per asset.

## 6. Verifying in the browser pane
- Playground deep link: `?node=<sceneId>&beat=<id>&preset=<id>&device=iphone15` (scene ids: `act0_arrivals`, `act0_hotel`, `act0_pg_hunt`); it auto-plays. `window.__nqDev` (loadNode/applyState/getState/speed/pause/step/showZones/showCollision/touchTargets), `window.__nqGame`, `window.__nqStore`.
- **One clock only**: `game.loop.sleep()` then drive `game.step(__T += 16.67, 16.67)`; never mix with the live RAF (time runs backwards between calls and timers misfire). Stub `MenuScene.open` while scripting — the pane's visibility pause opens the menu mid-run and freezes `playerFree()`/the clock. Tweens run on `Date.now()` (Phaser's `TweenManager.getDelta`), so under virtual stepping patch every scene's `tweens.getDelta = function () { return 16.67 * this.timeScale; }` — then tweens, timers and `update` deltas all agree. `document.hidden` is true while a tool call runs, so the live RAF never progresses during a script: virtual stepping is the only reliable clock.
- Phaser time in scripts: `g.step(t, 16.67)` uses `t` as the scene clock — pass a **virtual** clock (`__T += 16.67; g.step(__T, 16.67)`) so timers and typewriters advance deterministically; the wall clock barely moves inside a tight loop. Spawns must sit outside exit zones (else the arrival bounces back).
- Keys: dispatch `keydown` then `keyup` ~90 ms later (Phaser clears `_justDown` on keyup) with `code`, `key`, `keyCode` (E=69, P=80, M=77, arrows 37–40). Teleport: `p.setPosition(x, y); p.body.reset(p.x, p.y)`.
- A hidden pane stalls RAF and shows **stale WebGL frames in screenshots**: step with `g.step(performance.now(), 16.67)` every 16 ms and capture with `g.renderer.snapshot(img => img.src)` → write the PNG to the scratchpad → Read it. Hold HUD plates for a shot by pushing `hud.cardUntil / objectiveUntil / savedUntil / wallet.until` out, then `hud.render()`.
- Another chat's dev server may already hold 6174/6175 — a plain `navigate` to its URL serves the current files.

## 7. Open items the user owns
- **P9 audit** (above) + voice OK on the Act 1 lines (office, hill, bus, park). Then Acts 2–4 are the user's to co-author (T-046). T-039 real places for the airport kerb and the hotel street. Chat-line voice review; app hints copy. Breathing lines (T-029). T-018 Xcode / Android Studio or cloud CI (native shells never booted on this Mac). Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 8. Debt not to forget
T-027 occluders/pixel collision for the hand-made airport map and the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · health/stress ticks not yet · no audio yet (Settings volumes inert) · T-040 dialogue card at 2× · T-041 save export/import UI · T-042 key rebinding · `display.screenShake/reduceFlashes`, `gameplay.tutorialHints/autoRun`, `accessibility.colourblindIcons/holdToRun` are atoms with menu rows but no consumer yet · the dialogue card shows at most 3 wrapped lines (longest line today needs 2) · playtime on slot cards reads — in playground runs (SaveManager.tick counts only while WorldScene updates; check in a real run).
