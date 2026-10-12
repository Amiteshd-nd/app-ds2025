# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-12, end of the P4 build session. Purpose: a new chat picks up exactly where this one stopped.

## 0. Where we are — in one breath
Bangalore Times (working title in docs: NAMMA OUTBREAK). Phases **P0 → P4 are built and committed** on `main` (last commit `eecd5d9`, "P4: Scene 0.2 Hotel"). **P4 is awaiting the user's audit.** Nothing is pushed to `origin` (https://github.com/Amiteshd-nd/app-ds2025.git) since the first push — push only when the user asks. Dev server: `corepack pnpm dev` → http://localhost:6174. 183 tests, typecheck, validators all green at the last commit.

## 1. Phase ledger
| Phase | State | Audit |
|---|---|---|
| P0 docs / WorldScene / validators / platform shell | done | approved; title → **Bangalore Times** |
| P1 Style lock | done — `src/assets/_meta/style/style_sheet.png` + `palette.gpl` (48 colours), candidate D | approved |
| P2 Character creation + sprites | done — offer-letter form, generated+imported M/F × 5 skins, 3-frame sheet contract | approved after 3 rounds |
| P3 M0 loop (airport → Chai Anna → fare → Whitefield) + stat model + touch controls | done | approved |
| **P4 Hotel (3 nights, TimeSystem, `hotelNightTimer`, generated interior)** | **built, commit `eecd5d9`** | **awaiting audit** |
| P5 PG hunt | next | — |

## 2. Resume protocol
1. Read `CLAUDE.md` §0 rules, then `TASKS.md` "Now", `DECISIONS.md` last ~10 rows (ADR-87..94), `MEMORY.md`, `AUDIT_LOG.md` (every correction is a standing rule).
2. Ask the user for the **P4 audit** if they have not given it (what to show: New Game → airport → bus → on the Whitefield street walk into the doorway above the first awning, 11th storefront from the left → reception → room doorway (Divya's call) → bed ×3 → checkout toast).
3. Record corrections in `AUDIT_LOG.md` as reusable rules, fix, commit, then start **P5**.

## 3. P5 — PG Hunt, what the docs say (story 0.3, components §5/§8, whiteboard §2.2)
- District(s): the PG lane "Prashanth Layout" (new map) + three PGs: (1) "Boys/Girls Only" — full, owner takes a ₹500 token and ghosts (scam, rep lesson); (2) "Veg Only, Gate 10" — owner **Shanthamma** (T3): ₹10,000 deposit + ₹8,000 advance (retuned for ₹35,000 wallet, profile doc §2 note) → negotiate down; (3) "Luxury Co-living" ₹15,000, unaffordable on purpose. End: move in (bed), Darshini + provision store snacks ₹120 (food meter), night beat: Amma call, homesick, save.
- Systems to build: **negotiation mini-system** (offer / counter / walk × 3 NPC temperaments, reputation modifier — ADR-22; spec is still "to write", see unfinished_business) and the PG quest opening on `hotel_nights_done` (or earlier — the hotel timer is the pressure, not a lock).
- **Co-author Shanthamma's lines with the user** (CLAUDE.md §4: story beats are co-authored; the user wants to be asked about taste, not engineering).
- Reuse: generate the PG lane like the hotel (one render → `scripts/import-map.mjs`), or a reusable PG façade kit if the lane repeats (ADR-92 note). Interiors: PG room render.
- Gate: audit after P5; mobile smoke = joystick check on a phone viewport.

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
T-021 street tiles + airport tileset off-palette (validator warns) · T-022 citizens + remaining NPC sheets through the pipeline (cab tout, lanyard man, receptionist ×2, helper, guard, kiosk are tinted blocks) · T-023 airport interior regenerated · T-024 landscape lock + rotate panel + safe-area HUD · T-015 quest taxonomy + rep tiers (ADR-18/22/26) · T-011 SaveManager → `platform.saves` (allowlisted) · toasts stack when several arrive within 3 s · no survival ticks yet (food drain etc. — belongs with TimeSystem in P5/P7).
