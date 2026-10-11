# NAMMA OUTBREAK — Landmarks, Loop Check & Retention v1.0
> Source: user notes (2026-10-11): landmarks list, 3-phase loop, player-retention insights.

## 1. Landmarks (silhouette-first — recognisable at 32-bit)
| Landmark | Signature to capture | Where / role | Act 4 |
|---|---|---|---|
| Vidhana Soudha | white dome + columns silhouette | Cubbon/MG Road edge; City Moment; News backdrop | army checkpoint / relief camp (UV lamps) |
| Bangalore Palace | Tudor-Gothic arches, turrets | base #4 | base |
| Lalbagh Glass House | greenhouse shape | final base | barricaded glass, UV-lit |
| Cubbon Park | red State Central Library + rain-trees | Scene 1.6, base #3 | bandstand base |
| MG Road Metro | purple elevated station | metro node | shuttered, infected shelter in shade (ADR-33) |
| Brigade Road | dense vertical shop signage | night district, dating meetups | looting, dead neon |
| Commercial Street | narrow lane, cloth shops | shopping_centre; gift quest for Ananya | cloth = crafting bandage source |
| **Nandi Hills outline** | far-hill silhouette | **parallax backdrop**: hill-flat view, office skyline time-lapse | same outline, smoke columns |
| BMTC bus stop | green shelter design | every bus_stand tile | shelter = cover |
| Auto stand vs cab pickup | auto queue vs app-cab zone | transport choice beat (price vs meter vs app) | abandoned autos = scavenging |
| Darshini | standing-only, steel counter | eatery, social spot | first barter hub |
| Café chains (Chai Point / CCD / Third Wave) | **parody names only** — e.g. "Chai Pointe", "Café Coffee Today", "Fourth Wave" | office-break / date spots | — |
Rules: real landmark *names* are fine in dialogue; **no real logos or brand marks in art** (art pipeline §9). Brands always parodied.
→ Added to art pipeline first-batch backlog after vertical slice.

## 2. Loop check — 3-phase vs ours
Board: **Action → Challenge → Reward** (textbook 3-phase loop).
Ours (ADR-01): **Challenge → Action → Feedback → Progress → Reward → Curiosity** — the same three phases, plus Feedback (player sees effect), Progress (meta growth) and Curiosity (pull to next loop). No change; the 3-phase is the minimum each mission must satisfy, ours is the full version. Pacing curve (ADR-24) is the felt layer on top.

## 3. Retention insights → concrete rules
### 3.1 Mechanical discovery — reveal one new mechanic every ~20–30 min of play (ADR-39)
| # | Mechanic revealed | Where | Loop step |
|---|---|---|---|
| 1 | Move, interact (E/tap), dialogue | 0.1 Airport | Action |
| 2 | Wallet + UPI pay | 0.1 chai Anna | Challenge |
| 3 | Phone: Maps, Chats | 0.1 → 0.2 | Curiosity |
| 4 | Bus timing (90 s), transit | 0.1 exit | Challenge |
| 5 | Time-limited stay (hotel 3 nights) | 0.2 | Challenge |
| 6 | Negotiation (offer/counter/walk) | 0.3 PG hunt | Action |
| 7 | Inventory capacity ("not enough space") | 1.3 | Challenge |
| 8 | Signal strength (Reels test) | 1.4 hill | Feedback |
| 9 | Food + health tick, rain + umbrella | Act 1 weekdays | Challenge |
| 10 | Camera → City Moments | 1.6 Ananya | Reward |
| 11 | Salary → scooter + **fuel** | 2.1 | Progress |
| 12 | Delivery side-gigs + traffic conditions | 2.x | Action |
| 13 | Metro network + station unlocks | 2.2 | Progress |
| 14 | Stress meter + relief activities | 2.3 Ravi breakdown | Feedback |
| 15 | Gym/sports → stamina/energy | 2.x | Progress |
| 16 | Investigate + clues | 2.7 breadcrumbs | Curiosity |
| 17 | Dating app | 2.6 | Curiosity |
| 18 | Playable as another character | 3.3 flashback | Curiosity |
| 19 | Run/energy, noise, hiding | 4.0 lockdown | Challenge |
| 20 | Scavenge + 4 recipes | 4.1 | Action |
| 21 | Barter (UPI dies) | 4.2 | Challenge |
| 22 | UV lamps + generator fuel | 4.3 base | Progress |
| 23 | Noise decoys | 4.x | Action |
| 24 | Base relocation | 4.x | Progress |
Phone apps also unlock gradually (apps greyed until their mechanic is taught).

### 3.2 Open world must never be empty (ADR-40)
"Large areas need enemies and challenges." Acts 1–2 have no zombies, so **everyday Bangalore is the opposition**: touts, scams, traffic, rain, waterlogging, power cuts, bandh, signal dead zones, broker fees. Act 4 swaps in infected using the same density budget.
Density rule for map-validator (warning): **≥1 interactable (NPC/quest/object/City Moment) per ~10×10-tile screen**.

### 3.3 Content discovery
City Moments (30), hidden NPC side-stories (named T2 NPCs each with a 2–3 step mini-arc), Easter eggs (Nandi Hills sunrise if you ride there at 5 AM with enough fuel), expired missions as Act 4 storytelling (ADR quest states).

### 3.4 "People can connect" (ADR-41)
In-game: social stat + reputation ladder (Hosa → Gothu → Namma) + NPC side-stories.
Real people, **async, no servers**: shareable **City Moments postcards** and **"My Bangalore" end-of-act cards** (pixel collage + stats: days survived, PGs rejected, ₹ spent on chai) via the Web Share API → WhatsApp/Instagram. Free marketing, PWA-native, single-player safe. Live co-op stays an **open decision**.
