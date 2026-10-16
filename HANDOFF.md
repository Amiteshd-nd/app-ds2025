# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P6c built (awaiting audit). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P5 approved**, plus the living title screen, the Test Playground and the new airport. **P6 systems built** (saves, settings, phone rules — ADR-110/111/112). **P6 style board** approved (ADR-113 no minimap, ADR-114 font/palette/plates). **P6a** (font, UI kit, phone), **P6b** (fullscreen map, ADR-115) and the **map Area view** (ADR-117, confirmed 2026-10-16) are approved. **P6c (T-034, ADR-118) is built and awaits the user's audit**: the whole HUD is now in the canvas (HudScene), the dialogue box is a kit card with a typewriter, the joystick + context action are drawn in-canvas, a rotate-your-phone panel exists, and the React/DOM HUD + TouchControls are gone (closes T-024). Then P6d. Breathing parked + OFF (T-029). Last push 2026-10-13 (6d745db); P6c is committed locally, push only when asked. 355 tests, typecheck, validators, `pnpm build` (+ dist check) all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P5, title screen, playground, new airport | approved |
| P6 systems (ADR-110/111/112) | built |
| P6 style board + mocks (ADR-113/114) | approved 2026-10-13 — mock board: https://claude.ai/artifact/MPtuoSmvoPVF2JwCVnLXYj (also `docs/mocks/p6-style-board/`, `pnpm mocks`) |
| P6a (T-032) font + tokens + molecules + PhoneScene | approved |
| P6b (T-033) fullscreen map · Map Area view (T-038, ADR-117) | approved |
| **P6c HUD (T-034, ADR-118)** | **built 2026-10-16 — awaiting audit** |
| P6d menus (T-035) | next, after the P6c audit |
| T-039 real areas for the airport kerb + hotel street | open (content, with the user) |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-113…118), `MEMORY.md`, `AUDIT_LOG.md` (the P6 style-board rules are standing rules).
2. If the user has audited P6c: log corrections in AUDIT_LOG as rules, apply, then start **P6d** (T-035: Pause / Settings — HUD scale, objective auto-hide, meter visibility, About & credits (Pixelify Sans OFL + © OpenStreetMap contributors) / Save / Load / confirm dialogs, keyboard + gamepad nav; the phone's Settings app opens the same menu) — STOP for audit after it.
3. Art direction is delegated ("think like an art director and take the best call"): decide, show, log in the ADR. Ask only on a conflict with a logged decision.
4. Still open with the user: chat-line voice review (4 threads); the app hints in `phone/apps.json`; the Office pin near ITPL and the Ambedkar Nagar position (guesses until P7/P8).

## 3. P6c — how to audit it (playground, 6175)
Five presets, each description says which node to use:
- **HUD: landing, first look** → node 0.1 Arrivals. ★ objective (collapses to ★ after 4 s), KEMPEGOWDA INTERNATIONAL card with NEW (5 s), sunrise clock, phone button top-right, SAVED on arrival. Walk to Chai Anna: "[E] TALK" bubble; buy the chai: wallet + "-₹20" for 3 s.
- **HUD: PG lane, haggling** → 0.3 PG Hunt. Talk to Shanthamma: speaker pill, typewriter (E skips), yellow bill line, five choice pills in rows, ▶ selection, chevron.
- **HUD: toast burst (phone catches up)** → 0.3 PG Hunt. Toasts queue one at a time (chats icon before a message). P opens the phone: the HUD hides.
- **HUD: hotel, last night, evening** → 0.2 Three Nights. Moon glyph, heart meter (health 60), sleep → morning toast + SAVED.
- **HUD: hungry and stressed** → any outdoor node. Red bowl + bolt meters, moon.
- Touch: pick **iPhone 15** in the device menu → the stick (bottom-left) and TALK button (bottom-right) draw in-canvas; the thumb overlay points at them (`__nqDev.touchTargets()`). Settings → Controls joystick side/size apply live (no menu yet — `useSettings.getState().set('controls','joystickSide','right')` in the console).
- Rotate panel: only on a real touch device held upright (OrientationScene; `platform.input.coarsePointer()`).
Decisions the user may want to overturn (all logged in ADR-118): objective auto-hide 4 s; location card 5 s; wallet shown only after money moves; meters' show/bite thresholds; reputation/survival tier and the hotel-nights line dropped from the HUD (toasts + P6d screens instead); choices appear only after the line finishes typing.

## 4. What exists, where the next steps plug in
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, speechBubble, choicePill, tapZone; 5 states) · `focus` · `phaser` (bake, pxText, pxTextShadow). P6d menus reuse `labelCard` (selected inverts with ▶) and `blockRow` for sliders — add molecules here, with tests in `uikit.test.ts` / `hud.test.ts`.
- **HUD** `src/ui/hud/{layout,viewModel,dialogue,glyphs}.ts` + `scenes/HudScene.ts` + `ui/DialogueBox.ts` (ARCHITECTURE "HUD"). Settings atoms `hud.objectiveAutoHide`, `hud.meters` exist; P6d builds their menu rows. HUD scale (1×/2×) is **not** implemented — P6d decides whether `accessibility.largerText` drives it.
- **Phone** `src/ui/phone/*` + `scenes/PhoneScene.ts`; button at `HUD.phoneButton` (604, 8). Settings app → P6d menu. Unbuilt apps open "Nothing here yet."
- **Map** `data/map/city.json` + `systems/MapManager.ts` + `ui/map/*` + `scenes/MapScene.ts`; Area view data `data/map/areas/<id>.json` via `scripts/fetch-osm-area.mjs`. Pause → Map hook is P6d.
- **Shell**: `BangaloreTimes.tsx` = canvas + optional host back pill; `touchControls` prop → registry (live). `OrientationScene` launched by Boot.

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
- **P6c audit** (above). T-039 real places for the airport kerb and the hotel street. Chat-line voice review; app hints copy. Breathing lines (T-029). T-018 Xcode / Android Studio or cloud CI (native shells never booted on this Mac). Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 8. Debt not to forget
T-027 occluders/pixel collision for the hand-made airport map and the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · health/stress ticks not yet · no audio yet (Settings volumes inert) · phone + HUD have no gamepad input yet (P6d) · HUD scale setting (P6d) · the dialogue card shows at most 3 wrapped lines (longest line today needs 2).
