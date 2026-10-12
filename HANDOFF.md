# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-13, P6b built (awaiting audit). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P5 approved**, plus the living title screen, the Test Playground and the new airport. **P6 systems built** (saves, settings, phone rules — ADR-110/111/112). The user sent the **P6 style board + 4 references**; mocks approved ("OK, start P6a"); **ADR-113** (no minimap — fullscreen map only) and **ADR-114** (style board, Pixelify Sans bitmap font, 12-colour UI palette, art-director calls) logged. **P6a approved** (font, UI kit, phone). **P6b is built and awaits the user's audit**: the fullscreen symbolic map (ADR-115) — M key or the phone's Maps app. Breathing parked + OFF (T-029). Push only when asked. 304 tests, typecheck, validators, `pnpm build` (+ dist check) all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P5, title screen, playground, new airport | approved |
| P6 systems (ADR-110/111/112) | built |
| P6 style board + mocks (ADR-113/114) | approved 2026-10-13 — mock board: https://claude.ai/artifact/MPtuoSmvoPVF2JwCVnLXYj |
| P6a (T-032) font + tokens + molecules + PhoneScene | approved |
| **P6b** (T-033) fullscreen map | **built — awaiting audit** |
| P6c HUD (T-034) · P6d menus (T-035) | next, one at a time, audit after each |
| Breathing (T-029) | parked, OFF |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-95…114), `MEMORY.md`, `AUDIT_LOG.md` (the P6 style-board rules are standing rules).
2. If the user has audited P6b: log corrections in AUDIT_LOG as rules, apply, then start P6c (T-034, HUD — style board §5: fixed layout, contextual meters, dialogue box, 5 HUD presets; the phone button moves to the top-right; the DOM HUD retires) — STOP for audit after it. Build order inside P6 is fixed: P6a → P6b → P6c → P6d.
3. Art direction is delegated ("think like an art director and take the best call"): decide, show, log in the ADR. Ask only on a conflict with a logged decision.
4. Still open with the user: chat-line voice review (4 threads); the new app hints in `phone/apps.json` are new copy too.

## 3. P6 — what exists, where the next steps plug in
- **Style board** (user brief, 2026-10-13): phone = notched smartphone frame + olive 3-tone LCD; map = black symbolic glyph fields, white 8px-grid paths, hollow/filled/padlock nodes, label cards with ★ familiarity and ☠ danger (Act 4) rows, compass; HUD = minimal, contextual, black 85% plates with grey border, no minimap; menus = label cards, selected inverts with ▶. Full text lives in DECISIONS ADR-114 + AUDIT_LOG; the original brief is in the 2026-10-13 conversation.
- **Kit** `src/ui/kit/`: `pixel` · `icons` · `text` (measure/wrap/truncate/rupees) · `molecules` (phonePill, appTile, badge, dockBar, hudPlate, labelCard, blockRow, tapZone; 5 states) · `focus` (nextFocus) · `phaser` (bake, pxText). P6b/c/d reuse these — add molecules here, with tests in `uikit.test.ts`.
- **Font** `scripts/import-font.mjs` → `src/assets/fonts/px|pxb` + `metrics.json` (in `pnpm art`). Hand-drawn: ₹ 5 Z B ( ) , ▶▼▲★✓○•→←. OFL ships at `public/licenses/`. Settings → About must credit it (P6d).
- **Phone** `src/ui/phone/{layout,viewModel,paint}.ts` + `scenes/PhoneScene.ts`. Closed button sits at the **right edge, y=150** for now — P6c moves it into the new HUD's top-right corner (the old DOM HUD is there today). Maps app is a list until P6b's fullscreen map. Unbuilt apps (Calls, Contacts, News, Reels, Calendar, Notes, Settings, Camera…) open a "Nothing here yet." stub; Settings app → P6d menu.
- **Map** `data/map/city.json` + `systems/MapManager.ts` + `ui/map/*` + `scenes/MapScene.ts` (ARCHITECTURE "Fullscreen map"). Audit: playground → 0.3 PG Hunt → preset "Map: day 3, two journeys made" → Play → M: both journeys fill in dotted→solid on first open; Z zoom, arrows pick nodes, Enter sets a destination (Whitefield is reachable; the airport is not — the bus is one-way in-game). Hooks waiting on other systems: Act 4 overlay (T-036, needs stability), rumours (T-037), audio duck (no audio). Fast travel works only between pockets on metro stations (`metroStation` on a district) — none yet.
- **Audit preset**: playground → 0.3 PG Hunt → preset "Phone: day 3, chats waiting" → Play → P (or tap the phone button). Add ledger lines via `__nqStore` to see UPI scroll.

## 4. Pipelines (exact commands)
- `corepack pnpm dev` → http://localhost:6174 · `corepack pnpm playground` → /playground.html (dev only) · `corepack pnpm build` = validate → typecheck → vite → `scripts/check-dist.mjs`.
- `corepack pnpm art`: tokens (colour + motion + dev-UI), every `_raw/characters/*.png` (3×4 magenta sheets → 96×192; `player_*` × 5 skins), props (`_raw/props`, `import-props.mjs`), breath frames (only if breath.json `"approved": true`), every `_raw/maps/*.spec.json` (`import-map.mjs` v2: `units:"px"`, `blocks`, feet-point `spawns`, `zones`, `occluders`, `patches`), title (`import-title.mjs`), street map.
- Image generation: Figma MCP `generate_image`, model `gpt-image-2.5-sunburst`, **planKey `team::1113684943164685803`** (user's personal team, never the Netradyne org); ≤ 3 rerolls per asset. Prompts + provenance in each `_raw/*/README.md`.
- Generated-map QA: debug preview (blocks + occluders over the darkened map — pattern in MEMORY.md), then walk every route in the browser.

## 5. Verifying in the browser pane
- Prefer the playground: `?node=<sceneId>&beat=<id>&preset=<id>&device=iphone15`; `window.__nqDev` (loadNode/applyState/getState/speed/pause/step/showZones/showCollision). Playground saves go to the `playground:` namespace.
- Dev handles: `window.__nqGame`, `window.__nqStore`. Key events need `keyCode` (E=69, Enter=13, arrows 37–40). Teleport by feet: `p.setPosition(fx, fy - 17); p.body.reset(p.x, p.y)`.
- Hidden pane stalls RAF; tweens use the real clock — step in real time (`game.step(performance.now(), 16.67)` every 16 ms).
- The user's own game may be open in the pane's first tab — test in a new tab.

## 6. Open items the user owns
- **P6b audit** (map). Content calls to confirm: the Office pin near ITPL and the Ambedkar Nagar position (both guesses until P7/P8); chat-line voice review; app hints copy.
- Breathing lines approval (T-029), when they want to return to it.
- T-018: Xcode / Android Studio or cloud CI (native shells never booted on this Mac).
- Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 7. Debt not to forget
T-024 compact phone HUD + landscape lock + safe areas (P6c retires the DOM HUD) · T-027 occluders/pixel collision for the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · toasts stack when several arrive at once · health/stress ticks not yet · dialogue typewriter (Settings: dialogue speed) → P6c · no audio yet (Settings volumes inert) · phone has no gamepad input yet (P6d) · toasts are still the DOM toasts (P6c queues them in-canvas).
