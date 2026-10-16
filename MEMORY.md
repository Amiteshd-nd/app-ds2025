# Memory
Updated: 2026-10-16
Facts about the project and the user that fit nowhere else. Design in `docs/design/`; the founder model is `docs/design/bangalore_rpg_founder_profile_and_vision.md`.

## About the user
- Solo one-person studio brain (designer · writer · architect · principal engineer · art director · PM · growth). Expects Claude to think at all those levels at once.
- Agile, phase-by-phase, audit-driven: "finish one task, then the next". Never build 5 scenes ahead of an audit.
- North stars: realism (rupees, PGs, UPI), systems over content (one mechanism reused), emotion + meaning, ethical marketing.
- Lead with a one-line reaction, then substance. Offer yes/no options when he's deciding. Name the ADR when something conflicts with a past decision and let him choose.
- Dislikes being asked questions he has already answered — check `DECISIONS.md` + `docs/design/` first.

## Working agreements
- Every system names which core-loop step it serves (Challenge→Action→Feedback→Progress→Reward→Curiosity).
- Free-commercial-licence tools only (MIT/Apache/CC0); brands parodied, no real institutions as the virus source.
- `corepack pnpm`, not npm — the repo has its own lockfile. Port 6174 only (never 4xxx/5xxx).
- Tests green before and after every change (117 at P0 start); `pnpm validate` + `pnpm typecheck` are part of "green".
- Commit after each P0 sub-task; attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Art generation
- Figma MCP `generate_image` is the image generator available here (paid, Figma AI credits). Use the user's **personal** plan `team::1113684943164685803`, never the Netradyne org. Retro Diffusion / PixelLab (the docs' tools) need API keys the user has not provided.
- AI "pixel art" is pixel-styled, not grid-aligned; it is a style/palette reference only. Real tiles/sheets are quantised to `palette.gpl` by the pipeline.
- User's taste from the P1 references: chibi big-head characters, chunky 1px outlines, dense props, saturated-but-muted colour, storefront faces visible; poster register = dark blue + warm lamp light.

- Sprites: generate a 3×4 magenta-background sheet with `src/assets/_raw/characters/prompt-template.md`, drop the raw in `_raw/characters/`, run `pnpm art` (import-sheet does key/snap/quantise/skins). Review at 4× next to the reference before the audit. The code rig is for citizens/placeholders only.

- Money: never touch `stats.wallet` directly — `StatsManager.spend()` / `earn()`. Content effects use `wallet`, `food` (not `money`, `energy`; the validator rejects those).
- NPC sheets: drop a raw named `npc_<id>.png` in `_raw/characters/` (template prompt) → `pnpm art` imports it as one sheet; set `"sheet": "npc_<id>"` on the NPC.

- Interiors: generate one top-down render (prompt notes in `_raw/maps/README.md`), drop `<name>.png` + author `<name>.spec.json` on a 32px grid overlay (sharp + svg grid), `pnpm art` imports. Verify collision in-engine by teleporting the player.
- Verifying in the browser pane while it is hidden: Phaser's RAF stalls — step the loop with `game.step(t, 16)` (see `window.__tick` pattern) and wait for `activeScene === 'TitleScene'` before starting scenes.

- Negotiations: tune by reading numbers — `NegotiationManager` is deterministic (share of the gap × temperament + rep, ₹100 steps, floor). The tests in `src/__tests__/negotiation.test.ts` pin the Shanthamma/token/HiveNest paths; change content → update the numbers there.
- Browser-pane driving recipe (P5): helpers `__tp(tx,ty)` (teleport via `player.setPosition` + `body.reset`), `__press(69)`, and setting `ws.dialogueBox.selected = i` before E to pick a choice; read `ws.dialogueBox.view`. New tilemaps/sprites were picked up by a page reload this time (no server restart needed).

- Generated-map QA (P5 audit): collision = where things meet the ground, pixel rects in source px; tall things are occluders cut from the render; check with the debug preview, then walk every route. sharp applies `resize` before `composite` in one pipeline — composite to a buffer first when making previews.

