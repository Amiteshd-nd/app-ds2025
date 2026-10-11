# Namma Quest — repo guardrails

A top-down pixel RPG set in Bengaluru. Phaser 3 for the game canvas, a thin React
shell around it, shipped as an installable PWA.

This repo was split out of the `cloud-march` monorepo (`packages/game`) so the game
can carry its own deploy target and release cadence. Its git history is preserved.

## 1. Scope — changes stay in this repo

Every change happens **exclusively inside this repository directory**. Never create,
edit, move, or delete files outside it (no global configs, no other projects, no
home-directory files) as part of repo work.

## 2. Ports — never start with 4 or 5

**Do not use any port that begins with the digit 4 or 5.** That rules out the whole
4xxx and 5xxx ranges, including Vite's 5173 default.

| Service | Port |
| ------- | ---- |
| game (vite dev) | 6174 |

The port is pinned in `vite.config.ts` via `server.port` + `strictPort`, so it holds
however the dev server is started.

Note: numbers like `4326` in map or coordinate data are EPSG codes, **not** ports.

## 3. Content is validated, not trusted

`pnpm build` runs `validate-maps` and `validate-content` *before* `tsc` and `vite build`.
Tilemaps, districts, NPCs, dialogue, quests and items all have schema checks in
`scripts/`. Adding content means adding to the validator when the shape changes —
a build that skips validation is not a build.

`pnpm validate` runs both checks on their own.

## 4. Art is generated, not hand-committed

The sprite sheets, tilesets and street map come out of `scripts/generate-art.mjs`
and `scripts/generate-street-map.mjs` (via `sharp`). Run `pnpm art` to regenerate.
Intermediate files land in `scripts/.work/` and are gitignored — large and
regenerable. See `docs/asset-pipeline.md`, and `CREDITS.md` for asset provenance.

## 5. Animation

The game canvas animates through Phaser's own tween/timeline system — that is the
right tool there, and nothing else should be fighting it for frames.

For the **React/DOM shell** around the canvas (menus, dialogue overlays, HUD
chrome), if you reach for a DOM animation library, use [motion.dev](https://motion.dev)
(the `motion` package). **Do not add `framer-motion`** — it is the same library under
its old name, and two majors of one library means two React contexts that will not
coordinate.

`prefers-reduced-motion` is not optional. Collapse the motion, never hide the element.

## 6. Dependencies are declared, not inherited

This repo has its own lockfile. When the game was inside the monorepo it silently
borrowed `@types/node` from a sibling package's hoisted tree and only typechecked by
accident. If a build needs a package, **declare it here** — there is no root tree to
fall back on any more.

## Commands

```bash
corepack pnpm dev        # http://localhost:6174
corepack pnpm test       # vitest, 117 tests
corepack pnpm validate   # maps + content
corepack pnpm typecheck  # tsc --noEmit
corepack pnpm build      # validate → typecheck → vite build (+ PWA)
corepack pnpm art        # regenerate sprites, tiles, street map
```
