# NAMMA OUTBREAK (working title) — Story Script v1.0
> Supersedes v0.1. Companion files: `game_components.md` (systems), `design_decisions.md` (why).
> Every scene names which steps of the core loop it serves: **CHALLENGE → ACTION → FEEDBACK → PROGRESS → REWARD → CURIOSITY**.
> Status tags: LOCKED / PROPOSED / TBD.

---

## 0. Premise (LOCKED)

A small-town kid who studied hard, got campus-placed, and flew to Bangalore for the first job. Hotel for three nights, then a PG, then a rented room on a hill with bad signal. First salary, first scooter, first weekend in Cubbon Park, first girl. Three districts away, another small-town kid — an unpaid biology intern — is being ground down by the same city. One night he takes a phone call in the wrong corridor. Months later the two of them end up in neighbouring hospital beds, and he tells the player what he did. When the player walks out of that hospital, the city is under curfew, and the plates start banging at five.

**Tone spine:** *Severance* (routine → collapse). **Outbreak delivery:** *World War Z* + *Feed* (voices and feeds, no cutscene). **Lab:** *The Girl With All the Gifts*. **Visual:** Zelter. **Structure:** Pokémon LeafGreen (gated routes, fade transitions, starters).

---

## 1. Protagonist (LOCKED concept / TBD names)

| | |
|---|---|
| Origin | Small town, India (region deliberately vague; three starters may vary this later) |
| Why Bangalore | Campus placement, entry-level role at a Whitefield IT firm (fictional) |
| Arrives with | Backpack, phone, laptop, offer letter, ₹12,000, parents' voice |
| Gender | Male / female variants, same script, pronoun swap |
| Starters B/C (bus/train) | Deferred to v1.1 — same skeleton, different arrival |

### The Mirror — "RAVI" (placeholder), 23
Biology graduate, small-town, placed as an **intern** at the **Hebbal Institute of Viral Research (HIVR)**. Unpaid stipend, night shifts, treated as free labour. Lives in a PG in the same Whitefield belt (HIVR runs a shuttle). Father has taken a loan for his sister's wedding; the family calls every night. **He is the player with one different roll of the dice.**

**Arc:** Met outside the office (1.5) → stress visible across Act 1 → playable flashback in the hospital (3.3) → consequence in Act 4. Never a villain, never a boss.

### The Lab's project (PROPOSED — gives Cordyceps distance)
HIVR + a visiting agricultural institute are studying a **neurotropic virus that mimics *Ophiocordyceps* behaviour** — the ant-controlling fungus — for crop pest control. Humble, plausible, no bioweapon. The ant animation in 3.3 is scientifically honest: the fungus hijacks *living* ants, marches them to a leaf, kills them, and fruits. The virus does the first half, in people.

### Love interest — "ANANYA" (placeholder), 24
Photographer / design student, Cubbon Park regular. Met in 2.2. Arc runs through Acts 2–4; dating-app subplot (2.6) is the controversy hook. Her fate in Act 4 is a choice-driven branch.

---

## 2. Macro Structure

| Act | Title | Player | City | Loop emphasis |
|---|---|---|---|---|
| 0 | Landing | Hotel, ₹12k, no idea | Normal | Tutorial, curiosity |
| 1 | Roots | PG → hill flat, first office day, first bus | Normal | Challenge, feedback |
| 2 | Routine | Salary, scooter, metro opens, Ananya, guitar, IKEA | Rumours in feeds | Progress, reward |
| 3 | Fever | Accident, hospital, Ravi's flashback | Headlines, sealed ward | Curiosity peak |
| 4 | Curfew | Loses everything | Districts fall; metro shuts | Survival loop |

---

## 3. Map, Transport & Gating (LOCKED concept)

**Opening state:** Whitefield + Cubbon Park reachable. **Whitefield metro station is UNDER CONSTRUCTION** (real-life nod). Early travel = BMTC bus (timed intervals, visible on road). Metro opens as a world event in 2.3.

**Stations on the player's map (famous nodes):**
Whitefield/Kadugodi · KR Puram · Indiranagar · MG Road · Cubbon Park · Majestic · Jayanagar · JP Nagar · Yeshwanthpur · Yelahanka · Kengeri · Nagasandra (IKEA) · Hebbal (bus only).

