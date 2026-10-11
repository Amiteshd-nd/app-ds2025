# Project Docs Convention — how to write the files Claude reads
> Purpose: a small, fixed set of markdown files at repo root so any Claude session (chat, Claude Code, voice) can orient in under a minute. Keep them short; link out to the design docs for detail.

## 0. The set (filenames are fixed)
| File | One-line job | Who writes | Size cap |
|---|---|---|---|
| `CLAUDE.md` | Entry point. Stack, commands, rules, pointers to the other four. Claude Code reads this automatically. | human + Claude | 60 lines |
| `ARCHITECTURE.md` | How the code is shaped *right now*. Not plans. | Claude after each refactor | 150 lines |
| `TASKS.md` | What's next, in order. One checkbox per task. | both, every session | 80 lines |
| `DECISIONS.md` | ADR log. Why things are the way they are. Append-only. | Claude when a decision is made | unbounded, newest at bottom |
| `MEMORY.md` | Facts about the project/user that don't fit elsewhere. Preferences, gotchas, "don't do X again". | Claude at end of session | 60 lines |
Design docs (story, components, art pipeline, technical) live in `docs/` and are referenced, never duplicated.

## 1. Rules that apply to all five
1. **Present tense, concrete.** "WorldScene reads districts.json" not "we plan to…". Plans go in TASKS.
2. **No prose where a table or list works.** Claude scans; it doesn't read.
3. **Every file starts with a 1-line purpose and `Updated: YYYY-MM-DD`.**
4. **Reference, don't copy.** Link `docs/technical_architecture_v1.md#7` rather than restating.
5. **When in doubt, which file?** Code shape → ARCHITECTURE. What to do → TASKS. Why → DECISIONS. Everything else about *how to work with you* → MEMORY. Commands/rules → CLAUDE.md.
6. **End-of-session ritual** (Claude does this unprompted): tick TASKS, add new tasks, append any DECISION, update MEMORY, bump ARCHITECTURE only if code shape changed.

## 2. Templates

### CLAUDE.md
```md
# <Project> — Claude entry point
Updated: YYYY-MM-DD
## Stack
Phaser 3.90 · TS 5.9 strict · Vite · Zustand 5 · React 19 (canvas wrapper only) · Tiled JSON · vite-plugin-pwa
## Commands
`npm run dev` · `npm test` (117 tests) · `npm run build` (runs tsc --noEmit first) · `npm run validate:maps`
## Hard rules
- Tiles 32×32, characters 32×48. Validator fails the build otherwise.
- No new Scene classes for places. Places are districts.json entries. (DECISIONS ADR-15)
- No GPL runtime deps. CC0/MIT/Apache only.
- Never hardcode layer names; read maps.manifest.json layerOrder.
- Before starting ANY visual/UI work, ask the user for reference screenshots first. (ADR-30)
- Drift guard: if a request deviates from a logged decision or the story docs, STOP, quote the ADR/doc and what was decided, and ask the user to choose: keep the earlier decision or supersede it with the new idea. Never silently follow either. (Working Agreement)
## Read next
ARCHITECTURE.md → TASKS.md → DECISIONS.md → MEMORY.md · design in docs/
```

### ARCHITECTURE.md
```md
# Architecture (current state)
Updated: YYYY-MM-DD
## Scenes
| Scene | Role | Lines | Status |
## Data flow
glob → JSON loaders → systems (Quest, Reputation, Save, Time, Vehicle) → Zustand store → scenes
## Folder map
(tree, 15 lines max)
## Known debt
- AirportScene/WhitefieldScene duplicate create(); PGScene referenced but absent.
```

### TASKS.md
```md
# Tasks
Updated: YYYY-MM-DD
## Now (this session)
- [ ] T-001 Create WorldScene from WhitefieldScene.create(); layers from layerOrder
## Next
- [ ] T-002 Populate.npcs / Exits.bind from AirportScene
## Later
- [ ] T-010 PhoneScene overlay
## Done
- [x] T-000 Story v1, components, decisions, art pipeline, technical docs (2026-10-05)
```
Task ID format `T-###`, never reuse. One line each; detail lives in docs/.

### DECISIONS.md
```md
# Decisions (ADR log, append-only)
| ID | Date | Decision | Why | Rejected alternative |
|---|---|---|---|---|
| ADR-15 | 2026-10-05 | One WorldScene, places as data | 2 duplicated scene classes, PGScene dead-end | Third hand-written PGScene |
```
Supersede, don't delete: add a new row "ADR-20 supersedes ADR-12".

### MEMORY.md
```md
# Memory
Updated: YYYY-MM-DD
## About the user
- Solo/small team, PWA-first, voice sessions common → keep answers short, files do the heavy lifting.
- Wants "think like a game designer"; dislikes being asked questions they've already answered.
## Working agreements
- Every system must name which core-loop step it serves (Challenge→Action→Feedback→Progress→Reward→Curiosity).
- Free-commercial-licence tools only.
## Gotchas
- bash_tool unavailable in voice; write files via Python.
- Transcripts of past sessions: /mnt/transcripts/
## Parked (see docs/unfinished_business.md)
```

## 3. Session-start prompt (paste to Claude Code)
> Read CLAUDE.md, then ARCHITECTURE.md, TASKS.md "Now" section, last 5 rows of DECISIONS.md, and MEMORY.md. Summarise in 5 lines, then start T-### .
