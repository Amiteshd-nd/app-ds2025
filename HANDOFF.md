# HANDOFF — resume here (read right after CLAUDE.md)
Updated: 2026-10-18 (after the Act 4 polish ADR-161, the audits #1–34, and merging the bus chat's ADR-160/162).

## 0. Where we are — in one breath
Bangalore Times (working title in the docs: NAMMA OUTBREAK). **The whole game is built and playable end to end:** Acts 0–3 (22 scenes) + all of Act 4 (4.0 Janata → 4.6 The Tunnel, 10 more scenes) — from the airport (0.1) to three endings and the "My Bangalore" end card. `corepack pnpm movie --twice` plays **all 32 scenes headless: 32/32 green, identical 777-step trace** (~45 min wall time for both runs). 706 tests, validate, typecheck and build all green. **The user's infected spec is complete** (ADR-159: twitch frames, seeded asymmetry, photophobia path costs, the Host — 48×64, Playground bench only).
- **Git:** `main` pushed to origin on 2026-10-18 ("approved, push") — everything through the merge of the two chats' work and the audit records. From here, local commits again wait for "approved, push".
- **Audit status:** everything approved — P0–P11 long ago; #1–34, 13a and #35–36 approved as built on 2026-10-18. Nothing waits for an audit.

## 1. The very next step
**Everything is on `main`** (merged 2026-10-18): ADR-159, the bus chat's ADR-160/162 (commit 0dd6693, committed ahead of its audit at the user's request), and the polish branch (ADR-161 + the approvals of #1–34). Nothing is pushed.

The question to ask:
> Everything is built, approved and pushed. What next? Only the user's items remain: touch-button references, audio recordings (§5.4) / Freesound downloads, where the Host lives in the story, T-039 real places, T-018 mobile toolchains (then the mobile smoke tests), the unfinished-business doc.

Default if "take the defaults" / "proceed": nothing big is left in the plan's polish list; the remaining items need the user (touch-button references, audio recordings, where the Host lives, T-039 real places, T-018 mobile toolchains). Ask rather than invent work.

### Act 4 as built (ADR-144 … ADR-158; scenes in `src/data/scenes/act4_*.json`)
| Seq | Scene | ADR | NEED_TO_AUDIT |
|---|---|---|---|
| — | Plan + S1 dial, S2 run, infected steps 1–2, S3 base, S4 hands | 144–147, 149, 151 | #16–21, 23, 25 |
| 4.0/4.1 | `act4_janata`, `act4_five_oclock` | 148 | #22 |
| 4.2 | `act4_the_hill` | 150 | #24 |
| 4.3 | `act4_hill_days` (B1: the hill, Deepa, Ward 4) | 152 | #26 |
| 4.3b | `act4_cafe` (B2: Kumar, Uncle's tiffin room, the office, Raju) | 153 | #27 |
| 4.3c | `act4_cubbon` (B3: Rathore, Priya, runs 1–4, the fire) | 154 | #28 |
| 4.3d | `act4_palace` (B4: Sathish, the Pulse Gun, Malleswaram, Vikram) | 155 | #29 |
| 4.3e | `act4_lalbagh` (B5: the glass house, the round table → `path_*`) | 156 | #30 |
| 4.5 | `act4_ravi` (HIVR with Meera / Yelahanka with his mother) | 157 | #31 |
| 4.6 | `act4_tunnel` (the Purple Line, 3 ending cards, `MyBangaloreScene`) | 158 | #32 |
| — | Infected spec steps 3–6 (twitches, asymmetry, photophobia, the Host) | 159 | #33 |
| — | Polish: glows through the drain, Pulse meter, fall frames, the Cubbon camp | 161 | #34 |
| — | Bus boarding: the 500-D (ADR-160), every bus (ADR-162) — the other chat's | 160, 162 | #35–36 |
`act4_base_chain` (seq 4.3z) stays as the chain's design STUB/record. There is no 4.4.

## 2. Resume protocol
1. Read `CLAUDE.md` §0, this file, `NEED_TO_AUDIT.md` (#16–32 are this session's), the last rows of `DECISIONS.md` (ADR-144 … 158; each opens with a plain-English "For you"), the 2026-10-17/18 entries at the end of `AUDIT_LOG.md`, `TASKS.md` (T-066 … T-081), `ARCHITECTURE.md` (the Act 4 sections at the end), `docs/act4_systems_plan_v1.md`.
2. `git status` → clean, 17 ahead of origin. Optionally `node scripts/movie.mjs --scene act4_janata` (Act 4 only, ~15 min) or `corepack pnpm movie --twice` in the background (~45 min) — **touch no repo files while it runs** (a Vite reload kills it).
3. **How this user works** (auto-memory `amitesh-working-style`): one phase at a time, stop for audit; "take the defaults" = build every default of the stub; audits are deferred into `NEED_TO_AUDIT.md`; final messages in plain English, ending with the next step as a question plus the calls to confirm.
4. **Every build's checklist** (what this session did each time): data + art → `corepack pnpm validate` → tests (fix the pinned ones: dialogue registry list, playground built list, act4_run's list of places with infected, phone Maps pins) → new `src/__tests__/<scene>.test.ts` → `node --experimental-strip-types scripts/generate-walkthroughs.ts <scene>` → `node scripts/movie.mjs --scene <scene>` → a browser look (planner reachability with everyone present + a snapshot) → records (DECISIONS row, NEED_TO_AUDIT item, TASKS row, AUDIT_LOG entry, ARCHITECTURE section, art provenance in `_raw/*/README.md`, this file, auto-memory) → `pnpm build` + `pnpm movie --twice` in the background → local commit.

## 3. Build recipe (every scene)
Draft (`src/data/scenes/<id>.json`, `status: "STUB"`, a `draft` note with sources, beats with defaults, `open_questions`) → user answers → art (§5) → `_raw` + spec → import (map / props / sheet) → data (districts, NPCs, dialogue, quest, phone, cards, scene JSON with `status: "P<n>"`, `decided`, `open_questions: []`) → `corepack pnpm validate` → tests (`src/__tests__/act<n>_*.test.ts`; update the list tests: `dialogue.test.ts` registry, `playground.test.ts` built list, `movie.test.ts` stub check → the next stub, `phone.test.ts` pins) → `node scripts/generate-walkthroughs.ts` (revert files whose only diff is the "generated" date line) → `node scripts/movie.mjs --scene <id>` → fix the game or the data, never `set_flag` → browser-pane look (§6), **reached the way a player reaches it** → `pnpm movie --twice` in the background → ADR + AUDIT_LOG ("built, awaiting audit" + calls to confirm + found on the way + rule going forward) + TASKS + ARCHITECTURE + MEMORY + `NEED_TO_AUDIT.md` row + this file → commit locally → stop and report.

## 4. What exists (older systems: ARCHITECTURE.md)
- **Act 4 (ADR-144…158; full map in ARCHITECTURE.md's Act 4 sections):** `systems/` stability + `stabilityNow` (grade by Act 4 day), energy, playerState, infected (`think`: wander/alert/chase/search/recover/stunned + lures; Evolved tier), harm, encounters, combat (`combat.json`: weapons, throws, the Pulse Gun, 8-slot bag), trade (recipes, barter, loot, base stock), bag (`bag:` conversation), myBangalore; behaviours `stabilityLook`, `act4Threat`, `act4Hands`, `act4Base` (core), `clockEvents`; districts' `base`, `act4Zones`, `infected.packs`, `uv`; cards `end: 'credits'` → `MyBangaloreScene`. Playground: Act 4 · stability dial (benches: the run, armed, bare hands, the Pulse Gun, the base).
- **Acts 0–3:** 21 districts (Act 3 added `ward4`, `hivr_corridor`). Cards: `card_act3_title`, `card_orr_night` (→ `ward4`), `card_corridor_in` (→ `hivr_corridor`), `card_corridor_out` (→ `ward4` at 18:30), `card_leaving_ward` (holds).
- **Engine added in Act 3:** `CardScene` + `systems/cards.ts` (panels text/title/cut/fragment, `ifFlag`/`unlessFlag`, `setFlags`/`clearFlags`, `still`, `cue`; sequence `clockAt`, `end: hold`, `then: {district, spawn, minute, nextDay}`; started by trigger `action: "card"`, sleepEvent `card`, dialogue effect `card`) · district `walkSpeed`, `playerSheet`, `hud: "minimal"` (+ `WorldScene.allowsOverlays`, kept apart from `canOpenOverlay`, which Movie Mode reads as "the player is free"), `nightTint`, `countdown` (+ behaviour; `until`), `signalIf`, `stabilityIf`, `audioSources` · objects `exact` · app `noticeIf` · dialogue effects `card`, `cue` · `*_bed` still character sheets · stills via `import-backdrop` `still: true` · NPC `voice` · people with `unlessFlag` leave overnight.
- **Audio (ADR-139…141, `docs/audio_plan_v1.md`):** `src/audio/` — AudioSystem (the ONLY code touching Phaser sound; lint test), pure `mix.ts` (time of day, stability bands, ADR-29 state machine + pacing tags, heartbeat by infected distance, `streetSurface`, `sourceScale`), `buses.ts`, `voices.ts`, `cue.ts`; `systems/noise.ts`; data `data/audio/{manifest,beds}.json` + `synth/*.json` + `songs/*.json` (224 tokens: 60 real Kenney CC0 files, the rest original placeholders); `pnpm audio` (`scripts/audio-pipe.mjs`, `scripts/audio/synth.mjs`, `scripts/audio/decode-browser.mjs` — compressed audio decoded in headless Chromium; **ffmpeg is NOT installed, and we don't install it**); `src/assets/audio/LICENSES.md`; footstep surfaces (spec `surfaces`, street tiles); the Playground **Audio** node (every token ▶, bus meters + solo, the live mix, the Act 4 test bench) + the `audio` map overlay. Next audio batches wait for the user: the 20 recordings (`audio_plan_v1.md` §5.4), Freesound CC0 downloads (§5.3), optional ffmpeg (they install) for OGG/M4A.
- **Movie Mode** (`src/playground/movie/`, `scripts/movie.mjs`, generator `scripts/generate-walkthroughs.ts`): steps wait_for · goto · interact · choose · advance · wait · phone · sleep · rhythm · travel · pay · expect · set_flag · unresolved. The generator follows cards (triggers, sleep events, conversations), landings and METRO hops, and tracks the game minute.

## 5. Pipelines
- `corepack pnpm dev` :6174 · `playground` :6175 (another chat's server may already serve it — `preview_start` reuses it) · `mocks` :6176 · `movie` :6177 · `validate` · `typecheck` · `test` (693) · `build` · `art` · `audio`.
- Art: Figma MCP `generate_image` (model `gpt-image-2.5-sunburst`, fileKey `GlPqDksxrmJtftFFo6CJNl`, the user's personal plan; ≤3 rerolls — everything this session was first try) → `download_assets` → curl `rawImages[0].url` → `_raw/{maps,characters,props,backdrops}` → `node scripts/import-map.mjs <spec>` / props via `SHEETS` in `scripts/import-props.mjs` then `importProps()` (re-lay or repaint a raw if objects cross the cell split or a divider line shows) / `node scripts/import-sheet.mjs <raw> <name>` + a `breath.json` entry / `node scripts/import-backdrop.mjs`. Prompt rules: interiors "walls as flat bands", "no ceiling fan, nothing hanging from the ceiling", "fill edge to edge"; exteriors "orthographic, no perspective, no isometric"; **scale a room by its door (≈32 px)**: 12×8 from 1536×1024. A provenance row in each `_raw/*/README.md`.
- Licences: MIT/Apache/CC0 only — **check a package's own dependencies** (`@wasm-audio-decoders/ogg-vorbis` was rejected for its LGPL `codec-parser`). Audio: CC0 / the user's recordings / original only. Map data: OSM only.

## 6. Verifying in the browser pane
- Start a scene by script: `window.__nqStore.getState()` (setFlag, setCounter, setClock), then `__nqGame.scene.getScene('TitleScene').scene.start('WorldScene', { districtId, spawnId })`. Handles: `__nqGame`, `__nqStore`, `__nqAudio` (inspect, sourcesView, setDebug), `__nqDev` (Playground: loadNode, setOverlay), `__nqMovie`. WorldScene: `playCard(id)`, `sleep()`, `tryInteract()`, `pointOf(name)`, `surfaceAt(x, y)`.
- **After editing a source/data file while the dev server runs, restart it** (`preview_stop` + `preview_start`): Vite's hot reload can start a second game instance ("Texture key already in use", a red placeholder on black) or serve a stale module. Editing a Playground file reloads the Playground page (any open map is gone).
- Synthetic `KeyboardEvent`s don't reach Phaser while the pane's RAF is paused — use real `computer` clicks, or call methods. Audio needs one real click to unlock; verify audio by `__nqAudio.inspect()` and by wrapping `game.sound.add` to log keys (the pane can't be heard).
- Snapshots: `g.renderer.snapshot(cb)` → crop on a canvas → `'#'.repeat(150000) + dataURL` → decode the tool-results file with a small Python script. Judge tints by pixel values.

## 7. Open items the user owns
**Decided 2026-10-23 (ADR-163…167):** free + cosmetics + labelled sponsor spots (free-text hall chat paid later); the town hall (random ~50-player halls, preset phrases, act cards; no live co-op); 16+; no tracking at launch; playtest 5–8 small-town movers before release; honest slow-burn trailer; pillars frozen at release; pitch site after playtests. Next tasks: T-083 playtest kit, T-084 monetization plan, T-085 town hall plan, T-086 trailer.
The audits: `NEED_TO_AUDIT.md` #1–32 (each with calls to confirm). The infected spec's remaining steps (and the Host's size). Touch-button references. Audio homework: recordings, Freesound downloads. T-039 real places for the airport kerb and hotel street. T-018 mobile toolchains (mobile smoke tests blocked). The unfinished-business doc (names, co-op, monetization). The Purple Line reads blue-violet in world art.

## 8. Debt not to forget
Act 4: fall frames are derived squashes; the Host has no action poses and sits on the bench only; the Evolved's eye glow is still unbuilt (the glow registry is ready for it); voice note is text; endings are cards; "My Bangalore" is text (no collage, no PG count); runs reuse earlier maps (no telecom tower, no HIVR outer campus); no Evolved placed in any story scene yet; the tunnel's red lights drained by the ground-zero grade. Act 3: scooter EMI/fuel after the crash; the HIVR day costs nothing; the ward boy is text. Audio placeholders. Older: T-027, T-021, T-015, T-040–T-042, T-051. Movie Mode: no scooter RIDE step; the bot plays one path (sits with Ravi, likes Tanvi, "We get out." at the table, backs Karthik at the fire) — other paths are covered by tests.

## 9. Rules learned the hard way (also in MEMORY.md / AUDIT_LOG)
- A trigger whose `requiresFlag` is unset still counts the entry: a zone that becomes live while the player stands in it never fires — keep such zones away from where the player waits.
- Dialogue node ids collide silently when added by script — check `nodes[id]` is free.
- A behaviour's first `ui:*` message at attach time is lost (the HUD launches after behaviours) — defer one tick.
- `canOpenOverlay()` means "the player is free" to Movie Mode — never put a place rule in it.
- macOS filenames ignore case: the audio pipeline deletes stale renders before writing.
- District entry fires inside `WorldScene.create` (the scene is not "active" yet) — read it via `game.scene.getScene`.
- Movie Mode: plan on a 2 px grid with the real feet box; live world-taking zones are hard walls unless they are the target; stuck → sidestep → wait → replan (×10); the generator resolves flags by trigger → rhythm → Jodi → sleep timers / sleepEvents → phone → conversations → other districts (exits + METRO), and follows cards and landings.
- **Act 4 interiors:** size the map by who stands in it; check every person and zone is reachable *with everyone present* (`__nqMovie.driver.route('npc:…' | 'zone:…')` in the pane). A body in a table gap seals a room (the café, the glass house). Close-up renders import small (Yelahanka 7×5), big rooms large (glass house 16×11).
- **Movie bot in Act 4:** its full stick runs, and a run's noise wakes still packs — the generator emits `pace: 'walk'` wherever every live pack is `startMode: idle`; a flee counts as stuck when the feet stop moving.
- **Branching on an earlier choice:** the solo prereq sets every `save_flags` entry, so make the bot's earlier path an explicit (optional) objective so the full run and a solo start agree (2.5 now sits with Ravi).
- **Revisited places in Act 4:** give every earlier NPC/trigger an `unlessFlag` (lists are allowed: `[…, 'act4']`), packs `unlessFlag`, `failCardUntil`, `walkSpeedUnless`, `ownSelfAfter` — check them all, not only the ones you touch.
- **Scene JSON ships in the game bundle:** no dev words in it ("Movie Mode" fails the dist check). A spawn named `door_*` is a door to the map validator (32×48). The UI font has no emoji.
- **Pacing (ADR-24):** two Tense beats need a Calm between them (the validator checks).
- Long council/dialogue chains: the bot's `choose` has a 10 s budget to drain lines — keep chains to two lines before a choice.
- **Two chats, one folder:** another session may edit this repo while you work (a Vite reload kills a movie run). Before a commit, compare `git status` with what you changed; commit only your hunks (`git apply --cached`), and run the movie in a clean worktree under `scripts/.work/` (gitignored, `node_modules` symlinked).