**Unlock rule:** tap a locked station on the map or in a train → *"Finish the challenges in [current area] to unlock [station]."* Each area has 2–3 named challenges (see components §6).

**Scooter:** fuel-gated. Enough for Whitefield ↔ Indiranagar; long hops force the metro, where metro-specific challenges live.

**Act 4 fall order:** Hebbal → Yelahanka → Yeshwanthpur → Majestic → MG Road/Cubbon → Indiranagar → Whitefield. Last base: Lalbagh.

**Transitions:** every area edge = fade-to-black + slow-step, LeafGreen style (confirmed: NES Zelda / Link's Awakening do the same).

---

## 4. Scene Script — ACT 0 & 1 (full beats)

Legend: **C/A/F/P/R/Q** = which loop steps the beat serves.

### 0.1 — "ARRIVALS"  `act0_arrivals` · airport_interior (exists) · 06:10
**Player goal:** bag, exit, don't get fleeced. **Design goal:** teach move/interact/phone/UPI.

Cast: Baggage Handler (T1) · Chai Anna (T2) · Lost Tourist (T2, existing quest) · Cab Touts ×2 (T2) · Security Guard (T1) · **Man in HIVR lanyard w/ cold-chain box** (T1, flag `seen_hivr_lanyard`) · travellers ×15.

- F1 Fade in. *"Bengaluru. 06:10."* Phone buzzes: Chats — Amma: *"Landed? Call."* Teaches phone open. **[Q]**
- F2 Trolley. "Side side!" Interact prompt.
- F3 Bag. Inventory.
- F4 Chai ₹20 — **first UPI payment**, pixel QR scan animation. **[A,F]**
- F5 Lost Tourist quest (existing). ₹100, rep +1. **[C,A,R]**
- F6 Background: HIVR man signs for a styrofoam box. Silent. **[Q]**
- F7 Touts: ₹1,800 cab / prepaid ₹900 / Chai Anna points to **Vayu Vajra airport bus ₹250** → arrive late. **[C]** Bus is canonical (player is broke and new).
- F8 Exit → Airport LOCKS. Bus ride: 20-s window parallax (Hebbal flyover glimpsed — HIVR sign flashes past). **[Q]**

### 0.2 — "THREE NIGHTS"  `act0_hotel` · whitefield_hotel (new, small) · 08:30
**Player goal:** check in, survive three days, find a PG before the company stops paying.
**Design goal:** safe base that *expires* — the first timer.

Cast: Receptionist (T2) · Housekeeping (T1) · **Divya** (T3, team lead, calls on phone) · PG brokers on Chats.

- F1 Receptionist: "Company booking, three nights only, sir/ma'am." Countdown UI appears. **[C]**
- F2 Room. Save. Phone: Maps shows Office pin + three PG pins. **[P]**
- F3 Divya call: "Join Monday. Find a PG by then — hotel won't extend." **[C,Q]**

### 0.3 — "PG HUNT"  `act0_pg_hunt` · whitefield_lanes (new) · Days 1–3
**Player goal:** sign a PG. **Design goal:** hurdles with Indian texture; negotiation teach.

Three PGs, each a mini-challenge:
1. **"Boys/Girls Only"** — full, owner takes ₹500 "token" and ghosts (scam, rep lesson). **[C,F]**
2. **"Veg Only, Gate 10"** — owner **Shanthamma** (T3): ₹5,000 deposit + ₹7,000. Player has ~₹11k. Negotiate (dialogue cards) → ₹3,000 + ₹6,000. **[A,P]**
3. **"Luxury Co-living"** — ₹15,000, unaffordable; shown to make #2 feel earned. **[F]**

- F-end Move in (bed exists). Shop on the lane: **Darshini + provision store** — buy snacks ₹120 (food meter introduced, see components). **[A]**
- Night beat: window, lane sounds, phone — Amma call. *"Eat properly."* Save. **Homesick beat, 15 s, no choice.** **[Q — emotional]**

### 1.1 — "MONDAY"  `act1_first_day` · whitefield_main (existing 253-line scene — wired here) · 08:15
**Player goal:** reach office by 9:30 using Maps. **Design goal:** navigation, autos, lateness cost. **Office interior is NOT shown.**

Cast: Autos ×3 (T2: "meter illa ₹150" / meter / Kannada-only mini-puzzle) · Office Guard (T2) · Prakash, admin (T2) · Divya (T3) · **Sameer** (T2→3) · 40 wander bots.

- F1 Maps route line on phone; player walks/autos. **[A]**
- F2 Guard → Admin → Prakash: "Spell it." ID Card (key item). **[R]**
- F3 **Interior hidden:** fade → pixel animation of player climbing stairs → window seat silhouette. **[Q]**
- F4 **Skyline time-lapse:** sun drops, moon rises, clock 09:30 → 18:00 in 12 s. Reusable "workday" transition. **[P]**
- F5 Exit at 18:00. → 1.2 immediately.

### 1.2 — "THE INTERN"  `act1_ravi_intro` · office_gate · 18:05
**Design goal:** introduce Ravi as a peer, not a plot device.

- F1 Outside, a lanky guy in an HIVR lanyard is arguing on the phone in a small-town accent the player recognises. Hangs up. "Sorry — you also new? Which town?" **[Q]**
- F2 Dialogue: he's an intern at a lab in Hebbal, shuttle picks him up here. "They said stipend. It's been two months." Gives number. Flag `met_ravi`. **[Q]**
- F3 Shuttle arrives — same cold-chain box logo as 0.1 F6. **[Q]**

### 1.3 — "NOT WORKING OUT"  `act1_pg_exit` · PG · Days 5–8
**Player goal:** realise the PG isn't it; buy table+chair → *"No space."* **Design goal:** motivated move; housing ladder step 2.

- F1 Food meter keeps dipping — PG food "doesn't suit" (no community named). **[F]**
- F2 Buy table+chair from lane shop ₹1,800 → delivery guy: *"Where to keep, saar?"* → system message **"Not enough space."** Items held in storage. **[C]**
- F3 Shanthamma: "Deposit back after notice, one week." Timer. **[C]**

### 1.4 — "AMBEDKAR NAGAR"  `act1_hill_flat` · ambedkar_nagar_hill (new) · weekend
**Player goal:** rent a room on the hill; check signal first. **Design goal:** verticality, a tiny tech-literacy joke, the player's first *own* place.

Cast: Broker "Manju" (T2) · Owner aunty (T2) · Neighbour kid with cricket bat (T1) · Chai shop at the slope (T2, save point).

- F1 Climb. Three rooms. In each: **open phone → Reels → does the video buffer?** Two fail. **[A,F]**
- F2 Third room: 1 bar, buffers, then plays. Owner: ₹9,000 + 2 months deposit. Negotiate → ₹8,000 + 1 month. **[C,A]**
- F3 Move: table+chair delivered. Buy **bed ₹4,500** (lane furniture shop, cash), **induction stove ₹2,200**, snacks. Money dips near zero — **deliberate**. Salary is 12 days away: countdown. **[P,C]**
- F4 Phone: Reels — first clip of a "mysterious fever in North Bangalore," 3 s, scroll past. **[Q]**

### 1.5 — "BUS TO TOWN"  `act1_bus_cubbon` · bus_interior (new) → cubbon_park (new) · Sunday
**Player goal:** reach Cubbon Park. **Design goal:** metro-under-construction reveal; bus as social space; WWZ voices.

- F1 Whitefield metro station: barricades, *"Namma Metro — Opening Soon."* Tap → *"Under construction. Use bus 500-D."* **[F,Q]**
- F2 Bus stop: buses arrive on a visible interval timer (every 90 s game time). Board, ₹35 UPI/cash. **[A]**
- F3 Interior, 25-s ride with 3 interactable passengers: a nurse ("double shift, Hebbal side, strange cases"), an uncle reading a paper (headline: *"HIVR–visiting institute study in third phase"*), a kid asleep. **[Q]**
- F4 Fade → Cubbon Park. New palette: green, bandstand, cycle rental. **[R]**

### 1.6 — "CUBBON PARK"  `act1_cubbon` · cubbon_park · Sunday
**Player goal:** explore; help someone. **Design goal:** meet Ananya through the phone system; first collectible set; curiosity hook.

Cast: Cycle rental guy (T2) · Ice-cream cart (T2) · Library steps regulars (T1) · **Ananya** (T3) · stray dogs ×3 (T1, photo collectible) · a jogger who stops, coughs, waves it off (T1, **[Q]**).

- F1 Collectibles: 5 "Cubbon photos" (bandstand, library, bamboo grove, red building, dog). **[A,R]**
- F2 Ananya at cycle rental: phone dead, can't pay the ₹60 UPI. Player pays. She: "Send me your number, I'll return it." **Number exchanged = relationship system opens.** **[C,A,R]**
- F3 Optional: walk the loop together — 3 dialogue nodes, no stakes, pure charm. She shoots photos; one of them becomes a save-screen image. **[R]**
- F4 Guitar shop on Church Street (edge of map): guitar ₹6,500 — **can't afford**. Wishlist pin appears on phone. **[C,Q]**
- F5 Bus home. Reels at night: fever clips, a doctor's thread, a meme. Amma call: "News is saying something about Bangalore. Be careful." **[Q]**
- EXIT: sleep → Act 2.

---

## 5. ACT 2 — "ROUTINE" (beats; full script v1.1)

- **2.1 "Credited"** — Workday transition → phone ping: *"₹32,000 credited."* Tutorial card: *A two-wheeler gets you to work and nearby areas fast — mind the fuel.* Scooter showroom Whitefield: second-hand ₹38,000 on EMI (₹6,000 down) or save for 2 months. **Fuel gauge introduced.** **[P,R]**
- **2.2 "Metro Opens"** — World event: barricades gone, inauguration flags, crowd. First ride is free that day. Purple Line: Whitefield ↔ KR Puram ↔ Indiranagar ↔ MG Road ↔ Cubbon Park. Metro challenges begin (lost kid, token machine jam, seat-for-elderly rep check). **[R,Q]**
- **2.3 "Guitar"** — Buy it. Learn 3 chords via rhythm mini-game at home; Ananya hears a clip. **Asset reused in Act 4 as noise lure / morale.** **[P,R]**
- **2.4 "IKEA Run"** — Nagasandra via Green Line (requires Majestic unlock). Furniture flat-pack carried on metro = comedy + capacity mechanic. **[C,A,R]**
- **2.5 "Ravi, 1 AM"** — Whitefield shuttle stop. Ravi shaking, hasn't slept, sister's wedding loan, "they put me on the agri-samples alone." Player can: sit with him / give ₹2,000 / leave. Flag `ravi_supported`. **The Electro night.** **[C,Q]**
- **2.6 "The App"** — Dating app appears on phone (controversy hook, see design_decisions ADR-07). Match with "Priya". Ananya finds out (phone left unlocked). Break-up scene at the bandstand. Relationship state → `strained`. Optional mature beat earlier at 2.3b is fade-to-black only (ADR-08). **[C,F]**
- **2.7 "Breadcrumbs"** — Across Act 2 the **News app** escalates weekly: *mystery fever* → *HIVR denies leak* → *ward sealed at Hebbal* → *Yelahanka schools shut*. Reels mirror it. Sameer out sick 3 days. A security guard at the office salutes an empty gate for a full minute (Severance beat; **[Q]**).

## 6. ACT 3 — "FEVER"

- **3.1 "Outer Ring Road"** — Player on scooter at night, Hebbal junction. A bike swerves, both go down. **The other rider is Ravi** — asleep at the handlebars after a 20-hour shift. **Coincidence motivated: he caused it.** Same ambulance, same government hospital ward. **[C]**
- **3.2 "Ward 4"** — Player immobile (broken wrist). Ward: nurse from the bus (callback), a sealed section at the end, "do not enter." Ravi in the next bed, concussed, talking. **[Q]**
- **3.3 "The Corridor" (PLAYABLE FLASHBACK as Ravi)** — Player controls Ravi in the HIVR containment corridor, night. Phone buzzes: *Appa*. The only choice offered is *Answer* — the *Ignore* option is greyed out. He answers; skips the glove-change station. The screen doesn't dramatise it; a checklist UI just shows one unticked box. Cut to the **ant animation**: fungus → ant climbs → clamps leaf → dies → fruits. Ravi: "Ours stops at the climbing part. In people, I mean. They don't die. They just... keep going." **[Q — peak]**
- **3.4 "Three Nights, Again"** — Three sleep cycles in the ward (echo of 0.2). Each night the phone gets quieter: News → curfew announced; Chats → Amma "come home"; UPI → *"Server busy."* Ravi's bed is empty on night three; IV line on the floor. **[F,Q]**
- **3.5 "Discharge"** — Nurse: "Go home. Stay inside. Don't make noise after five." No one explains. **[Q]**

## 7. ACT 4 — "CURFEW" (opening beats; loop in game_components §9)

- **4.0 "Janata"** — Walk out. The city is not empty — it is **locked down**. Shutters, police tape, a lone BMTC bus parked diagonally. Scooter gone from hospital parking. Phone: UPI dead, Maps cached, Chats one tick. **[C]**
- **4.1 "Five O'Clock"** — Walking home through Indiranagar, 16:58. Then, on every balcony, **plates and spoons** — the government asked for a show of solidarity. The sound rolls across the city. And things start coming out of side lanes toward it. **The ritual is the trigger.** First infected encounter is a *run*, not a fight. **[C,F]**
- **4.2 "The Hill"** — Reach Ambedkar Nagar. Owner aunty gone. Room ransacked; guitar, induction, bed = first base. Barter table replaces UPI. Crafting bench = kitchen table (the one that "didn't fit"). **[P]**
- **4.3+ Base chain** — Hill → Rameshwaram Café (Uncle) → Cubbon bandstand (Ananya, if `strained` resolved) → Bangalore Palace → Lalbagh. Each base: scavenge radius, 4 recipes, resource clock, relocation trigger as the district falls.
- **4.x "Ravi"** — HIVR or his mother's bedside. State by `ravi_supported`. No fight.
- **4.end "Tunnel"** — Metro tunnels, last route. Endings TBD (ADR-10).

---

## 8. NPC Roster (`data/npcs/`)

| ID | Name | Tier | First | Arc |
|---|---|---|---|---|
| npc_ravi | Ravi, HIVR intern | 3 | 1.2 | peer → broken → flashback → mirror |
| npc_ananya | Ananya | 3 | 1.6 | love interest → strained → Act 4 branch |
| npc_shanthamma | PG owner | 3 | 0.3 | gatekeeper → Act 4 base host |
| npc_divya | Team lead | 3 | 0.2 | mentor → organiser |
| npc_sameer | Colleague | 2→3 | 1.1 | friend → sick → companion/loss |
| npc_uncle | Café regular | 2→3 | 2.x | informant → Indiranagar base |
| npc_meera | HIVR director | 3 | 2.7/3.x | truth-teller → leader |
| npc_prakash | Admin | 2 | 1.1 | comic → missing |
| npc_manju | Broker | 2 | 1.4 | hustler → trader in Act 4 |
| npc_owner_aunty | Hill landlady | 2 | 1.4 | kind → gone |
| npc_nurse | Bus → ward nurse | 2 | 1.5 | WWZ voice |
| npc_priya | Dating match | 2 | 2.6 | hook |
| npc_chai_anna | Airport chai | 2 | 0.1 | one scene |
| ambient_* | bots | 1 | all | generated |

## 9. Open Decisions → see design_decisions.md §Open


---
## Addendum 2026-10-11 — Origin merged
See `bangalore_rpg_outbreak_origin_v1.md`. Summary: Project Amrita (agri Cordyceps-mimic, + Meera's secret regeneration work); Ravi's skipped glove change → Vikram cuts hand → Malleswaram PG = patient zero, player's first week; long incubation + "acute viral encephalitis" cover-up = slow burn; monsoon drains spread it during Act 3; new NPCs Vikram, Kavya; player's employer builds HIVR's sample-tracking software. Fall order amendment proposed (Hebbal + Malleswaram first).
