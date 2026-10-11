# NAMMA OUTBREAK — Phased Build Plan (master checklist) v1.0
> How we build: **screen by screen, audit after each phase.** Nothing proceeds until the user approves the current phase. Each audit updates `AUDIT_LOG` so Claude's style improves as we go.
> Foundations already designed (do NOT redo): story_script_v1, game_components_v1, player_profile_and_stats_v1, technical_architecture_v1, art_pipeline_v1, art_audio_direction_v1, infected_behaviour_v1, outbreak_origin_v1, act4_systems_and_cast_v1, landmarks_and_retention_v1, engagement_guidelines_v1, city_pulse_v1, chapter_board_merge_v1, lessons_from_zelter, project_docs_convention. Decisions: design_decisions_v1 (ADR-01..57).

## The rule of each phase
1. Claude (or Claude Code) builds ONE screen/slice.
2. User audits: look & feel, correctness, style.
3. Claude records corrections in `AUDIT_LOG.md` as reusable style rules.
4. Only then move to the next phase.

## Pre-work (Claude Code, once) — foundations are laid; only improve if needed
- P0.1 Adopt the 5 repo docs (CLAUDE/ARCHITECTURE/TASKS/DECISIONS/MEMORY) per project_docs_convention.
- P0.2 Refactor to `WorldScene` (technical §7 steps 1–4). KEEP: BootScene, TitleScene, CharacterSelectScene (will be trimmed in P2). REBUILD: AirportScene+WhitefieldScene → data. Only rebuild pre-built code where current decisions require it.
- P0.3 Extend map-validator (reachability, door 32×48, City Pulse slot checks).
- P0.4 Platform shell: `src/platform/` interface + Capacitor init; empty game boots on web + Android emulator + iOS simulator from one `dist/` (mobile_platform_foundation §6).
- ⚠️ Before ANY visual/UI work in P0–P2: ask user for reference screenshots (ADR-30).

## Phases (each = one audit gate)
- **P1 — Style Lock.** Generate ONE approved street/scene reference (Zelter angle) + 48-colour palette from user's Bangalore photos. Nothing else until user says "that's the look." (art_pipeline §2)
- **P2 — Character Creation + Select.** The form (name/gender/age/hometown/college/degree) → age+gender assigns sprite. 2 player sprites (M/F, young adult) with 5 skin tones, 4-dir walk + idle. THIS FILE details P1+P2.
- **P3 — M0 Minimal Loop.** Airport slice: spawn → chai Anna (interact/dialogue/UPI) → find Vayu Vajra stop → bus transit card. Proves WorldScene + interaction + quest + spend + exit end-to-end.
- **P4 — Scene 0.2 Hotel (3-night timer).**
- **P5 — Scene 0.3 PG Hunt (negotiation mini-system).**
- **P6 — Phone overlay (Maps, Chats, UPI first) + minimap + Settings + Save/Load.** See map_navigation + settings_and_saveload docs.
- **P7 — Scene 1.1 Monday + office gate; 1.3 "doesn't suit".**
- **P8 — Scene 1.4 Ambedkar Nagar (signal meter, furnish, sleep=heal).**
- **P9 — Scene 1.6 Cubbon Park + Ananya + City Moments camera.**
- ... (Acts 2–4 phased later; see unfinished_business)
- **Every gate:** mobile smoke test (low-end Android + iOS simulator), pass/fail into AUDIT_LOG.
- **M1 — Android release** (after web slice is fun & public) · **M2 — iOS release** (after M1 stable) · **M3 — push/IAP/cloud save** (separate ADRs).

## What NOT to do
- No building 5 scenes ahead of an audit.
- No touching settled design docs.
- No live-generated art in front of the player (City Pulse is pre-approved bundles).

## Audit log
See `AUDIT_LOG.md` (created, empty) — Claude appends a dated, reusable rule after each phase.
