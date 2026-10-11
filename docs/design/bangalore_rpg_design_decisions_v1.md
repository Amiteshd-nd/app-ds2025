# NAMMA OUTBREAK — Design Decisions Log v1.0
> Format: lightweight ADR (Architecture/Design Decision Record). One entry per non-obvious call. Add, never delete; supersede instead.

| # | Decision | Context | Reasoning | Risk / Mitigation |
|---|---|---|---|---|
| ADR-01 | Core loop = Challenge→Action→Feedback→Progress→Reward→Curiosity | Need a shared test for every feature | The "curiosity" step is what most indies drop; it is the retention engine for a slow-burn story | Risk: curiosity without payoff. Every breadcrumb must resolve by Act 3 |
| ADR-02 | Story and systems in separate docs | Solo/small team, AI-assisted | Industry norm: narrative bible vs systems/feature specs; each references the other | Drift. Each scene lists systems it uses; each system lists scenes |
| ADR-03 | Outbreak is an accident, not a villain | Avoid generic conspiracy plot | Human-scale guilt is more Bangalore and more affecting; Ravi as mirror of the player | Players may want a "bad guy." Give the system (unpaid internships, overwork) that role |
| ADR-04 | Virus that *mimics* Ophiocordyceps, agri-research origin | Cordyceps = The Last of Us / Girl With All the Gifts | Keeps the real-science hook (ant animation) while giving legal/creative distance; humble origin is plausible for a lab in Hebbal | Comparisons will happen anyway; lean into them in marketing |
| ADR-05 | Whitefield metro under construction at start; opens as a world event | Real Bangalore history | Early buses teach the city slowly; the opening becomes a felt reward and a map-expansion moment | Players who know the metro exists may be confused; a signboard explains |
| ADR-06 | Scooter is fuel-gated | Don't let a vehicle trivialise the map | Ability gating (Metroidvania): short hops by scooter, long hops force metro where challenges live | Fuel nagging. Tank is generous; petrol bunks are cheap and common |
| ADR-07 | Dating app subplot during pre-apocalypse | Controversy / discourse hook | "Ragebait"/controversy marketing: an illogical-feeling beat people argue about = free reach. Sits in Act 2 before anyone knows the stakes, so it is also honest characterisation | Tonal whiplash. Keep it short (one scene), consequences real (Ananya `strained`) |
| ADR-08 | Mature beat (one-night stand) = fade to black, optional | Realism, marketing | Keeps the game at a 16+/T rating in most regions; explicit content would move it to 18+ and block some storefronts and ad channels | Make it skippable; no achievements tied to it |
| ADR-09 | Hospital bed next to Ravi is caused by Ravi | Coincidence smell | He crashes into the player, asleep after a 20-hour shift; same ambulance | Still a contrivance; sell it with the Outer Ring Road night texture |
| ADR-10 | Waking to a *locked-down* city, not an empty one; plates at 5 PM trigger the first wave | 28 Days Later comparison | Indian COVID memory (Janata Curfew, thali-banging) is instantly recognisable and uniquely ours; turns a solidarity ritual into horror | Sensitive. Treat it with respect, not mockery; no real dates or leaders named |
| ADR-11 | Office interior never shown in Act 1 | Curiosity + cost | Saves an entire map; makes the eventual interior (Act 4 loot run) a reveal | Players may feel cheated; the stairs/window animation must be charming |
| ADR-12 | Money dies on screen via UPI "server busy" | Convey economy collapse without text | Diegetic feedback; sets up barter swap | None significant |
| ADR-13 | Act 4 reuses Act 0–3 maps with tint + prop pass | Solo budget | Zero new environments; emotional payoff from recognising places | Needs a clean tint/prop pipeline in the engine |
| ADR-14 | 4 crafting recipes, 1.5 enemy types, no combat system | Scope | Survival tension comes from noise and relocation, not fighting | May feel thin; add recipes only after playtest |

