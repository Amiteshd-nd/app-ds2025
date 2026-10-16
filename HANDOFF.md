# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P6 complete; P7 built (awaiting audit). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P6 approved** (ADR-110…119). **P7 Monday/office (T-012) is built and awaits the user's audit — ADR-120 (systems + script) and ADR-121 (the pocket)**: the `office_gate` pocket sits on the real Whitefield Road beside the Pattandur Agrahara metro station (OSM extract, 36×24 at 1.2 m/tile), its render matched by eye to Google Maps photos of ITPB (look-only, user's direction 2026-10-16); the three autos on Prashanth's main-road strip (haggle / meter / Kannada), a 40-minute walk from the Whitefield street's west end, the gate cast (guard, Prakash, Divya, Sameer, Ravi — generated sheets), lateness, the workday skyline card, Sameer and Ravi appearing at 18:00, the auto home; 1.3's furniture and notice live on the lane. Browser-checked: arrival → guard → Prakash's ID → Divya's on-time line → workday (clock 18:00, food −20, stress +5) → late NPCs placed → auto home (₹80, +15 min). Not drawn yet: auto-rickshaw and HIVR-van props (T-043). Breathing parked + OFF (T-029). Last push 2026-10-16 (f0c426d = P7); push only when asked. 373 tests, typecheck, validators, `pnpm build` all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P6 (phone · map · Area view · HUD · menus) | approved — ADR-110…119 |
| **P7 Monday / office (T-012, ADR-120/121)** | **built 2026-10-16 — awaiting audit** |
| P8 Ambedkar Nagar hill flat (T-013) | next, after the P7 audit (story 1.4: broker Manju, owner aunty, signal meter, furnish, sleep = heal; opens on `pg_notice_due`) |
| T-039 real areas for the airport kerb + hotel street · T-040 dialogue at 2× · T-041 save export/import UI · T-042 key rebinding · T-043 auto + van props | open |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-117…121), `MEMORY.md`, `AUDIT_LOG.md`.
2. If the user has audited P7: log corrections in AUDIT_LOG as rules, apply, then start **P8** (T-013 Ambedkar Nagar: a new hill pocket on its real streets — ask for / look up references first, AUDIT_LOG 2026-10-16 rule; `signalStrengthMeter` behaviour; furnishing from the godown; sleep heals) — STOP for audit after it.
3. Voice review: the Act 1 lines (autos, guard, Prakash, Divya, Sameer, Ravi, Basavaraj's delivery boy, Shanthamma's notice, three chats) are drafts in the user's register; read them with the user before or during the audit.
4. Art direction is delegated: decide, show, log. Ask only on a conflict with a logged decision.

## 3. P7 — how to audit it (playground, 6175)
- **Node 1.1 · Monday** (auto-plays at the gate, 08:15, prerequisites applied): the pocket — road with viaduct pillars, pavement with autos / tea cart / shuttle bay, the gate, the forecourt, the office block. Walk through the metal-detector arch (the barrier is for cars) → "08:xx. Made it." (after 09:30 it is "Divya noticed." + stress). Guard → Prakash at the cabin ("Spell it." → ID card) → the guard's line changes → Divya at the canopy (on-time / late branch, +2 rep when on time) → walk under the canopy to the doors → the skyline card (6 s, E/tap skips) → 18:00 outside: Sameer at the gate, Ravi at the shuttle bay → auto home (₹80, 15 min) or the walk (40 min).
- **Node 0.3 · PG Hunt** after the PG is signed (prereq builder): the three drivers on the main-road strip at the lane's south end — haggle (₹150 → ₹100), meter (₹80), Kannada ("Meter haaki" ₹80 + XP · English ₹120 · "Hogu" sends him away) → step into the auto stand → "Auto → ITPL Gate", 15 min. From the Whitefield street's west end: the 40-minute walk.
- **Node 1.2 · The Intern** (prereqs applied): Ravi's shuttle talk → `met_ravi` → the Ravi chat thread; Sameer's number → `met_sameer`.
- **Node 1.3 · Not Working Out**: Basavaraj sells the table + chair (₹1,800) → "Not enough space." → Shanthamma's notice → seven nights of toasts → `pg_notice_due` and her "deposit ready" line.
- Map (M): the Office is a real node now (locked until the PG hunt is done); two new drawn journeys; the Area view works at the gate.
Decisions the user may want to overturn (ADR-120/121): 6-second card (script said 12); the sky in the world palette (no new blues); Prakash at the security cabin; the walk costs 40 game minutes; autos drawn into the gate render but only drivers on the lane (props are T-043); the shared driver sheet; audio rows shown with no audio.

## 4. What exists, where the next steps plug in
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, speechBubble, choicePill, tapZone; 5 states) · `focus` · `phaser` (bake, pxText, pxTextShadow). P6d menus reuse `labelCard` (selected inverts with ▶) and `blockRow` for sliders — add molecules here, with tests in `uikit.test.ts` / `hud.test.ts`.
- **HUD** `src/ui/hud/{layout,viewModel,dialogue,glyphs}.ts` + `scenes/HudScene.ts` + `ui/DialogueBox.ts` (ARCHITECTURE "HUD"); `hudLayout(k)` — Larger text draws at 2× on a 320×180 virtual canvas.
- **Menus** `data/menus/settings.json` + `ui/menu/{layout,viewModel}.ts` + `scenes/MenuScene.ts` (global, started by Boot) + `ui/kit/gamepad.ts` + `core/display.ts` (ARCHITECTURE "Menus"). New setting = atom + row; the validator ties them.
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
- Keys: dispatch `keydown` then `keyup` ~90 ms later (Phaser clears `_justDown` on keyup) with `code`, `key`, `keyCode` (E=69, P=80, M=77, arrows 37–40). Teleport: `p.setPosition(x, y); p.body.reset(p.x, p.y)`.
- A hidden pane stalls RAF and shows **stale WebGL frames in screenshots**: step with `g.step(performance.now(), 16.67)` every 16 ms and capture with `g.renderer.snapshot(img => img.src)` → write the PNG to the scratchpad → Read it. Hold HUD plates for a shot by pushing `hud.cardUntil / objectiveUntil / savedUntil / wallet.until` out, then `hud.render()`.
- Another chat's dev server may already hold 6174/6175 — a plain `navigate` to its URL serves the current files.

## 7. Open items the user owns
- **P7 audit** (above) + voice OK on the Act 1 lines. T-039 real places for the airport kerb and the hotel street. Chat-line voice review; app hints copy. Breathing lines (T-029). T-018 Xcode / Android Studio or cloud CI (native shells never booted on this Mac). Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 8. Debt not to forget
T-027 occluders/pixel collision for the hand-made airport map and the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · health/stress ticks not yet · no audio yet (Settings volumes inert) · T-040 dialogue card at 2× · T-041 save export/import UI · T-042 key rebinding · `display.screenShake/reduceFlashes`, `gameplay.tutorialHints/autoRun`, `accessibility.colourblindIcons/holdToRun` are atoms with menu rows but no consumer yet · the dialogue card shows at most 3 wrapped lines (longest line today needs 2) · playtime on slot cards reads — in playground runs (SaveManager.tick counts only while WorldScene updates; check in a real run).
