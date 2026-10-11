# NAMMA OUTBREAK — Unfinished Business
> Running list of parked items. Updated 2026-10-05.

## Remind me: next discussion
- User wants to share more of their own thinking about the game before we continue. Then: resume technical architecture walk-through (migration order §7 in `technical_architecture_v1.md`).

## Repo work not yet implemented
1. Build `WorldScene` (replaces AirportScene + WhitefieldScene) — migration steps 1–4
2. districts.json entries: airport, whitefield_street → fixes PGScene dead-end, makes Whitefield reachable
3. canAfford()/spend() sink via PhoneScene UPI
4. PhoneScene overlay (apps as JSON panels)
5. TimeSystem: BMTC 90s bus interval, hotel 3-night timer, office time-lapse
6. VehicleSystem: scooter fuel gauge, metro graph + lock states
7. CutsceneScene: Ravi flashback, Cordyceps ant, plate-banging
8. Act 4: ruined tint pass, barter.json swap, 4 crafting recipes, base relocation chain

## Milestone M0 (after WorldScene migration step 4)
- Airport → talk chai Anna → mission → spend ₹ → +social → unlock bus

## Story / design open decisions
- Add `pacing:` tags to every beat in story script
- Protagonist names (male / female variants)
- Game title (working: "Namma Outbreak")
- Starters B (bus) and C (train) — scope or cut
- Can the player get infected (on hit)? Can Ananya/Ravi/Amma?
- Confirm 3 endings: Evacuate / Hold the hill / Ground Zero (ADR-52)
- Confirm HAL → unnamed/fictional maker (ADR-51)
- Assign `infected_fate` to every named NPC (Deepa resolved: survives injured)
- Approve fall-order amendment: Hebbal + Malleswaram first (origin §4)
- Co-op: yes/no (async sharing already adopted, ADR-41; does "social" stat mean named NPCs or real players?)
- Monetization model (must obey ADR-43): premium / free + cosmetics / free demo + paid full?
- Playtest plan after vertical slice (5–8 small-town movers)
- Age rating (currently 16+ per ADR-08)
- Ravi family subplot resolution
- Dating-app subplot: exact beats and how far the ragebait goes
- Story v1.1: fully script Acts 2–4 scene by scene

## New specs to write
- Negotiation mini-system (offer/counter/walk, 3 temperaments)
- Delivery mission handler (timed, condition-obstacles)
- Identity signals implementation (ADR-21)

## ⚠️ Gate before visual work (ADR-30)
- When development reaches visual styling or UI (style lock, HUD, phone UI, menus), FIRST ask the user for reference screenshots/images. Do not ask before then.

## Pending user answers
- Player tracking for ads: confirm privacy-light/consented (affects rating/store policy)
- Build pitch website from NAMMA_OUTBREAK_pitch_deck_website.md (separate repo)
- Rerouting / fail-forward: yes/no on 6 suggestions (multi-route objectives, cost-then-reroute, Maps 'Rerouting…', NPC nudges, scars not dead ends, Act 4 deaths reroute)
- Trailer: original apocalypse-only vs honest slow-burn trailer (ADR-53)
- Freeze design pillars before first public release

## Up next — NEXT PHASE
- Development pipelines: how to create the game, the storyline, and modular situations (scene/mission templates)
- Notes intake from user boards: COMPLETE (2026-10-11)

## Up next (earlier)
- Visual styling: art & audio direction v1 written; more screenshots may follow
- User task: record Bangalore ambience on phone (Darshini, bus stand, Cubbon, rain, temple)

## From chapter board merge
- Rameshwaram Café → parody name? (ADR-47 proposed)
- Update story v1.1 with merged beats (cab/bus choice, lavish flat, rooftop, ride-app compare, Maggi-errand first encounter, 4a/4b)

## Art pipeline
- Run style-lock procedure (9 refs → style sheet → palette.gpl)
- First batch ≈70 assets for vertical slice

## Documents so far (all in /mnt/user-data/outputs/)
- bangalore_rpg_story_script_v1.md
- bangalore_rpg_game_components_v1.md
- bangalore_rpg_design_decisions_v1.md
- bangalore_rpg_art_pipeline_v1.md
- bangalore_rpg_technical_architecture_v1.md
- bangalore_rpg_unfinished_business.md (this file)
