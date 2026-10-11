# NAMMA OUTBREAK — Chapter Board Merge v1.0 (2026-10-11)
> Source: user's early chapter boards (Ch 1–2 flow + outbreak arcs). **Locked flow in story_script_v1 is NOT overwritten.** Below: what's adopted, where it slots, and what conflicts (flagged, not changed).

## A. Ch 1–2 board → our Acts 0–2
| Board beat | Our slot | Adopt |
|---|---|---|
| Land at Kempegowda Intl Airport | 0.1 | ✅ already |
| **Choose commute: cab or bus** | 0.1 exit | ✅ **player choice**: Vayu Vajra bus (cheap, 90 s wait, HIVR flyover glimpse) **or** cab (fast, pricier). Both converge at Whitefield. Bus remains default/recommended. |
| Ask cab driver to switch on AC → "extra ₹100" | 0.1 cab branch | ✅ micro-negotiation (first use of offer/counter/walk, ADR-22). Decline = sweaty arrival, −5 health cosmetic line |
| Amma calls during the ride, emotional exchange | 0.1 ride (either transport) | ✅ first Amma call moved here (end-of-Act-1 call stays too). Sets the "losing yourself" baseline (ADR-21) |
| Road from airport, countryside background | 0.1 ride | ✅ parallax already planned; add fields, Nandi Hills outline |
| Reaching Whitefield — Kadugodi tree park, metro (under construction) | 0.2 arrival | ✅ environment: Kadugodi Tree Park edge, metro barricades |
| Stay in a PG (Prashanth extension area), choose 1 of 3 | 0.3 | ✅ **locality name "Prashanth Layout"** for the PG lane. Hotel-first (locked) stays. 3 PGs stay; **no community labels** (user's earlier rule, overrides board's Malayalam/Tamil/Telugu) |
| PG reception, stairs/lift, PG room | 0.3 envs | ✅ add to map list |
| Next day: visit office — gate + small campus only | 1.1 | ✅ already (hidden office, ADR-11) |
| **Office interior accessible later, after a level** | — | ✅ NEW (ADR-44): interior unlocks in Act 2 at reputation **Gothu** with colleagues; Act 4 return = infected colleagues, server room with the **HIVR sample-tracking data** (ADR-38 clue payoff) |
| Go for food, discover street nuances | 1.1–1.3 | ✅ Darshini, chai, street food — ties food meter |
| PG mess doesn't suit → house hunt | 1.3 | ✅ already ("doesn't suit") |
| House hunting, dialogues with owners | 1.4 | ✅ 2–3 owners via negotiation system |
| **Couldn't afford the lavish flat → old apartment** | 1.4 | ✅ NEW beat: view a gated-society flat first (rent out of reach) → settle for the hill room. The lavish flat becomes a **visible aspirational reward** (§engagement: rewards visible) and an Act 4 gated-fortress location |
| Get key, enter empty flat | 1.4 | ✅ already |
| Furniture needed to sleep/restore health; buy mattress, table, chair (+ induction, water) | 1.4 | ✅ matches; sleep restores health (stats §3). Add **water can** |
| **Emotional breakdown at rooftop** | 2.3 | ✅ Ravi's 1 AM breakdown (locked) is now **staged on the player's hill-flat rooftop**. Rooftop also a **stress-relief spot** for the player (view of skyline + Nandi Hills) |
| Commute to Cubbon Park | 1.5 | ✅ already (bus) |
| **Compare multiple ride apps for lowest fare / or wait for bus** | 1.5 | ✅ NEW mini-game: 3 parody ride apps (surge, ETA, cancellations) vs bus. Teaches money vs time. Brands parodied |
| Navigating potholes | 1.5+, scooter Act 2 | ✅ pothole tiles: walk = trip chance in rain, scooter = speed drop + fuel cost; waterlogged potholes hide depth |
Environments added to art backlog: airport exterior gate→taxi, airport road/countryside, Kadugodi Tree Park, PG reception/stairs/room, office gate+campus, bus stops, metro stations, hilltop map, empty flat, rooftop, gated-society flat.

