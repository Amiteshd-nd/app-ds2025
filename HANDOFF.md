# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-12, end of the P5 build session. Purpose: a new chat picks up exactly where this one stopped.

## 0. Where we are — in one breath
Bangalore Times (working title in docs: NAMMA OUTBREAK). Phases **P0 → P5 approved.** Pre-P6 work built and awaiting audit: living title screen (ADR-101/102) and the **Test Playground** (ADR-104/105/108, `corepack pnpm playground`). Breathing is **switched off** (T-029, parked). Next task: **brand-new airport** (T-031), then **P6** (phone overlay). Nothing is pushed since the first push — push only when the user asks. Dev server: `corepack pnpm dev` → http://localhost:6174. 208 tests, typecheck, validators, `pnpm build` all green.

## 1. Phase ledger
| Phase | State | Audit |
|---|---|---|
| P0 docs / WorldScene / validators / platform shell | done | approved; title → **Bangalore Times** |
| P1 Style lock | done — `src/assets/_meta/style/style_sheet.png` + `palette.gpl` (48 colours), candidate D | approved |
| P2 Character creation + sprites | done — offer-letter form, generated+imported M/F × 5 skins, 3-frame sheet contract | approved after 3 rounds |
| P3 M0 loop (airport → Chai Anna → fare → Whitefield) + stat model + touch controls | done | approved |
| P4 Hotel (3 nights, TimeSystem, `hotelNightTimer`, generated interior) | done | approved ("proceed") |
| **P5 PG Hunt (Prashanth Layout, negotiation ADR-95, NPC memory ADR-96, food drain ADR-97, lane cast ADR-98)** | done (round-1 fixes ADR-99/100) | approved |
| **Title screen (living golden-hour Bengaluru, ADR-101/102)** | **built** | **awaiting audit** |
| P6 Phone overlay (Maps, Chats, UPI) + minimap + Settings + Save/Load | next | — |

