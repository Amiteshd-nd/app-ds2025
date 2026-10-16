# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P7 approved; P8 built (awaiting audit). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P7 approved** (ADR-110…121; P7 approved 2026-10-16). **P8 Ambedkar Nagar hill flat (T-013, ADR-122) is built and awaits the user's audit**: the hill lane pocket on Seetharampalya Road (three terraces, chai stall, Rafiq's furniture, Manju, Aunty, a kid with a bat) and the empty flat interior; the signal test through the phone's new Reels app (0 / 1 / 2 bars at the three doors); Aunty's warm haggle; furniture as sprite props placed by flags (box, cot + table, induction, drum); sleep heals; the salary countdown (12 nights → ₹42,000); Shanthamma's deposit refund; bus 335-E from the Whitefield street. Browser-checked end to end (Manju → three doors → deal → flat → Rafiq's cot → furnished room → sleep → day 2, salary 11). Breathing parked + OFF (T-029). Last push 2026-10-16 (f08f848 = P7); P8 is committed locally, push only when asked. 379 tests, typecheck, validators, `pnpm build` all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P7 (…HUD · menus · office) | approved — ADR-110…121 |
| **P8 Ambedkar Nagar hill flat (T-013, ADR-122)** | **built 2026-10-16 — awaiting audit** |
| P9 Cubbon Park + Ananya + City Moments (T-014) | next, after the P8 audit (story 1.5 bus to town + 1.6 Cubbon: bus interior, Cubbon pocket, Ananya, photo collectibles, Camera app) |
| T-039 · T-040 · T-041 · T-042 · T-043 (auto + van props) | open |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-117…122), `MEMORY.md`, `AUDIT_LOG.md`.
2. If the user has audited P8: log corrections in AUDIT_LOG as rules, apply, then start **P9** (T-014: story 1.5 + 1.6 — the Whitefield metro "opening soon" barricade, bus 500-D with a timed interval and a bus interior with three passengers, the Cubbon Park pocket on its real paths (OSM), Ananya at the cycle rental (phone dead, ₹60 UPI → number exchange → relationship system), five photo collectibles + the Camera app (City Moments), the guitar shop wishlist, Amma's call; look up references yourself per the AUDIT_LOG rule) — STOP for audit after it.
3. Voice review: the hill lines (Manju, Aunty, Mani, Rafiq, Amma 5, Sameer 3) are drafts in the user's register.
4. Art direction is delegated: decide, show, log. Ask only on a conflict with a logged decision.

## 3. P8 — how to audit it (playground, 6175)
- **Node 1.4 · Ambedkar Nagar** (auto-plays at the slope base): climb the terraces; talk to Manju (Reels unlocks); stand at the green ground-floor door, the maroon door up the lane, the green door at the top and open a clip in **Reels** (phone → Reels): "No network." / "Buffering… Didn't load." / buffers then plays. Each test ticks a quest step. Aunty at the top: ask about the price → compare with the PG, argue one month's deposit, Deal (≈ ₹17,000–20,000; never lowball). The green door opens the flat: red-oxide floor, the godown box and the water drum. Rafiq: cot (₹4,500 or second-hand ₹2,000) and induction (₹2,200) — they appear in the room. Walk onto the cot: night passes, health back, "Salary in 11 days". After `flat_signed` the fever reel appears in Reels (a breadcrumb). Bus home from the road's west end (₹20, 25 min); from the Whitefield street the stop is beside the airport-bus drop.
- Snapshots from this build are in the session scratchpad (`hill-arrive`, `flat-furnished`, `reel-playing`).
Decisions the user may want to overturn (ADR-122): three terraces rather than a literal slope; Reels as the signal meter (no HUD meter); 0/1/2 bars at the three doors; one bar "gives up" after 4 s; Aunty warm (the script's firm-sounding line but a big concession); ₹42,000 salary; bus 335-E as the hill's transport; the balcony house saved for Kavya.

## 4. What exists, where the next steps plug in
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, speechBubble, choicePill, tapZone; 5 states) · `focus` · `phaser` (bake, pxText, pxTextShadow). P6d menus reuse `labelCard` (selected inverts with ▶) and `blockRow` for sliders — add molecules here, with tests in `uikit.test.ts` / `hud.test.ts`.
- **HUD** `src/ui/hud/{layout,viewModel,dialogue,glyphs}.ts` + `scenes/HudScene.ts` + `ui/DialogueBox.ts` (ARCHITECTURE "HUD"); `hudLayout(k)` — Larger text draws at 2× on a 320×180 virtual canvas.
- **Menus** `data/menus/settings.json` + `ui/menu/{layout,viewModel}.ts` + `scenes/MenuScene.ts` (global, started by Boot) + `ui/kit/gamepad.ts` + `core/display.ts` (ARCHITECTURE "Menus"). New setting = atom + row; the validator ties them.
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
- Phaser time in scripts: `g.step(t, 16.67)` uses `t` as the scene clock — pass a **virtual** clock (`__T += 16.67; g.step(__T, 16.67)`) so timers and typewriters advance deterministically; the wall clock barely moves inside a tight loop. Spawns must sit outside exit zones (else the arrival bounces back).
- Keys: dispatch `keydown` then `keyup` ~90 ms later (Phaser clears `_justDown` on keyup) with `code`, `key`, `keyCode` (E=69, P=80, M=77, arrows 37–40). Teleport: `p.setPosition(x, y); p.body.reset(p.x, p.y)`.
- A hidden pane stalls RAF and shows **stale WebGL frames in screenshots**: step with `g.step(performance.now(), 16.67)` every 16 ms and capture with `g.renderer.snapshot(img => img.src)` → write the PNG to the scratchpad → Read it. Hold HUD plates for a shot by pushing `hud.cardUntil / objectiveUntil / savedUntil / wallet.until` out, then `hud.render()`.
- Another chat's dev server may already hold 6174/6175 — a plain `navigate` to its URL serves the current files.

## 7. Open items the user owns
- **P8 audit** (above) + voice OK on the Act 1 lines (office and hill). T-039 real places for the airport kerb and the hotel street. Chat-line voice review; app hints copy. Breathing lines (T-029). T-018 Xcode / Android Studio or cloud CI (native shells never booted on this Mac). Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 8. Debt not to forget
T-027 occluders/pixel collision for the hand-made airport map and the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · health/stress ticks not yet · no audio yet (Settings volumes inert) · T-040 dialogue card at 2× · T-041 save export/import UI · T-042 key rebinding · `display.screenShake/reduceFlashes`, `gameplay.tutorialHints/autoRun`, `accessibility.colourblindIcons/holdToRun` are atoms with menu rows but no consumer yet · the dialogue card shows at most 3 wrapped lines (longest line today needs 2) · playtime on slot cards reads — in playground runs (SaveManager.tick counts only while WorldScene updates; check in a real run).