## B. Outbreak board → our Act 4
### B1. First encounter (merged into 4.0)
Locked: wake in hospital → lockdown → **5 PM plate-banging triggers first wave** (ADR-10).
**Merged sequence:** 4.0 day 1 lockdown at home (hill) → 5 PM plates, distant screams, nothing seen → night: food runs out → **late-night errand for Maggi to the kirana** → **map re-render** (desaturate, green fog from edges, music cuts to heartbeat, tiles crack, overturned vehicle, smashed shop window — exactly ADR-27/29 driven live) → **a figure sprints from behind a car in an auto driver's khaki shirt** → no tutorial text; the player must figure out: **RUN** (mechanic reveal #19) → home. **The flat becomes the safe house. The game has changed.**
The khaki figure = the auto driver's colleague from the same stand (foreshadows B4).

### B2. Act 4 economy in two phases (ADR-45)
| Phase | Money | World |
|---|---|---|
| **4a "Survival is the job"** | UPI still works; **inflation**: `prices.json × daily multiplier` (food, medicine, batteries, tools skyrocket). **Share market crash** on News. Office Chats still ping "stand-up at 10" — rest of the world is WFH (dark satire, Severance beat). Optional remote work still pays — for now | shops **barricaded, selling through a slot in the door** (new interaction) |
| **4b UPI dies** ("server busy", locked ADR-12) | barter.json | — |
Locked UPI death preserved — it just arrives after a short inflation phase, so the collapse is felt.

### B3. Safe locations
Board: PG home base, Darshini shelter, **underground metro station = safe**, temple compound, military checkpoint.
- Home base = **hill flat** (locked base chain start).
- Darshini shelter ✅ (base chain's café stop).
- **Underground stations (Cubbon Park, Vidhana Soudha, MG Road/Majestic underground sections) = military UV camps → safe.** Elevated stations' shaded undersides = infected nests (ADR-33 stands). Both rules coexist.
- Temple compound ✅ new optional safe zone (lamps + bells; bells = noise → double-edged).
- Military checkpoint ✅ at Vidhana Soudha (landmarks doc).
- **Infected zones expand on the Maps app** as hatched/corrupted overlay (board: 40% of map) — driven by `stability` (ADR-20).

### B4. Mechanics adopted
| Board | Ours |
|---|---|
| **Stealth crouch-walk** (slower, shrinks detection radius) | ✅ NEW: crouch = 0.5× speed, detection radius −2 tiles, 0 noise (ADR-46) |
| Noise: running = louder = wider detection | ✅ already (ADR-23/32) |
| Distractions: throw stones/bottles | ✅ extends steel-tumbler decoy: stones, bottles, phone alarm |
| Crafting: flashlight, smoke bomb | ✅ propose as 2 of the 4 recipes: **phone-torch-to-UV flashlight** (UV LED + power bank — repels briefly, ties ADR-33) and **smoke bomb** (break LOS — escape valve). Other 2 TBD (bandage, barricade) |

### B5. Key story beats
| Board | Merge |
|---|---|
| **Deepa** reveals she worked at IISc, knows about Project Amrita | ✅ **Deepa replaces "Kavya"** (user's earlier name wins): contract lab assistant at **HIVR**, hill neighbour, Vikram's shift partner. Reveals Amrita in Act 4 |
| PG-mate Karthik wants to evacuate; Priya wants to fight back | ✅ survivor-group debate at base = **ending-shaping choice**. Karthik (new, neighbour) = evacuate. "Priya" clashes with our dating match → fight-back voice = **Sameer** (existing colleague) unless user prefers another name |
| Player goes to hospital (infected zone) for medicine for Deepa | ✅ resolves Deepa's fate: **survives, injured**; medicine run = investigate + deliver mission into the hospital where Act 3 happened (familiar map, ruined) |
| Military checkpoint commander: supply runs into infected zones for weapons and food | ✅ recurring **deliver** missions (ADR-22). "Weapons" → **tools only** (lathi, UV torch, crowbar) to keep combat light (ADR-14) |
| Auto driver from Ch 1 trapped in his auto, surrounded — save or walk away | ✅ the Kannada auto driver (`npc_auto_kannada`). Save = costs resources + risk, he becomes **transport ally** (fast travel in Act 4); walk away = keep resources, his quest line closes. **Reputation Namma makes the rescue easier** (he honks a signal, you know his route) — ADR-26 payoff. Note: board calls it "Nash equilibrium"; the accurate term is a **risk–reward moral dilemma** (no other player choosing simultaneously) |

## C. Conflicts / flags (no change made — user to decide)
1. **Rameshwaram Café** in the locked base chain is a **real restaurant brand** → by licence hygiene should become a parody name (e.g. "Rameshwara Tiffin Room"). Proposed ADR-47.
2. Fight-back character name (Sameer vs new).
3. Remaining 2 crafting recipes.
