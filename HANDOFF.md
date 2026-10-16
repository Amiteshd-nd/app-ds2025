# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P6 complete; P7a built, P7b waits on the user's office references + spot. A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P6 approved** (P6d menus approved 2026-10-16; ADR-119). **P7 Monday/office (T-012) is half built — ADR-120**: the systems and script are in (workday skip + `workday` trigger, lateness rule, PG notice timer, three autos, guard/Prakash/Divya/Sameer/Ravi lines, furniture + notice on the lane, chats, items), all tested and validated; the quests and scene components for 1.1–1.3 are drafted in `src/data/_drafts/p7/`. **P7b is blocked on the user**: 6–9 office reference photos (ADR-30) and the real spot for the office gate near ITPL. Then: OSM extract → pocket render on its streets → `office_gate` district → drafts go live → Act 1 cast sheets + auto/van props → skyline time-lapse card → `auto` transit card → audit. Breathing parked + OFF (T-029). Last push 2026-10-13 (6d745db); P6c, P6d and P7a are committed locally, push only when asked. 373 tests, typecheck, validators, `pnpm build` all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P6 (phone · map · Area view · HUD · menus) | approved — ADR-110…119 |
| **P7a Monday systems + script (ADR-120)** | **built 2026-10-16** (nothing visible in play yet: the content is dormant until the office pocket) |
| **P7b office pocket + art + drafts live** | **blocked: user's references + real spot** |
| T-039 real areas for the airport kerb + hotel street · T-040 dialogue at 2× · T-041 save export/import UI · T-042 key rebinding | open |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-117…120), `MEMORY.md`, `AUDIT_LOG.md`.
2. **If the user has sent the office references + spot:** add `realworld.area` for `office_gate` (anchor at the chosen gate, bearing along its street) to a new district entry → `node scripts/fetch-osm-area.mjs office_gate` → generate the pocket render on those streets (prompt rules in `_raw/maps/README.md`; gate, guard cabin, admin block door, auto stand, shuttle bay, parking) → `office_gate.spec.json` with zones `auto_drop` (spawn), `auto_stand` (exit → whitefield_street, transit `auto`), `office_arrival` (trigger `setFlags: [office_arrived]`), `admin_desk`, `lobby`, `office_door` (trigger `action: workday`), `gate_evening`, `shuttle_bay` → district lists `behaviours: [officeClockIn]` and `prashanth_layout` adds `pgNoticeTimer` → move `_drafts/p7/*` into `quests/` and `scenes/` → add `auto` to `TRANSIT_KINDS` + its card → Act 1 cast sheets through the sprite pipeline → the skyline time-lapse card inside the workday fade (landmarks doc: Nandi Hills parallax) → Maps: the Office pin becomes the district node → validate, test, build → STOP for the P7 audit.
3. Voice review: the new lines (autos, guard, Prakash, Divya, Sameer, Ravi, Basavaraj's delivery boy, Shanthamma's notice, three chats) are drafts in the user's register; read them with the user before the audit.
4. Art direction is delegated: decide, show, log. Ask only on a conflict with a logged decision.

## 3. P7a — how to see what exists (playground, 6175)
- Nothing new appears in play until the pocket exists. The behaviours and the workday skip are unit-tested (`act1.test.ts`). To try the lane half early: `__nqStore.getState().setFlag('act1_first_day_done', true)` on node 0.3, talk to Basavaraj → table + chair → Shanthamma → notice → sleep seven nights (toasts count down; `pg_notice_due`).
- Dialogue drafts: `src/data/dialogue/dlg_auto_*.json`, `dlg_office_guard.json`, `dlg_prakash.json`, `dlg_divya_monday.json`, `dlg_sameer_intro.json`, `dlg_ravi_intro.json`; `dlg_provision.json` (`start_act1`, `delivery`), `dlg_shanthamma.json` (`notice*`).

## 4. What exists, where the next steps plug in
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, speechBubble, choicePill, tapZone; 5 states) · `focus` · `phaser` (bake, pxText, pxTextShadow). P6d menus reuse `labelCard` (selected inverts with ▶) and `blockRow` for sliders — add molecules here, with tests in `uikit.test.ts` / `hud.test.ts`.
- **HUD** `src/ui/hud/{layout,viewModel,dialogue,glyphs}.ts` + `scenes/HudScene.ts` + `ui/DialogueBox.ts` (ARCHITECTURE "HUD"); `hudLayout(k)` — Larger text draws at 2× on a 320×180 virtual canvas.
- **Menus** `data/menus/settings.json` + `ui/menu/{layout,viewModel}.ts` + `scenes/MenuScene.ts` (global, started by Boot) + `ui/kit/gamepad.ts` + `core/display.ts` (ARCHITECTURE "Menus"). New setting = atom + row; the validator ties them.
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
- **P7b inputs**: office reference photos (6–9), the real office-gate spot, voice OK on the Act 1 lines. T-039 real places for the airport kerb and the hotel street. Chat-line voice review; app hints copy. Breathing lines (T-029). T-018 Xcode / Android Studio or cloud CI (native shells never booted on this Mac). Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 8. Debt not to forget
T-027 occluders/pixel collision for the hand-made airport map and the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · health/stress ticks not yet · no audio yet (Settings volumes inert) · T-040 dialogue card at 2× · T-041 save export/import UI · T-042 key rebinding · `display.screenShake/reduceFlashes`, `gameplay.tutorialHints/autoRun`, `accessibility.colourblindIcons/holdToRun` are atoms with menu rows but no consumer yet · the dialogue card shows at most 3 wrapped lines (longest line today needs 2) · playtime on slot cards reads — in playground runs (SaveManager.tick counts only while WorldScene updates; check in a real run).