- Motion tokens live beside colour tokens: `scripts/art/tokens.mjs` MOTION_TOKENS → `tokens.json.motion` → `motion('m.…')` in `src/ui/tokens.ts`.
- Breathing is baked frames (`<sheet>__breath.png`, ADR-107), never a sprite offset. Lines in `_raw/characters/breath.json`; review with `node scripts/preview-breath.mjs <outDir> player_m player_f` (6× F0–F3 + all-fronts contact sheet).
- Phaser tweens time themselves off the real clock: when the browser pane is hidden, step the loop in real time (`g.step(performance.now(), 16.67)` every 16 ms), not in a fast loop.

- Test Playground: `corepack pnpm playground` → /playground.html (dev only). Deep link `?node=<sceneId>&beat=<id>&preset=<id>&device=iphone15`. It installs `window.__nqDev` (src/dev/devApi.ts) and saves under `bangalore-times:save:playground`. Phaser inside a CSS-scaled frame needs parent/centre measured from layout sizes (patched in Playground.tsx only).

- Saves are async under the hood (platform.saves) but sync to the game: BootScene awaits `SaveManager.init()`; tests seed a backend (`useBackend`) or seed legacy localStorage then `await init()`.

- UI font (ADR-114): Pixelify Sans is NOT a clean 5×7 font — its "pixels" alternate ~80/101 units with steps and nubs, so browsers smear it and some glyphs read wrong at 1× (5≈S, Z≈2, B≈G, parens≈braces). `scripts/import-font.mjs` samples outline centres on a 93-unit grid; legibility fixes go in its `OVERRIDES` (hand-drawn rows), never by switching to browser text. The H's 1px tooth above the crossbar is the font's own design — keep it.
- UI text in Phaser: `pxText(scene, x, y, text, {bold, tint, k, align})` puts the CAPS at y (line box has 2 empty rows above). Measure with `measure()` from `src/ui/kit/text.ts` — it reads the same metrics as BitmapText.
- Driving the phone in the playground: hide the side panels so the canvas is big (`.pg-root` children other than `.pg-centre` → display:none, then dispatch `resize`), then send keys with `code` (PhoneScene reads `ev.code`): `new KeyboardEvent('keydown', {code:'KeyP', key:'p', keyCode:80})`. Ledger lines for a UPI check: `__nqStore.getState().addTransaction({...})`.

- HUD (ADR-118): everything a player sees in play is in `HudScene`; no DOM. To add a plate: geometry in `ui/hud/layout.ts`, the pure view in `viewModel.ts` (test it), paint in `HudScene.render()` (chrome texture + `pxText`), and a deadline in `scheduleRefresh` if it times out. Per-frame work only in `update()`.
- Browser-pane verification of the HUD: screenshots of a WebGL canvas go stale while the pane is hidden — take `g.renderer.snapshot(cb)` → data URL → decode to PNG in the scratchpad and Read it. Key presses need keydown and keyup ~90 ms apart (Phaser clears `_justDown` on keyup). `hud.cardUntil / objectiveUntil / savedUntil / wallet = {…until}` can be pushed out to hold plates for a screenshot.

- Menus (ADR-119): a new setting = one atom in `settings.defaults.json` + one row in `data/menus/settings.json` (the validator ties them); the menu draws it. A new pause item = `pauseRows` + a `pauseAction` case. Anything that must open the menu calls `MenuScene.open({...})`; the scene is global (Boot starts it) — never launch or stop it from a world scene.

- Content that names a district which does not exist yet goes to `src/data/_drafts/<phase>/` (not globbed, not validated) with a README — never a placeholder map. Move it live when the pocket lands (done for P7).
- New pocket recipe (P7, ~1 session): district stub with `realworld` + `area.radiusM` → `node scripts/fetch-osm-area.mjs <id>` → read the extract for the nearest named road, anchor on its kerb, bearing along it → one 1536×1024 render (README prompt rules; look-only Google photos for architecture) → gridded copy (100 px lines) to author the px spec → `import-map.mjs` + a debug preview (blocks magenta, zones cyan, occluders orange, spawns yellow) → walk routes in the browser by teleport + static-body probe (zones count as hits — ignore them).

