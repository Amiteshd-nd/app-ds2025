# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-13, end of the long P5→P6 session (last commit `870ade9`). A new chat picks up exactly here.

## 0. Where we are — in one breath
Bangalore Times (docs' working title: NAMMA OUTBREAK). **P0 → P5 approved**, plus the living title screen, the Test Playground and the brand-new airport (all approved 2026-10-13). **P6 is half built:** the systems are done and committed (save slots on `platform.saves`, settings, phone rules: chats / UPI ledger / Maps data — ADR-110/111/112). **The P6 UI is blocked on the user's reference images** (CLAUDE.md rule 2 / ADR-30): phone screen, HUD + minimap, Pause/Settings/Load menus, and a pixel font (downloading a font file needs the user's OK). **Breathing is parked and switched off** (T-029). Nothing pushed since the first push — push only when asked. 271 tests, typecheck, validators, `pnpm build` (+ dist check) all green.

## 1. Phase / task ledger
| Item | State |
|---|---|
| P0–P5 (docs, style lock, characters, M0 airport loop, hotel, PG hunt + negotiation) | approved |
| P5 round-1 fixes: generated crowd, pixel collision + occluders (ADR-99), interiors at character scale on black (ADR-100) | approved |
| Title screen — golden-hour Bengaluru, traffic, metro, petals, chai-tumbler cursor (ADR-101/102; own 64-colour palette kept) | approved |
| Look wording: "16-bit era on 32px tiles" (ADR-103) | decided by user |
| Test Playground `/playground.html` (ADR-104/105/108) | approved |
| New airport `kempegowda_arrivals`, moving luggage carousel, all airport NPC sprites (ADR-109) | approved |
| Breathing (T-029): baked upper-body frames pipeline (ADR-107) | **parked, OFF** — lines in `_raw/characters/breath.json` await approval (`"approved": false`) |
| **P6 systems** (ADR-110/111/112) | **built** |
| **P6 UI** (PhoneScene + Maps/Chats/UPI, minimap, Pause/Settings/Load, pixel font) | **waiting for references** |

## 2. Resume protocol
1. Read `CLAUDE.md` §0, `TASKS.md` "Now", `DECISIONS.md` (ADR-95…112), `MEMORY.md`, `AUDIT_LOG.md` (every correction is a standing rule).
2. If the user sent P6 references: build the UI on the existing systems (below), audit-ready, then STOP for audit (+ mobile smoke in the playground's phone frame). If not: ask for 2–4 references (phone, HUD/minimap, menus) + font choice (Silkscreen / Pixelify Sans / m5x7 suggested, all free-licence; download needs OK).
3. The user also wants the chat lines (4 threads, drafts) checked for voice. Shanthamma's voice, food drain (ADR-97), HiveNest retune: already approved — do not re-ask.
4. Come back to breathing only when the user asks (seated characters never breathe).

## 3. P6 — what exists, where the UI plugs in
- **Saves** `systems/SaveManager.ts`: slots `autosave|slot1|slot2|slot3` via `platform.saves`; `init()` once at boot (BootScene awaits it with settings load); `save(position, slot)`, `load(slot)`, `restore(slot)`, `clear(slot)`, `summaries()` (name, place, day, ₹, playtime, timestamp — thumbnail TBD with the menu art); format 1.6.0; autosave on area change, sleep, purchase, quest step (batched 400 ms in WorldScene). Legacy single-key save auto-migrates.
- **Settings** `systems/SettingsManager.ts` (`useSettings`, `settings()`, `survivalRate()`), defaults `src/data/settings.defaults.json`, persisted via `platform.storage`. Live today: Relaxed difficulty (food drain ×0.5), Do Not Disturb (non-critical buzzes muted), joystick side (`.nq-touch-right`). Others (volumes, minimap, dialogue speed, text size…) await their UI/features.
- **Phone** `systems/PhoneManager.ts`: `apps()` (from `src/data/phone/apps.json`, unlocked by flag — maps/calls on `divya_called`), `threadsView()` / `unreadCount()` / `markRead(id)` (chats in `src/data/phone/chats/*.json`, delivered in order on flags + on district entry; buzz = `ui:toast`), `upi()` (balance + ledger from `store.transactions`; every `spend/earn(cost, reason, label)` writes a line), `maps()` (pins from districts' `realworld` lat/lng — interiors fold into `parent` — states here/open/locked, plus the active objective's `destination`).
- **To build (UI):** `PhoneScene` overlay (open with a key / HUD button / touch), app grid with greyed apps, Chats list + thread, UPI balance + ledger, Maps (project lat/lng onto a stylised Bengaluru, pins + destination; no real map tiles — map_navigation §5); HUD minimap from the current tilemap + spawn/exit/NPC markers (respect `settings.gameplay.minimap`); Pause menu (Resume · Settings · Save · Load · Map · Quit) pausing WorldScene; Settings menu over `useSettings`; Load/Save over `SaveManager.summaries()`; Title "Settings" + "Continue/Load". Compact phone HUD needed: at iPhone size the HUD + quest panel cover ~⅓ of the screen (T-024, seen in the playground phone simulation).

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
- P6 references + font choice (blocking the UI). Chat-line voice review.
- Breathing lines approval (T-029), when they want to return to it.
- T-018: Xcode / Android Studio or cloud CI (native shells never booted on this Mac).
- Unfinished business doc: names, endings, co-op, monetization, trailer honesty.

## 7. Debt not to forget
T-024 compact phone HUD + landscape lock + safe areas · T-027 occluders/pixel collision for the procedural Whitefield street · T-021 street tiles off-palette · T-015 quest taxonomy + rep tiers · toasts stack when several arrive at once · health/stress ticks not yet · dialogue typewriter (Settings: dialogue speed) not yet · no audio yet (Settings volumes inert).
