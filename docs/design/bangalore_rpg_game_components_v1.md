# NAMMA OUTBREAK — Game Components & Systems v1.0
> Systems design doc. Story lives in `story_script_v1.md`; rationale in `design_decisions.md`.
> Rule: **every system must name which step(s) of the core loop it serves.** If it serves none, cut it.

## 1. Core Loop (LOCKED)
**CHALLENGE → ACTION → FEEDBACK → PROGRESS → REWARD → CURIOSITY → repeat**

| Step | Definition | Primary carriers |
|---|---|---|
| Challenge | A goal with friction | Timers (hotel, salary), ₹ gates, locked stations, negotiation |
| Action | Verbs | Move, talk, pay (UPI), choose, ride, craft (Act 4) |
| Feedback | Immediate, legible result | ₹ ping, rep toast, food meter, fuel gauge, "Not enough space" |
| Progress | Persistent state change | Housing ladder, map unlocks, metro tier, relationship state |
| Reward | Something new to use | Scooter, guitar, metro card, Ananya's number, base |
| Curiosity | A question planted | Breadcrumbs: lanyard, headlines, reels, coughing jogger, sealed ward |

Nested loops: **micro** (one errand, 2–5 min) · **meso** (one area's challenges → unlock, 30–60 min) · **macro** (act).

## 2. Starting Kit (LOCKED)
Backpack (slots: 8) · Phone · Laptop (key item, no use until office) · Offer letter (key) · ₹12,000 · 1 water bottle · 1 snack.
Items are data: `data/items/*.json` {id, name, sprite, stackable, slot_cost, tags[], act4_value}. `act4_value` is the barter weight used after the swap (§7).

## 3. The Phone (PROPOSED → build early; it is the UI spine)
Pixel-art phone overlay, 160×288 px canvas scaled, opens with one key/tap. Apps are data-driven panels.

| App | Acts 0–3 | Act 4 degradation |
|---|---|---|
| **Maps** | Office/PG/shop pins, route line, locked stations greyed with unlock hint | Cached only; pins stale; infected zones hand-drawn by NPCs |
| **Chats** | Amma, Divya, Ravi, Ananya, brokers; drives quests | One tick; last messages frozen; becomes a diary |
| **Call** | Scripted calls (Amma, Divya); ring interrupts gameplay | "Network busy" then dead |
| **UPI** | All payments; QR animation; balance; salary ping | "Server busy" (3.4) → dead (4.0). **Money dies on screen.** |
| **Reels** | Breadcrumb feed; 3-s loops; mirrors News | Last clip loops forever |
| **News** | Weekly headline escalation (2.7) | Final push notification: curfew |
| **Dating app** | Appears 2.6 only | Gone |
| Battery | Cosmetic in Acts 0–3 | Real resource in Act 4 (power bank craft) |

Implementation: one `PhoneScene` overlay + `apps/*.json`; each app = list of entries gated by flags/act.

## 4. Transport (LOCKED)
- **Walk**: baseline.
- **Auto**: price negotiation dialogue; ₹ sink; Kannada mini-puzzle variant.
- **Bus (BMTC)**: visible on-road interval timer (90 s game time); boarding = fade to `bus_interior` with 3 interactable seats; ₹35. Routes: airport Vayu Vajra, 500-D Whitefield↔Cubbon.
- **Scooter** (2.1): speed ×1.8; **fuel gauge** (tank ≈ 3 Whitefield↔Indiranagar round trips); petrol bunk ₹ sink; parking zones only; cannot enter metro areas; stolen in 4.0.
- **Metro**: under construction until 2.2. After: fade → `metro_interior` with challenge slots → destination. Station tap when locked: *"Finish the challenges in <area> to unlock <station>."*
- **Transitions**: all area edges and doors = fade-to-black 400 ms + 4-step auto-walk (LeafGreen).

## 5. Housing Ladder (LOCKED)
Hotel (3-night timer, free) → PG (deposit, bed included, "no space" cap) → Hill flat (signal check, furnish: bed, table, chair, induction, fridge later) → **Act 4: every past home is a base candidate.** Furniture = capacity + crafting stations.

## 6. Map & Area Gating (LOCKED)
`districts.json` → each area: `{id, station, requires:[challenge_ids], unlocks:[area_ids], act4_fall_order}`.
Opening: Whitefield, Cubbon Park. Per-area 2–3 challenges (e.g. Whitefield: PG signed, ID card, Ravi met · Cubbon: 5 photos, Ananya helped). Metro map UI reads this file directly.

## 7. Economy (LOCKED)
- ₹ via `stats.money`; **every purchase is a `canAfford()` call** (closes audit gap 3).
- Income: errands, salary ping (monthly, on workday transition), rare side hustles.
- Sinks: chai, auto, bus, deposit, furniture, snacks, petrol, metro card, guitar, scooter EMI, IKEA.
- **Food meter**: slow drain; eat at Darshini/home; low food = slower walk (no death in Acts 0–3).
- **Act 4 swap**: `prices.json` → `barter.json` keyed by `act4_value`. Same inventory code.

## 8. Relationship & Reputation
Rep (existing ReputationManager) gates negotiations and metro tiers. Relationship (Ananya): `met → warm → strained → resolved/lost`, driven by Chats choices + 2.6. Light, 5 states, no meters shown.

## 9. Act 4 Survival Loop
Scavenge radius around base (containers seeded per district) → **4 recipes**: barricade, torch, water filter, medkit → resource clock (water/food/battery) → district-fall trigger → relocate carrying `backpack_slots` items. Infected: 1 enemy type + 1 "noise-drawn" variant; stealth = stay out of noise radius; **no combat system beyond shove + run** for v1.
Noise sources: running, guitar (lure), plates event.

## 10. Health & Hospital
HP only matters in 3.1 (scripted) and Act 4. Hospital scene is a hub map reused in Act 4 as a loot/danger site.

## 11. Time & Transitions
Clock drives: bus intervals, PG gate (22:00), workday skyline time-lapse (reusable), 17:00 plates event in Act 4.

## 12. Collectibles
Photo sets per area (5 each) viewed in a Gallery app; Act 4 shows the same spots ruined — zero new art beyond a tint pass.

## 13. Save Flags (append to existing save)
`seen_hivr_lanyard, met_ravi, ravi_supported, ananya_state, pg_signed, flat_signed, scooter_owned, fuel, guitar_owned, metro_open, metro_tier, areas_unlocked[], areas_fallen[], act, food, phone_battery`.


## 11. Player Profile, Stats, Survival, Conditions (added 2026-10-05)
See `bangalore_rpg_player_profile_and_stats_v1.md`. Summary: character creation (name, gender, age, hometown, college, degree) → profile gates flavour only. Stats: health 100, wallet ₹35,000 (supersedes ₹12,000), social (named NPCs met), stamina 3→8 via gym/sports, food, phone battery. Survival gentle in Acts 1–3, harsh in Act 4 (two tuning tables). Healthcare centres = Pokémon Centre. Live conditions: metro construction, waterlogging, traffic, power cut, bandh, festival, lockdown.

### 11.1 Whiteboard salvage (2026-10-11)
Mission taxonomy `help | investigate | collect | chase | combat-lite` as quest `type`. `districts[].stability` 0–100 drives cosmetics early and the Act 4 fall order. `inventory.clues[]` counted, gates full Act 3 flashback (≥5). "City Moments" photo collection ties Ananya + Gallery. See `bangalore_rpg_whiteboard_salvage.md`.

### 11.2 Whiteboard salvage 2 (2026-10-11)
Mission taxonomy final: `help | social | deliver | investigate | collect | chase | combat-lite`. Identity arc = visual signals from `stress`/`social` (greyed memories, unrecognised, fading ID photo), inverted in Act 4. Negotiation mini-system (offer/counter/walk × 3 temperaments). `districts[].flavour` tags. Infected AI two tiers reusing goon/gang behaviours; noise = aggro. Rep tiers Hosa→Gothu→Namma.

### 11.3 Whiteboard salvage 3 (2026-10-11)
Pacing tags per beat (ADR-24). Interact = E / A-button / tap. Quest states `locked→available→active→completed` + `failed`, `expired`. Lighting ADR-25. Doors 32×48. Milestone M0 minimal loop (airport → chai Anna → Vayu Vajra stop).