## 2. Resume protocol
1. Read `CLAUDE.md` §0 rules, then `TASKS.md` "Now", `DECISIONS.md` last rows (ADR-95..98), `MEMORY.md`, `AUDIT_LOG.md` (every correction is a standing rule).
2. **Remind the user to audit the Test Playground** (they asked to be reminded) and to come back to breathing (T-029) when they have time. Then ask to **audit the title screen** (warmth, motion, menu legibility) and to keep or supersede **ADR-101** (title keeps its own 64-colour palette, conflicts with ADR-61). Then ask for **P6 references** (phone screen, HUD restyle, pixel font — ADR-30) before any P6 visual work. Path to show: on the Whitefield street walk off the **east end of the top pavement** → Prashanth Layout. Green gate (token scam; pay or refuse) → Leela Aunty (warns before / consoles after) → HiveNest co-living (haggle; still unaffordable) → Shanthamma at the blue gate (haggle ₹18,000 → ≈ ₹14,300) → darshini/provisions on the **bottom pavement** (reach it down the main-road strip at the left edge) → blue gate → room → cot (Amma's call, then sleep).
3. Already answered at round 1: Shanthamma's voice, ADR-97 food drain and the HiveNest retune are approved — do not re-ask.
4. Record corrections in `AUDIT_LOG.md` as reusable rules, fix, commit, then start **P6** (ask for UI reference images first — ADR-30: phone, HUD restyle, pixel font).

## 3. P5 — what was built (for fixes)
- Content: `src/data/{negotiations,dialogue,npcs,quests,scenes}` — `neg_shanthamma` (warm), `neg_pg_token` (firm), `neg_coliving` (slick); `dlg_shanthamma`, `dlg_pg_token`, `dlg_neighbour_leela`, `dlg_coliving`, `dlg_darshini`, `dlg_provision`, `dlg_amma_call`; `q_act0_pg_hunt` (started by Divya's call or on entering the lane); `act0_pg_hunt` scene component with acceptance list.
- Maps: `_raw/maps/prashanth_layout.{png,spec.json}` (36×24; lane rows 10–14; bottom shops served from rows 22–23 via col 0) and `shanthamma_pg.{png,spec.json}` (24×16). Street exit `lane_zone` at the east end of the top pavement (generator).
- Engine: `systems/NegotiationManager.ts`; DialogueManager negotiate nodes + `enter` branches; DialogueBox auto-sizes (≤ 6 choices + bill line); Populate/WorldScene `unlessFlag` NPCs; Triggers `unlessFlag`; Exits `lockedText`; StatEffect `reputation`; TimeManager food drain; Player hunger slow; hotel ₹1,800 extra nights; HUD two quests + controls hint bottom-right.
- Verified in the browser pane: full lane loop (token paid → owner fades → Leela lesson; HiveNest floor ₹43,000 locked; locked-gate toast; Shanthamma deal ₹14,300; idli +40 food; room → Amma once → sleep → quest complete, rep 5). Mobile viewport: joystick moves, A talks to Leela.

## 3b. Round-1 fixes (for further fixes)
- `scripts/import-map.mjs` v2: specs in source px (`units: "px"`) — `blocks`, feet-point `spawns`, `zones`, `occluders` (key + seeds or rect). Debug: render blocks + occluders over the darkened map (see `_raw/maps/README.md`), then walk every route in the browser with `__tpf(fx, fy)` (teleport by feet) and held arrow keys.
- `world/Shapes.ts` builds the `Shapes` layer; NPC feet bodies in `Populate.npcs`; crowd collides with the player; `WorldScene.frameCamera` centres small rooms on black.
- Interiors are 10×7 tiles now; crowd = 8 `crowd_*` sheets; receptionist generated. Still placeholder: cab tout, lanyard man, legacy airport four (T-022). Airport + street have no occluders yet (T-027).

## 4. Pipelines (exact commands)
- Art: `corepack pnpm art` — regenerates tokens.json, citizen rig sheets, **imports every `src/assets/_raw/characters/*.png`** (3×4 magenta sheets → 96×192, player_* get 5 skins) and **every `src/assets/_raw/maps/*.spec.json`** (render → unique-tile tileset + .tmj), street map.
- New character: prompt from `src/assets/_raw/characters/prompt-template.md` (say which leg is forward per cell), save raw as `_raw/characters/<id>.png`, run art, set `"sheet": "<id>"` on the NPC. Review at 4× (sharp nearest) next to the reference before showing the user.
- New interior: prompt notes in `src/assets/_raw/maps/README.md`; make a grid overlay (sharp + svg, see MEMORY), author `<name>.spec.json` (solid rects, spawns, zones in tile coords), add a `maps.manifest.json` entry + district, run art. **Keep spawns off exit zones** (the player's feet box is rows y+11..y+23 of the 48px frame).
- Image generation: Figma MCP `generate_image`, model `gpt-image-2.5-sunburst`, **planKey `team::1113684943164685803`** (user's personal team — never the Netradyne org). Each call costs credits; max 3 rerolls per asset.
- Checks: `corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate` (maps + content + world + platform boundary). `pnpm build` runs them all before Vite.

## 5. Verifying in the browser pane (the tricks that cost time to learn)
- Dev handles: `window.__nqGame`, `window.__nqStore`. Scenes: Boot → Title → CharacterSelect → World → Transit.
- The pane's key presses lack `keyCode`; dispatch `KeyboardEvent`s with `keyCode` (E=69, Enter=13, arrows 37–40). Text fields: set `input[aria-label]`'s value and dispatch `input`.
- When the pane is hidden Phaser's RAF stops: step with `game.step(t += 16, 16)` (pattern `window.__tick(n)` in MEMORY.md) and wait for `activeScene === 'TitleScene'` before `scene.start`.
- After creating a **new** tilemap file, restart the preview server (Vite's glob did not see it; the console shows stale "not in src/assets/tilemaps" errors).
- Mobile: `resize_window mobile` then **reload** (the coarse-pointer overlay mounts on load); joystick = pointer events on `.nq-stick`, A = `.nq-action`.

## 6. Open items the user still owns
- ADR-30 reference images: given (10 refs, described in `_meta/style.json`); ask again before any **UI** (phone, HUD restyle, pixel font).
- T-018: Xcode / Android Studio or cloud macOS CI (no Xcode, CocoaPods, Android SDK or Java on this Mac → shells generated, synced, never booted).
- Unfinished business (docs/design/bangalore_rpg_unfinished_business.md): names, endings, co-op, monetization, trailer honesty (ADR-53), fall-order amendment.
- Model: user asked whether to switch to Opus 5.5; answer given (their call, switch between phases). Commit attribution line comes from the session's system reminder.

## 7. Debt the next phases must not forget
P5: lane NPCs done, but the hotel receptionist, cab tout, lanyard man and legacy airport NPCs are still tinted placeholders (T-022) · ambient citizens are still rig sheets · portrait phones letterbox the canvas (T-024) · T-021 street tiles + airport tileset off-palette (validator warns) · T-022 citizens + remaining NPC sheets through the pipeline (cab tout, lanyard man, receptionist ×2, helper, guard, kiosk are tinted blocks) · T-023 airport interior regenerated · T-024 landscape lock + rotate panel + safe-area HUD · T-015 quest taxonomy + rep tiers (ADR-18/22/26) · T-011 SaveManager → `platform.saves` (allowlisted) · toasts stack when several arrive within 3 s · food drains now (ADR-97); health/stress ticks still none.
