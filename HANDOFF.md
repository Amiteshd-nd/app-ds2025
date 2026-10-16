# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P9 approved and pushed; Act 1 complete; Act 2–4 stubs scaffolded, 2.1 awaiting the user's words. A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P9 approved** (ADR-110…124; P9 approved and pushed 2026-10-16 as 6fdcb5b). **Act 1 is complete**: the web slice runs from the airport to the last Sunday sleep, which sets `act2_started` and unlocks the Dating app. **Acts 2–4 exist as STUBS** (`src/data/scenes/act2_*`, `act3_*`, `act4_*`, status STUB, seq 2.1…4.6) scaffolded from the story script — the user co-authors them one at a time, starting with **2.1 "Credited"** (the salary ping, the scooter showroom, the fuel gauge; draft + open questions in §3). Mobile smoke tests (T-016/T-017) are blocked on this machine (no Xcode, no Android SDK). Breathing parked + OFF (T-029). 391 tests, typecheck, validators, `pnpm build` all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P9 (Acts 0–1) | approved — ADR-110…124 |
| **Act 2–4 stubs (T-047)** | **scaffolded 2026-10-16 — 2.1 awaits the user's words** |
| P10 = 2.1 "Credited" build | after the user edits the 2.1 stub |
| T-016 Android · T-017 iOS smoke tests | blocked: toolchain missing on this Mac |
| T-039 · T-040 · T-041 · T-042 · T-043 · T-044 · T-045 | open |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-118…124), `MEMORY.md`, `AUDIT_LOG.md`.
2. **Co-author before building**: show the user the 2.1 stub (`src/data/scenes/act2_credited.json`) and the open questions in §3; take their words and numbers into the stub (status stays STUB until they say "build"); then P10 runs the usual recipe — spot chosen and logged (the scooter showroom's real street, OSM) → render → px spec → quest + dialogue → validate → browser → audit. Each later stub the same way.
3. Voice: every line in Acts 2–4 is the user's register — drafts only until they edit.
4. Art direction is delegated: decide, show, log. Ask only on a conflict with a logged decision.

## 3. 2.1 "Credited" — the draft to co-author (not built)
Story: workday → phone ping "₹32,000 credited" → tutorial card about two-wheelers and fuel → the Whitefield scooter showroom: second-hand ₹38,000 on EMI (₹6,000 down) or save two months → **fuel gauge introduced** (ADR-06: scooter is fuel-gated; game_components §4: speed ×1.8, tank ≈ 3 Whitefield↔Indiranagar round trips, petrol bunk sink, parking zones, no metro areas, stolen in 4.0).
Draft in the stub: F1 the salary already lands through `salaryCountdown` (₹42,000, ADR-122 — the script says ₹32,000: **pick one**); F2 Sameer's canteen line points you to a showroom on the Whitefield main road ("second-hand, ask for Noor"); F3 the showroom: a used scooter (parody make) ₹38,000 — buy outright, EMI (₹6,000 down, ₹3,200 × 10 on the salary day through a new `emi` behaviour), or walk; F4 first ride = a new transit kind on the map (scooter, fuel-gated, `fuel` counter, bunk NPCs at Whitefield and Indiranagar); F5 the fuel gauge appears on the HUD only while riding or at a bunk (ADR-118 rule: contextual).
Open questions for the user: (1) ₹32,000 or ₹42,000 salary; (2) EMI or outright or both; (3) where the showroom is (Whitefield main road near Hope Farm? ITPL road?); (4) does the scooter unlock Indiranagar as the next pocket (2.2 metro opens later) or does 2.1 stay inside Whitefield; (5) the parody make's name; (6) is the tutorial card a phone message from Sameer or a HUD card.

## 4. What exists, where the next steps plug in
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, speechBubble, choicePill, tapZone; 5 states) · `focus` · `phaser` (bake, pxText, pxTextShadow). P6d menus reuse `labelCard` (selected inverts with ▶) and `blockRow` for sliders — add molecules here, with tests in `uikit.test.ts` / `hud.test.ts`.
- **HUD** `src/ui/hud/{layout,viewModel,dialogue,glyphs}.ts` + `scenes/HudScene.ts` + `ui/DialogueBox.ts` (ARCHITECTURE "HUD"); `hudLayout(k)` — Larger text draws at 2× on a 320×180 virtual canvas.
- **Menus** `data/menus/settings.json` + `ui/menu/{layout,viewModel}.ts` + `scenes/MenuScene.ts` (global, started by Boot) + `ui/kit/gamepad.ts` + `core/display.ts` (ARCHITECTURE "Menus"). New setting = atom + row; the validator ties them.
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
