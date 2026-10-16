# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-16, P6c approved, P6d built (awaiting audit). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P5 approved**, plus the living title screen, the Test Playground and the new airport. **P6 systems built** (ADR-110/111/112). **P6 style board** approved (ADR-113/114). **P6a** phone, **P6b** map + Area view (ADR-115/117) and **P6c** in-canvas HUD (ADR-118) **approved**. **P6d (T-035, ADR-119) is built and awaits the user's audit**: one MenuScene for pause / settings (data-driven, nine sections) / save / load / delete / confirm / about, keyboard + gamepad + touch, Larger text = 2× HUD and menus, Title gains Load Game + Settings, the phone's Settings app and the HUD's clock plate open the menu, backgrounding autosaves and pauses. That closes P6; **P7 Monday/office (T-012)** is next, co-authored with the user (new pocket → real streets first, AUDIT_LOG rule). Breathing parked + OFF (T-029). Last push 2026-10-13 (6d745db); P6c (fd92b0b) and P6d are committed locally, push only when asked. 368 tests, typecheck, validators, `pnpm build` (+ dist check) all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P5, title screen, playground, new airport | approved |
| P6 systems (ADR-110/111/112) · style board (ADR-113/114) | approved — mock board: https://claude.ai/artifact/MPtuoSmvoPVF2JwCVnLXYj (also `docs/mocks/p6-style-board/`, `pnpm mocks`) |
| P6a phone (T-032) · P6b map (T-033) · Area view (T-038) · P6c HUD (T-034) | approved |
| **P6d menus (T-035, ADR-119)** | **built 2026-10-16 — awaiting audit** |
| P7 Monday / office (T-012) | next, after the P6d audit — content + a new pocket with the user |
| T-039 real areas for the airport kerb + hotel street · T-040 dialogue at 2× · T-041 save export/import UI · T-042 key rebinding | open |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-113…119), `MEMORY.md`, `AUDIT_LOG.md` (the P6 rules are standing rules).
2. If the user has audited P6d: log corrections in AUDIT_LOG as rules, apply, then start **P7** (T-012 Monday/office: story_script §1.x beats → scene component JSON + a new office pocket near ITPL generated to its real streets (`scripts/fetch-osm-area.mjs`, ADR-117 rule) + quests/dialogue; ask the user for the office reference images first — ADR-30) — STOP for audit after it.
3. Art direction is delegated ("think like an art director and take the best call"): decide, show, log in the ADR. Ask only on a conflict with a logged decision.
4. Still open with the user: chat-line voice review (4 threads); the app hints in `phone/apps.json`; the Office pin near ITPL and the Ambedkar Nagar position (guesses until P7/P8).

## 3. P6d — how to audit it (playground, 6175)
- Any node → **ESC** (or tap the clock plate, or START on a pad): PAUSED · RESUME / SETTINGS / SAVE / LOAD / MAP / QUIT TO TITLE as label cards, the chosen one white with ▶; world dimmed + desaturated; the HUD hides; opening autosaves (SAVED glyph on return).
- SETTINGS → nine sections. In a section ◀▶ (or tap: toggles flip, choices cycle, slider left/right half) change the value live: GAMEPLAY → DIALOGUE SPEED then talk to someone; HUD → OBJECTIVE AUTO-HIDE off keeps the line up; HUD → LARGER TEXT doubles the HUD + menus (phone button follows); CONTROLS → JOYSTICK SIDE on the iPhone 15 device moves the stick; DISPLAY → PIXEL SCALE 2× fixes the canvas; DATA → RESET / DELETE A SAVE confirm first; ABOUT credits the font + OpenStreetMap + version.
- SAVE: the autosave row is read-only; an empty slot saves at once (toast after the menu closes); a used slot asks "Overwrite slot N?". LOAD: filled slots only; in play it asks before dropping unsaved progress; the world restarts at the slot's position. QUIT TO TITLE asks, then the title shows **New Game · Continue · Load Game · Settings** — Load Game and Settings open the same menu over the title.
- Phone (P) → Settings app → the menu's SETTINGS screen; BACK/ESC returns to the world (not the phone).
- Gamepad (plug one in, press a button first): left stick walks, A talks, Y phone, X map, START pause; in menus d-pad/stick, A select, B back.
- Snapshots from this build are in the session scratchpad (`menu-pause`, `menu-gameplay`, `menu-save`, `menu-load`, `menu-audio-title`, `hud-2x`).
Decisions the user may want to overturn (ADR-119): clock plate as the touch pause control; pause autosaves; autosave slot read-only; dialogue card not scaled by Larger text (T-040); no HUD-scale knob beyond Larger text; audio rows shown although nothing plays yet.

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
- **P6d audit** (above). T-039 real places for the airport kerb and the hotel street. Chat-line voice review; app hints copy. Breathing lines (T-029). T-018 Xcode / Android Studio or cloud CI (native shells never booted on this Mac). Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 8. Debt not to forget
T-027 occluders/pixel collision for the hand-made airport map and the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · health/stress ticks not yet · no audio yet (Settings volumes inert) · T-040 dialogue card at 2× · T-041 save export/import UI · T-042 key rebinding · `display.screenShake/reduceFlashes`, `gameplay.tutorialHints/autoRun`, `accessibility.colourblindIcons/holdToRun` are atoms with menu rows but no consumer yet · the dialogue card shows at most 3 wrapped lines (longest line today needs 2) · playtime on slot cards reads — in playground runs (SaveManager.tick counts only while WorldScene updates; check in a real run).
