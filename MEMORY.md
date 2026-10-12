# Memory
Updated: 2026-10-12
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

## Gotchas
- `src/assets/tilemaps/whitefield_street.tmj` is **generated** by `scripts/generate-street-map.mjs` — edit the generator, run `pnpm art`, never hand-edit the .tmj. `airport_interior.tmj` is hand-authored (ported reference art, provenance unresolved — see `CREDITS.md`).
- `scripts/validate-content.ts` runs as raw TS under Node 24 and imports `src/utils/constants.ts` — keep it free of Vite-only syntax.
- This Mac has Command Line Tools only: no Xcode, no CocoaPods, no Android SDK/Java. `android/` + `ios/` (SPM) are generated and `cap sync` works; building/running them needs Xcode / Android Studio (T-018). Mobile smoke tests at gates are therefore "sync OK, not booted" until then.
- Driving the game from the browser tool: its key presses lack `keyCode`, which Phaser reads — dispatch `KeyboardEvent`s with `keyCode` via `javascript_tool` instead. `window.__nqGame` / `window.__nqStore` are the dev handles.
- The current reference tilesets (`airport.png` etc.) are continuous-tone, not pixel art, and have unresolved provenance — placeholders until P1.

## Parked
See `docs/design/bangalore_rpg_unfinished_business.md` and the *(proposed)* rows in `DECISIONS.md`.
