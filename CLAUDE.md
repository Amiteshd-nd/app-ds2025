# BANGALORE TIMES — Claude entry point. Read this FIRST.
Updated: 2026-10-11

A pixel-art survival RPG with a **16-bit-era look on 32px tiles** (ADR-103: what the design docs call
"32-bit"), LeafGreen-style top-down camera (AUDIT_LOG P1), set in a real, lived-in
Bangalore. Phaser 3 canvas, thin React shell, PWA first, then Android + iOS from the
SAME codebase via Capacitor (ADR-64). This file drives the whole build. Follow it top to bottom.

## 0. Golden rules (never break)
1. **Phased build.** Build ONE phase/scene at a time. After each, STOP and ask the user to audit. Record corrections in `AUDIT_LOG.md` as reusable rules and apply them forever after. Never build ahead of an audit.
2. **Ask the user for reference images yourself**, right before any visual/UI work (style lock, sprites, HUD, phone, menus). Do NOT start visual work without them. (ADR-30)
3. **Drift guard.** If anything conflicts with a logged decision or a design doc, STOP, quote the ADR/doc + what was decided, and ask the user to keep it or supersede it. Never silently follow either. Supersede via a new `DECISIONS.md` row, never overwrite.
4. **Data, not code, for content.** Places = `districts.json` entries read by one `WorldScene`. Quests/NPCs/dialogue/items/scenes = JSON. No new Scene class per place.
5. **Hard constraints.** Tiles 32×32, characters 32×48 (validator enforces). No GPL runtime deps (MIT/Apache/CC0 only). No real brand logos/names in art (parody). No pay-to-win; monetization never touches balance.
6. **One codebase, three platforms.** Game code never calls browser/Capacitor APIs directly — only `src/platform/`. Touch-first, safe areas, audio unlock, native-safe saves. Web ships first; mobile is a smoke test at every gate until M1. (ADR-64)
7. **Scope.** Every change happens exclusively inside this repository directory. Never touch files outside it.
8. **Ports.** Never use a port beginning with 4 or 5 (no 4xxx/5xxx, so no Vite 5173). Dev server = **6174**, pinned in `vite.config.ts` (`strictPort`). Numbers like `4326` in map data are EPSG codes, not ports.
9. **Content is validated, not trusted.** `pnpm build` runs `validate-maps` + `validate-content` before `tsc` and `vite build`. Changing a content shape means extending the validator in `scripts/`. A build that skips validation is not a build.
10. **Art is generated, not hand-committed** (until P1 Style Lock lands a real pipeline). `pnpm art` regenerates sprites/tiles/street map from `scripts/generate-*.mjs`; `scripts/.work/` is gitignored. Provenance in `CREDITS.md`.
11. **Dependencies are declared here.** Own lockfile; no monorepo to borrow from. If a build needs a package, add it.
12. **Animation.** Canvas = Phaser tweens only. React/DOM shell = `motion` (motion.dev) if a library is needed — never `framer-motion`. `prefers-reduced-motion` is mandatory: collapse motion, never hide the element.

## 1. Stack
Phaser 3.90 · TypeScript 5.9 strict (`tsc --noEmit` before Vite) · Zustand 5 · React 19 (canvas wrapper only) · Tiled JSON · vite-plugin-pwa · Capacitor (Android + iOS shells wrapping the same `dist/`) · vitest. Art (from P1): Retro Diffusion (tiles/env) + PixelLab (characters), quantised to `assets/_meta/palette.gpl`.

## 2. Commands
```bash
corepack pnpm dev        # http://localhost:6174
corepack pnpm test       # vitest
corepack pnpm validate   # maps + content + platform boundary
corepack pnpm typecheck  # tsc --noEmit
corepack pnpm build      # validate → typecheck → vite build (+ PWA)
corepack pnpm art        # regenerate sprites, tiles, street map
corepack pnpm cap:sync   # build, then copy dist/ into android/ and ios/
corepack pnpm cap:android | cap:ios   # …and open the native project
```

## 3. Read order
**Resuming a session? Read `HANDOFF.md` first** — exact state, resume protocol, pipeline commands, browser-verification tricks.
Working docs (root, keep current): `ARCHITECTURE.md` → `TASKS.md` → `DECISIONS.md` (last rows) → `MEMORY.md` → `AUDIT_LOG.md`.
Design docs (`docs/design/`, settled — reference, never rewrite):
1. `bangalore_rpg_phased_build_plan.md` — the phase checklist + audit rule.
2. `bangalore_rpg_P1_P2_starting_slice.md` — exact recipe for P1 Style Lock + P2 Characters.
3. `bangalore_rpg_atomic_architecture_v1.md` — atoms→pages, 3 trees. ALL work follows this.
4. `bangalore_rpg_design_system_v1.md` — colour/UI/motion/audio tokens. No raw hex; reference tokens.
5. `bangalore_rpg_SCENE_TEMPLATE.md` + `bangalore_rpg_scene_examples.md` — the ONE recipe every scene follows.
6. `bangalore_rpg_story_script_v1.md` — the beats. Convert beats → scene components.
7. `bangalore_rpg_technical_architecture_v1.md` — WorldScene, schemas, migration §7.
8. `bangalore_rpg_mobile_platform_foundation_v1.md` — platform layer, mobile-ready rules, store checklist.
9. Systems: map_navigation, settings_and_saveload, game_components, player_profile_and_stats, infected_behaviour, act4_systems_and_cast, art_pipeline, art_audio_direction, landmarks_and_retention, engagement_guidelines, outbreak_origin, chapter_board_merge, city_pulse, lessons_from_zelter.
10. `bangalore_rpg_design_decisions_v1.md` (ADR-01..64) · `bangalore_rpg_unfinished_business.md` · `bangalore_rpg_founder_profile_and_vision.md` (how the creator thinks).
Repo history: `TECH_STACK.md` (rendering/library choices), `docs/asset-pipeline.md`, `CREDITS.md`.

## 4. Execution order
P0 foundations (P0.1 docs · P0.2 WorldScene refactor per tech §7 steps 1–4 — REBUILD Airport+Whitefield into data, KEEP Boot/Title/CharacterSelect · P0.3 extend validators · P0.4 Platform shell) → P1 Style Lock → P2 Characters → P3 M0 (airport→chai→bus) → P4 Hotel → P5 PG → P6 Phone → P7 Monday/office → P8 hill flat → P9 Cubbon/Ananya → Acts 2–4 (stubs; co-author with user). Audit gate between every phase, each with a mobile smoke test. After the web slice is public: M1 Android → M2 iOS.

## 5. Story is COMPONENTS, not a baked script
Every scene is an instance of `SCENE_TEMPLATE` → `src/data/scenes/<id>.json` + a Tiled map + quest/dialogue JSON. Acts 0–1 ship as worked examples; Acts 2–4 ship as STUBS completed with the user inside Claude Code. Copy the template, fill, validate, build — no engine changes.

## 6. When stuck
`docs/design/bangalore_rpg_risk_and_damage_control_v1.md` (risk register + fast triage). Prefer revert + smaller step over forcing a fix. Tests green before and after every change.

## 7. Before you start
Confirm you've read §0. Then take the first unchecked task in `TASKS.md`. When you reach P1, ASK THE USER for 6–9 Bangalore reference photos + any UI reference. Do not generate art before that.