- Furniture and other "things you buy" are sprite objects (ADR-122): a cell in a props sheet (`import-props.mjs` SHEETS, per-cell `heights`) → `data/objects/*.json` with `sprite` → a district `objects` ref with `requiresFlag`. Rooms are rendered empty.

## Gotchas
- `src/assets/tilemaps/whitefield_street.tmj` is **generated** by `scripts/generate-street-map.mjs` — edit the generator, run `pnpm art`, never hand-edit the .tmj. `airport_interior.tmj` is hand-authored (ported reference art, provenance unresolved — see `CREDITS.md`).
- `scripts/validate-content.ts` runs as raw TS under Node 24 and imports `src/utils/constants.ts` and `src/ui/kit/icons.ts` — keep those free of Vite-only syntax and of JSON imports (Node needs `with { type: 'json' }`); the validator reads `fonts/metrics.json` with `readFileSync` instead.
- This Mac has Command Line Tools only: no Xcode, no CocoaPods, no Android SDK/Java. `android/` + `ios/` (SPM) are generated and `cap sync` works; building/running them needs Xcode / Android Studio (T-018). Mobile smoke tests at gates are therefore "sync OK, not booted" until then.
- Driving the game from the browser tool: its key presses lack `keyCode`, which Phaser reads — dispatch `KeyboardEvent`s with `keyCode` via `javascript_tool` instead. `window.__nqGame` / `window.__nqStore` are the dev handles.
- The current reference tilesets (`airport.png` etc.) are continuous-tone, not pixel art, and have unresolved provenance — placeholders until P1.

## Parked
See `docs/design/bangalore_rpg_unfinished_business.md` and the *(proposed)* rows in `DECISIONS.md`.

## P9 (2026-10-16) — Cubbon Park, built, awaiting audit
- Bus to town (1.5) and Cubbon Park (1.6) are live (ADR-123/124): `busSchedule` (interval bus + HUD timer plate), `busRide` (auto-ending ride), Camera + `photoSpots` (City Moments), `RelationshipManager` (Contacts shows the word), Notes (wishlist), `companion` (Ananya follows), NPC `tic`, `ChatMessage.upi`. Act 1 ends on the sleep after Amma's call → `act2_started` unlocks Dating.
- Browser QA recipe that finally held: `game.loop.sleep()` and drive ONE virtual clock with `game.step(__T += 16.67, 16.67)` (mixing with the real RAF runs time backwards and breaks timers); stub `MenuScene.open` while scripting (the pane's visibility pause opens the menu mid-run and freezes `playerFree()`); tweens run on `Date.now()` — patch `scene.tweens.getDelta = () => 16.67 * timeScale` on every scene so they follow the virtual clock; `document.hidden` is true during tool calls, so real time never advances inside a script.

## Render model (2026-10-16, ADR-125) — all ten maps migrated (airport approved) + Playground Locations built
- Seven layers from the manifest; `sorted` = cut-outs with footprints + placed objects; `above` = overhead cut-outs; `collision` rects (kind) on generated maps; `FEET_BOX` token; `feetY` from the body. Migrate a map = re-author its spec (`buildings` / `sorted` / `above`), `sop: true`, re-import, A5 walk, AUDIT_LOG line.
- The reachability rule (8 px BFS with the feet box) is strict on purpose: it found the hill pole and the ITPL autos blocking whole lanes. Block only where a thing meets the ground.
- Keying thin poles against a noisy road needs `bgShare` 0.03–0.06; small solid things (benches, bins, tables, pots) are fine in `rect` mode; canopies that will not key go `rect` with a tight rect. Cables never key cleanly — leave them (T-051).

## P10 (2026-10-16) — 2.1 "Credited", built, awaiting audit
- Paydays, Noor Motors on ITPL Main Road, outright haggle vs EMI (`emi` behaviour on `wallet:earned` reason salary), fuel as a counter + `StatEffect.fuel`, Maps RIDE through `MapManager.scooterRide`, contextual fuel gauge (`fuelSpots` zones + `fuel:show`). User's decisions: ₹42,000, both EMI and outright, ITPL road, stay in Whitefield.
- Figma `generate_image` lost its planKey URL mode mid-session: create a scratch design file (`create_new_file` on the personal plan), generate with `fileKey`, then `download_assets` and curl the raw image URL.