## Open Decisions
1. Protagonist names ×2 (m/f) · 2. Title · 3. Starters B/C scope · 4. Can the player get infected? · 5. Ending count · 6. Co-op · 7. Age rating target (drives ADR-08) · 8. Whether Ravi's family subplot resolves (his mother/sister) in Act 4

| ADR-15 | Profile (name/gender/age/hometown/college/degree) gates flavour, never content | Replayability without branching cost; avoids locking players out | Profile-locked quests |
| ADR-16 | One survival system, two tuning tables (gentle Acts 1–3, harsh Act 4) | Trains player early, pays off in outbreak; avoids survival-sim nagging during life-sim | Survival only in Act 4 (untrained player) / full sim throughout (fights story) |
| ADR-17 | Starting wallet ₹35,000 (was ₹12,000) | User call; PG deposit beat retuned to ₹10k+₹8k | — |
| ADR-18 | Five mission types as quest templates (help/investigate/collect/chase/combat-lite) | Infinite content from 5 handlers; from early whiteboard | Bespoke scripting per quest |
| ADR-19 | `stress` stat (sanity-lite) | Player feels Ravi's arc; feeds scooter wobble + breakdown | Health-only |
| ADR-20 | `stability` per district drives Act 4 collapse | One number replaces scripted fall order | Hand-scripted fall |
| ADR-21 | "Losing yourself" = visual identity signals driven by stress/social, inverted in Act 4 | Board's strongest idea, fits slow-burn, no new stat | Identity as a numeric points meter |
| ADR-22 | `social` + `deliver` mission types; one negotiation mini-system reused everywhere | Story already full of unlabelled negotiations; delivery teaches scooter/fuel/traffic and reuses in Act 4 | Scripting each negotiation |
| ADR-23 | Infected AI = two behaviour tiers (wanderer/cluster), noise-triggered | Reuses board's goon/gang behaviours without crime content | Many enemy types |
| ADR-24 | Emotional pacing curve (Calm→Curious→Engaged→Tense→Reward) tagged per beat, on top of the system core loop | Separates what systems do from what the player feels; prevents Tense-on-Tense fatigue | Loop only |
| ADR-25 | Lighting via Lights2D glow sprites + time-of-day multiply tint, baked blob shadows, no normal maps | Biggest visual lever, mobile-cheap; dead lamps become Act 4 gameplay | Dynamic shadows / normal-mapped tiles |
| ADR-26 | KEEP reputation (Hosa→Gothu→Namma) despite early board striking it | Payoffs already built on it: Kannada options, Darshini discount, Act 4 auto-driver rescue | Points/unlocks only |

## Working Agreement (2026-10-11, user)
- Everything is provisional, but every logic, decision and input the user gives is RECORDED here or in the salvage/unfinished files.
- If the user drifts from an earlier decision, Claude names the ADR and what was decided, and asks whether to supersede it. Claude holds itself to the same rule.
- Supersede, never silently overwrite: new ADR row "ADR-xx supersedes ADR-yy".
- Reaffirmed 2026-10-11: on any deviation during development, Claude reminds the user what was discussed (ADR + doc), and the user decides on the spot: earlier decision or new idea.
| ADR-27 | Visual + audio grading driven per district by `stability`, not act number | Slow burn visible on the map while travelling; one variable drives art/audio/NPCs/infected | Act-wide palette switch |
| ADR-28 | Infected sprites via 7-step automated recipe; animation +50% but movement slower (T1) | Zero new art; twitchy-but-escapable keeps combat light | Hand-drawn infected sheets |
| ADR-29 | Audio state machine (normal→drone→heartbeat→chase→relief) + uncanny reuse of Act 1–2 sounds; record real Bangalore ambience | Cheapest pacing lever; authenticity no library has | Generic horror library only |
| ADR-30 | Before ANY visual/UI work starts (Claude chat or Claude Code), STOP and ask the user for reference screenshots/images of the desired look; build UI from those | User owns the visual taste; prevents generic defaults and rework | Claude picking a look itself |
| ADR-31 | Infected = 4 stages (Fresh→Degraded→Evolved + Host near HIVR), packs of 1 lead + 2–4, night more dangerous | User board; packs teach caution | ADR-23 two tiers (SUPERSEDED) |
| ADR-32 | Sprint 1.5× walk / 0.9× run, wander 0.5×; running costs energy = stamina stat; escape valves (LOS 6 s, doors, UV, noise decoy) | Escapable but barely; gym/sports pay off | ADR-28 T1 0.6× (SUPERSEDED, anim +50% kept) |
| ADR-33 | UV lamps = safe zones, generator-fuelled; fungal-mimic virus is photophobic | In-world logic + reuses fuel system as base defence | Arbitrary safe zones |
| ADR-34 | Former named NPCs become infected in their own clothes; Namma-rep NPCs hesitate 1 s; never curable. Source zone = HIVR not IISc | Strongest emotional beat; rewards rep; avoids real-institution risk | Generic zombies / real institute |
| ADR-35 | Project Amrita: agri Cordyceps-mimic + Meera's secret human-regeneration pursuit; prefrontal dead / limbic alive | Board's science explains behaviour; keeps agri origin + no villain | Bioweapon / DRDO battlefield medicine (real org) |
| ADR-36 | Ravi causes breach (unsealed tray after Appa call); Vikram cuts hand → patient zero in Malleswaram PG, player's first week | Adopts board's patient zero, keeps locked Ravi beat; explains Ravi surviving | Ravi as patient zero / Vikram replacing Ravi |
| ADR-37 | Slow burn = long incubation + "acute viral encephalitis" cover-up; monsoon drains spread it during Act 3 (off-screen, ward TV) | Reconciles board's fast spread with months-long story; gives waterlogging infection risk a reason | Overnight warzone |
| ADR-38 | Personal links: player's employer builds HIVR sample-tracking software; Kavya (hill neighbour, lab assistant) | Board's "connections are personal"; makes investigate missions about the player's own world | Job interview with IISc client (player already employed) |
| ADR-39 | Mechanical discovery schedule: one new mechanic every ~20–30 min (24 mechanics mapped); phone apps unlock as taught | Retention via gradual reveal; cheap | All mechanics available from start |
| ADR-40 | No empty world: everyday Bangalore obstacles fill Acts 1–2; ≥1 interactable per ~10×10 screen | Open world needs challenges before zombies exist | Empty traversal space |
| ADR-41 | "People connect" = in-game social/rep + async shareable postcards/act cards (Web Share API); live co-op still open | Social motive + free marketing without servers | Real-time multiplayer now |
| ADR-42 | Retention psychology used only for fun: variable rewards/completion yes; no login punishment, no streaks, nothing tied to payment | Engagement without exploitation | Dark patterns |
| ADR-43 | Hard rules: no exploitative monetization, no manipulative timers, no grind, no pay-to-win | User's avoid list | — |
| ADR-44 | Office interior unlocks in Act 2 at Gothu rep; Act 4 return holds HIVR data clue | User board; keeps curiosity, adds late payoff | Office never shown |
| ADR-45 | Act 4 economy: 4a inflation (UPI alive, prices × daily multiplier, WFH pings, market crash) → 4b UPI dies → barter | Felt collapse; keeps locked UPI death | Instant barter |
| ADR-46 | Crouch-walk stealth (0.5× speed, −2 tile detection, 0 noise); crafting includes UV flashlight + smoke bomb | User board; more escape valves, light combat | Combat-only |
| ADR-47 (proposed) | Rename real brand "Rameshwaram Café" → parody | Licence hygiene | Real name |
Note: "Kavya" (ADR-38) renamed **Deepa** per user's earlier board; Deepa survives injured (medicine-run beat).
| ADR-48 | Real-time melee stuns only (2 s); Pulse Gun (late, 20 charges) is the only kill | User board (Buu's Fury style); keeps tension | ADR-14 shove+run only (SUPERSEDED) |
| ADR-49 | Infected/detection numbers from user board (idle 0.4×, growl 0.5 s, chase 8 s→search 3 s, zone-boundary stop; crouch 2/walk 5/run 8/fight 12 tiles; run 1.6×) | User's original numbers | ADR-31/32 values (SUPERSEDED where different) |
| ADR-50 | Random encounters: per-tile `encounter_rate` every 8 steps, ambush only from `cover` objects, flash + 0.5 s slow-mo instead of freeze, crouch halves | Pokémon feel without breaking stealth/fairness | Spawn-anywhere + full freeze |
| ADR-51 (proposed) | Pulse Gun built at checkpoint, no real PSU (HAL) named; real stores parodied (Reliance Digital → "Reliable Digital") | Licence/legal hygiene | Real names |
| ADR-52 (proposed) | Three endings: Evacuate / Hold the hill / Ground Zero | Board character arcs converge naturally | Single ending |
Names: Priya = fight-back ally (user's); dating match → Tanvi; Kumar = auto driver; Raju = hill chai wallah; Suresh = hill landlord; Major Rathore = checkpoint; Meera Krishnamurthy aged 45.
| ADR-53 (proposed) | Trailer/store show only shipped features, captured in-engine; trailer honest about slow-burn structure | Zelter's misleading-trailer backlash; avoids reverse bait-and-switch | Apocalypse-only trailer |
| ADR-54 | Anti-Zelter balance rules: crafting ≤3 s, no instant base loss (1–2 day warning), no bullet sponges; no public release before fun playtests; pillars freeze at launch, changes additive | User's Zelter lessons | — |
| ADR-55 | City Pulse "blur-the-line": real events by shape only, no real name/person/victim/political side; human-approved, kill-switchable | X-factor + avoids defamation/political risk | Literal real events |
| ADR-56 | Sponsors = cosmetic labelled banners by player heatmap, no gameplay effect, decay in Act 4; tracking privacy-light/consented/aggregate | Revenue respecting ADR-43 | Pay-to-win / intrusive ads |
| ADR-57 | Separate pitch/scaling website (not in-game) to present design decisions | User presentation need | — |
| ADR-58 | Story = scene components (one SCENE_TEMPLATE); Acts 0–1 worked, Acts 2–4 stubs co-authored in Claude Code | Finish execution scaffolding now; customise story later without confusing the build | Baked story in code |
| ADR-59 | CLAUDE.md is the driver file read first; Claude Code (not the chat assistant) requests reference photos at P1 | Single source of truth; references belong with the builder | Chat pre-collecting assets |
| ADR-60 | Nested atomic architecture (atom→molecule→organism→template→page) across Data/Art/Systems; single source of truth, reference-by-id, `_index.json` + validator enforce | Principal-eng scalability; one edit propagates; new city = swap atom/organism layer | Ad-hoc files / inline values |
| ADR-61 | Design system of named tokens (colour/grid/type/UI/motion/audio); no raw hex/strings inline | Consistent look, cheap global change | Per-scene styling |
| ADR-62 | Map = pockets (~100m, often semicircle) anchored to metro nodes, real Google road traces (not shipped tiles); one data source → playable world + phone Maps + GTA minimap; built per-pocket, phased | Authentic, intimate, scalable; reroute lives here | Fully open city / stylised node map |
| ADR-63 | Standard settings (audio/display/gameplay inc. DND + Relaxed difficulty/controls/accessibility/data) + Save-Load (3 slots + autosave, versioned migrations, IndexedDB+lz-string, export/import) | Industry-standard expectations; migrations = anti-Zelter | Minimal/no settings |
| ADR-64 | One codebase, three platforms: web (PWA) first, then Android, then iOS, via Capacitor wrapping the same `dist/`; all device APIs behind `src/platform/`; mobile-ready rules from P0; native saves on Filesystem not IndexedDB; mobile smoke test at every gate; store releases M1/M2 only after web slice is public | Solving touch/notch/audio/storage/perf once while building is far cheaper than retrofitting; no second codebase | Native rewrite (Swift/Kotlin), React Native, Flutter, Unity port; TWA (Android-only); mobile deferred entirely |
