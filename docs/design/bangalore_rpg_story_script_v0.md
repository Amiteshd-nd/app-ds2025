# NAMMA OUTBREAK (working title) — Story Script & Scene Breakdown v0.1

> Format: narrative design doc. Each scene has an ID, map, goal, cast, beats (frame-by-frame), player verbs, systems exercised, rewards, unlock, exit condition.
> Status: **LOCKED** = agreed in discussion. **PROPOSED** = my suggestion. **TBD** = placeholder.
> Everything here is data for the existing engine (QuestSystem, NpcDef tiers, districts.json, ReputationManager, stats.money). No new systems until Act 1.4 (vehicle) and Act 4 (barter/crafting).

---

## 0. One-Line Pitch

> A young middle-class dreamer arrives in Bangalore to make it. They fight for a PG room, learn the autos, the metro and the language, and slowly build a life — while, three districts away, an exhausted lab technician makes one careless mistake. By the time the player has a scooter and a rented flat, the city is already dying. Then they lose everything and have to survive it.

**Tone reference:** *Severance* (Ling Ma) — routine-to-collapse spine. *World War Z* — outbreak delivered through NPC voices, never a cutscene. *The Girl With All the Gifts* — the lab.
**Visual reference:** Zelter — pixel art, moody top-down, 32×32 tiles, 32×48 characters (already enforced).
**Structure reference:** Pokémon LeafGreen — three starters, gated routes (metro lines), areas unlock in sequence and cannot be revisited early.

---

## 1. The Three Starters — LOCKED (concept) / TBD (names)

Persona + gender chosen at `CharacterSelect`. Persona decides arrival point → first district → first struggle → starting stats. Same engine, three content packs under `data/quests/<persona>/`.

| | Starter A — THE FLYER | Starter B — THE BUS | Starter C — THE TRAIN |
|---|---|---|---|
| Arrival | Kempegowda Intl. Airport | Majestic bus station | KSR City Railway Station |
| Why Bangalore | Entry-level office job (fictional firm, Whitefield) | Coaching course / exam prep | Help a relative; no fixed plan |
| First district | Whitefield PG belt | Majestic / Gandhinagar lodges | Malleshwaram-inspired old neighbourhood |
| First struggle | Cab overcharge, PG deposit, office ID | Lodge touts, bag theft, finding the centre | Relative's shop in trouble, cash tight |
| Starting ₹ | 8,000 | 3,000 | 1,500 |
| Starting rep | 0 | 0 | +2 (relative vouches) |
| Starting item | Laptop bag, offer letter | Backpack, brochure | Cloth bag, address slip |
| Language | Hindi/English | Hindi only | Some Kannada |
| Map state after exit | Airport LOCKS | Bus stand LOCKS | Station LOCKS |

Default demo starter: **A — The Flyer** (AirportScene + Whitefield already exist).

> Pokémon parallel: persona = starter; metro lines = routes; districts = towns; reputation + metro card tier = badges.

---

## 2. Macro Structure — Five Acts

| Act | Title | Player state | World state | Core loop | Time |
|---|---|---|---|---|---|
| 0 | Arrival | Outsider, nowhere to sleep | Normal | Tutorial, first errands | 20–30 min |
| 1 | Settling In | PG tenant, odd jobs → job | Normal | Errands, rent, autos, language | 2–3 hrs |
| 2 | The Routine | Rented flat, scooter, contacts | Rumours. One sick colleague. | Side quests, collection, rep | 2–3 hrs |
| 3 | Something's Wrong | Stable life | Station skipped. Ward sealed. Hebbal quiet. | Investigation, choices | 1.5–2 hrs |
| 4 | Outbreak | **Loses everything** | Districts fall one by one | Scavenge, craft, move base, help/get help | Open |

**The reversal:** Acts 0–3 unlock the city via metro. Act 4 re-locks it as districts fall. Same `unlock_scene` data, both directions.

---

## 3. The Accident — Cast & Arc (PROPOSED)

### The Lab
**Hebbal Institute of Viral Research (HIVR)** — fictional. Mid-size, government-adjacent, near Hebbal flyover. Not evil. Underfunded, overworked, proud.

### The Leaker — "RAVI KULKARNI" (placeholder)
Tier 3. Senior lab technician, 38. Fifteen years in the same post, passed over twice. Mother in Hubli on dialysis; he sends money monthly. Lives in the **same PG belt as Starter A** — the player meets him before anyone knows who he is.

**Arc (Electro model: ordinary → pressured → one bad night → consequence)**
1. **Act 1 cameo.** Player's PG neighbour. Quiet, tired. Side quest: "post this money order, I can't leave before 9." *The player likes him.*
2. **Act 2 pressure.** Foreign sample arrives for a joint project (origin TBD — a "visiting institute", not a nation). Ravi on night shifts. One line: "They brought a new boy with a PhD. He signs, I do the work."
3. **Act 2 breaking point.** Mother's hospital calls during a shift. He takes the call inside the containment corridor. Skips one step. **Not shown. Pieced together in Act 3.**
4. **Act 3.** Room empty. PG owner: "gone to native." Lab guard: "one technician on leave, fever."
5. **Act 4.** Player finds Ravi — infected, or alive and broken, depending on Act 2 choice. **Never a boss. A mirror.**

### Lab Supporting Cast
- **DR. MEERA IYENGAR** (T3) — Director. Honest, exhausted. Act 3 informant, Act 4 leader candidate.
- **ARJUN "THE PhD"** (T2) — The hire Ravi resents. Not a villain; just young.
- **HIVR GATE GUARD** (T2) — WWZ device: tells the player things sideways.

---

## 4. District & Unlock Map (PROPOSED)

Metro = route system. Stations = `unlock_scene` targets. Metro card tier (₹ + rep gate) = badge.

```
ACT 0  Airport --cab--> Whitefield PG belt                   [Airport LOCKS]
ACT 1  Whitefield <--Purple Line--> KR Puram <--> Indiranagar (Tier 1: ₹500, rep 3)
ACT 2  + MG Road / Cubbon Park / Vidhana Soudha              (Tier 2: ₹1,500, rep 8)
       + Majestic interchange -> Green Line -> Malleshwaram, Rajajinagar, Lalbagh
ACT 3  + Hebbal (bus only — no metro; isolation is deliberate)
       + Bangalore Palace grounds (story)
       + Rameshwaram Cafe (Indiranagar) as hub / save point
ACT 4  Districts fall: Hebbal -> Malleshwaram -> Majestic -> MG Road -> Indiranagar -> Whitefield
       Metro shuts line by line. Last safe zone: Lalbagh (walls, water, open ground). Then it falls too.
```

Rule: every unlock answers "what can I do now that I couldn't before?" Every Act 4 lock answers "what did I just lose?"
Starters B and C enter this graph at Majestic / Malleshwaram and unlock *toward* Whitefield.

---

## 5. Scene-by-Scene — ACT 0 & ACT 1 (Starter A, vertical slice)

Legend: F = beat. PLAY = player verb. SYS = system. REWARD. UNLOCK. EXIT = exit condition.

### SCENE 0.1 — "ARRIVALS"
**ID** `act0_arrivals` · **Map** `airport_interior` (exists) · **Time** 06:10, haze
**Player goal:** Get your bag, find the exit, don't get scammed.
**Design goal:** Teach move/interact/dialogue, first ₹ transaction. Plant one background NPC for later.

| NPC | Tier | Role |
|---|---|---|
| Baggage Handler | 1 | Trolleys |
| Chai Vendor "Anna" | 2 | First ₹20 sink; comments on accent |
| Lost Tourist | 2 | Quest `arrival.json` (exists) |
| Cab Tout ×2 | 2 | Choice |
| Security Guard | 1 | Blocks re-entry |
| **Man in HIVR lanyard** | 1, flag `seen_hivr_lanyard` | Collects a cold-chain box at cargo counter. Silent. Background only. |
| Travellers ×15 | 1 | Wander bots |

- F1 Fade in at carousel. Text: *"Bengaluru. 06:10."* PLAY move. SYS movement, camera.
- F2 Trolley nearly hits player. "Side, side!" First interact prompt.
- F3 Suitcase arrives. PLAY pick up. SYS inventory.
- F4 Chai ₹20. SYS economy — **first real `canAfford()` sink.**
- F5 Lost Tourist quest (existing). REWARD ₹100, rep +1.
- F6 Walking to exit, background: HIVR man signs for a styrofoam box. No dialogue, camera does not linger. SYS flag.
- F7 Cab touts. Choice: (a) tout ₹1,800, rep 0; (b) prepaid ₹900, rep +1, tout holds a grudge; (c) ask Chai Anna → airport bus ₹250, arrive late/tired. **First meaningful choice.**
- F8 Exit. Guard: "No re-entry." UNLOCK Whitefield. LOCK Airport. *(Replaces current `unlock_scene: PGScene` dead end — PGScene becomes 0.2.)*
- EXIT exit zone with suitcase.

**Repo fix:** build `PGScene` (recommended) or retarget `arrival.json` → `WhitefieldScene` spawn `pg_gate`. Audit item 1.

### SCENE 0.2 — "THE PG"
**ID** `act0_pg_arrival` · **Map** `whitefield_pg_lane` (new, tiny: one lane, one gate, one PG) · **Time** 07:30
**Player goal:** Get a room tonight.
**Design goal:** PG owner (recurring), deposit mechanic, first humiliation beat, meet Ravi.

| NPC | Tier | Role |
|---|---|---|
| **Shanthamma, PG owner** | 3 | ₹5,000 deposit + ₹7,000 advance. Player has ₹6,200–7,100. |
| PG Cook | 2 | Later quests |
| **Ravi Kulkarni** | 3 (presented as 2) | Neighbour leaving for work; can vouch |
| Tenants ×2 | 1 | On phones |
| Street dog | 1 | Follows; collectible candidate |

- F1 Cab drops player. Camera pull-back: first wide Bangalore street — autos, hoarding, Darshini. *"I'm here."*
- F2 Shanthamma: "Deposit 5, rent 7, advance. Veg only. Gate 11."
- F3 **Designed failure** — can't afford. (a) negotiate (rep ≥1) → half now, rest in 7 days → **debt timer**; (b) ask Ravi → vouches → deposit waived, flag `helped_by_ravi`; (c) leave → bus-shelter night (0.2b, bleak, survival flag).
- F4 Room. Bed → **first save.**
- F5 Phone: *"Join Monday 9:30. Carry offer letter + ID."* Quest `act1_first_day` queued.
- EXIT save.

### SCENE 1.1 — "MONDAY"
**ID** `act1_first_day` · **Map** `whitefield_main` (**existing 253-line scene — wired in here**) · **Time** 08:15
**Player goal:** Office by 9:30. Get an ID card.
**Design goal:** Make Whitefield reachable (audit item 2). Teach autos, language friction, lateness cost.

| NPC | Tier | Role |
|---|---|---|
| Auto drivers ×3 | 2 | "Meter illa ₹150" / meter / Kannada-only |
| Office Guard | 2 | No ID, no entry |
| Prakash, admin | 2 | ID card; forgets your name |
| **Divya, team lead** | 3 | Mentor |
| **Sameer, colleague** | 2→3 | Friend. **First sick colleague in Act 2.** |
| 40 wander bots | 1 | existing BOT_COUNT |

- F1 Autos. Kannada-only option = phrase-card mini puzzle; success ₹60 + `kannada_1`.
- F2 Signal crawl, 20s. Hawker taps the auto. Flavour.
- F3 Gate blocked → Admin across campus.
- F4 Prakash: "Name? Spell it." REWARD ID Card (key item, Acts 1–3).
- F5 Divya: "You're late. Don't be late." UNLOCK side-task board.
- F6 Sameer at chai point: "Whitefield PG? Me too. Rameshwaram Cafe this weekend?" Café pinned, not yet reachable.
- F7 Evening return. Save.
- EXIT ID card + save after 18:00.

### SCENE 1.2 — "THE DEBT WEEK" (if 0.2 F3-a)
**ID** `act1_debt` · 7 in-game days
**Player goal:** ₹2,500 in 7 days or lose the room.
**Design goal:** **The economy sink loop** (audit item 3). The 10 side activities (brief §13):

1. Tiffin delivery for PG Cook — Delivery — ₹150/run
2. Shanthamma's missing cat — Search — ₹300, rep +1
3. Auto driver's son, English homework — Dialogue — ₹200, `kannada_2`
4. 5 shop-board photos for a colleague's blog — Collection — ₹250
5. Walk a drunk colleague home Friday — Escort — rep +2
6. Kid grabs your phone at bus stop — Chase — lose = no map markers 2 days
7. Get PG Wi-Fi restored for all tenants — Negotiation — rep +2
8. Night data entry for Prakash, find the errors — Investigation — ₹400
9. **Post Ravi's money order before 5 PM** — Delivery, timed — `helped_ravi_act1`, rep +1
10. Hold an Aadhaar queue spot for a stranger — ₹100, "Bangalore kindness" collectible

- Daily: morning office (skippable after day 2), evening free roam, 23:00 gate → save.
- **Day 4** Sameer: "some flu going around at my cousin's lab in Hebbal." **Breadcrumb 1. Zero emphasis.**
- **Day 7** Pay → rep +3, Shanthamma softens, Tier 1 metro card affordable. Don't → out → 1.2b (Sameer's couch, debt to Sameer).

### SCENE 1.3 — "PURPLE LINE"
**ID** `act1_metro` · **Maps** `whitefield_metro` (new, small) → `indiranagar_main` (new)
**Player goal:** Buy a card, ride to Indiranagar, meet Sameer at Rameshwaram Cafe.
**Design goal:** First route unlock. Metro = world map. City feels big for the first time.

| NPC | Tier | Role |
|---|---|---|
| Ticket Clerk | 2 | Tier 1 card ₹500, needs ID |
| Commuters ×30 | 1 | Denser than Whitefield |
| **Woman with newspaper** | 1 | Headline on interact: *"HIVR – visiting institute joint study begins"*. Breadcrumb 2. |
| Sameer | 2 | At café |
| Café staff ×3 | 1–2 | ₹ sink, comfort restore |
| **"Uncle", café regular** | 2→3 | Future informant hub |

- F1 Card. UNLOCK Purple Line (Whitefield ↔ KR Puram ↔ Indiranagar).
- F2 **Ride — 15s non-interactive window parallax.** Towers → bridge → trees. Reusable route screen for every line.
- F3 Indiranagar. New palette.
- F4 Café ₹80. Sameer comedy. Uncle overhears hometown → tip + contact. Rep +1.
- EXIT return with `metro_tier_1`.

### SCENE 1.4 — "THE SCOOTER" (Act 1 finale)
**ID** `act1_scooter` · ~Day 20
**Player goal:** Buy a second-hand scooter (₹18,000) from Uncle's lead.
**Design goal:** Light vehicle system (speed multiplier + parking). Mid-mission twist (brief §11).

- F1 Listing → Indiranagar back lane.
- F2 Seller: "documents tomorrow." Pay full / half / walk.
- F3 **Twist:** RC belongs to someone else. Owner confronts player at PG gate 2 days later.
- F4 Keep (rep −1, mobility) or return (rep +2, Uncle's legit lead).
- UNLOCK vehicle. UNLOCK Act 2.

> **Act 1 closer** (Sameer): *"Cousin's lab is on lockdown. Protocol thing. He's fine, he said. He sounded weird though."*

---

## 6. ACT 2–4 — Scene Outline (expand after slice is playable)

### ACT 2 — THE ROUTINE
- **2.1 "Rent"** — PG → 1BHK. Broker, 10-month deposit shock. Shanthamma farewell (kinder than she seemed).
- **2.2 "Lalbagh Sunday"** — Collection chapter: 20 collectibles across Lalbagh, Cubbon Park, MG Road. Green Line unlocked (Tier 2).
- **2.3 "Sameer's Fever"** — Sameer out 3 days. "Just a fever." His lab cousin is on his couch, silent. Breadcrumb 3.
- **2.4 "Ravi's Night"** — 1 AM, Whitefield metro, Ravi shaking before a night shift. If `helped_ravi_act1` he talks — mother, the PhD boy, "they don't even look at me." Player can offer to come to the hospital call. **The Electro moment.** Sets `ravi_supported`.
- **2.5 "Bangalore Palace"** — Team outing. **Last fully happy scene.** Bus news scroll: *"Hebbal: 12 admitted with unexplained fever."*

### ACT 3 — SOMETHING'S WRONG
- **3.1 "Skipped Station"** — Hebbal buses cancelled. Green Line terminates early. **First re-lock.**
- **3.2 "Dr. Iyengar"** — Uncle connects player to Meera. Carry a letter to Ravi's PG. Room empty.
- **3.3 "Hebbal by Bus"** — Investigation. Guard talks sideways. Cold-chain label (callback 0.1 F6). Sealed ward. Ambulance, no siren.
- **3.4 "The Choice"** — Help Meera move her team's families out quietly (rep, Act 4 contacts) or go public via Sameer's blogger friend (media route — *Feed*).
- **3.5 "Last Normal Night"** — Flat. Phone full of messages. Save. Fade.

### ACT 4 — OUTBREAK (Zelter loop begins)
- **4.0 "Morning"** — Silence. No autos. Scooter won't start. Network drops. **Inventory reset:** flat lost — stay & fight → lose; flee → carry 5 items. **Barter table replaces price table (data swap).**
- **4.1 "Whitefield Falls"** — Reverse tutorial: the lane from 0.2, now infected. Shanthamma's PG = first base. Tiers reused: T1 scared crowds, T2 traders/skills, T3 Divya, Sameer, Uncle, Meera, Ravi.
- **4.2–4.6 Base Chain** — PG → Rameshwaram Cafe (Uncle) → Cubbon Park bandstand → Bangalore Palace (walls) → Lalbagh (water, glass house). Each: scavenge radius, bench with **4 recipes max** (barricade, torch, water filter, medkit), resource clock, relocation trigger.
- **4.7 "Ravi"** — Found at HIVR or his mother's bedside. State depends on `ravi_supported`. No fight. A choice.
- **4.8 "Metro"** — The tunnels. Last route. Ending(s) TBD.

---

## 7. NPC Master Roster (`data/npcs/`)

| ID | Name (placeholder) | Tier | First seen | Arc |
|---|---|---|---|---|
| `npc_shanthamma` | Shanthamma, PG owner | 3 | 0.2 | Gatekeeper → ally → Act 4 base host |
| `npc_ravi` | Ravi Kulkarni, lab tech | 3 | 0.2 | Neighbour → breaking → the leak → mirror |
| `npc_divya` | Divya, team lead | 3 | 1.1 | Mentor → Act 4 organiser |
| `npc_sameer` | Sameer, colleague | 2→3 | 1.1 | Friend → first fever → companion or loss |
| `npc_uncle` | "Uncle", café regular | 2→3 | 1.3 | Informant → Indiranagar base |
| `npc_meera` | Dr. Meera Iyengar | 3 | 3.2 | Truth-teller → leader |
| `npc_arjun` | Arjun, the PhD | 2 | 2.4 / 3.3 | Resented → human |
| `npc_prakash` | Prakash, admin | 2 | 1.1 | Comic relief → missing in Act 4 |
| `npc_chai_anna` | Chai vendor | 2 | 0.1 | One scene; Act 4 callback optional |
| `npc_hivr_guard` | HIVR gate guard | 2 | 3.3 | WWZ voice |
| `npc_auto_kannada` | Kannada-only auto driver | 2 | 1.1 | Language arc → Act 4 driver |
| `npc_cab_tout_1` | Cab tout | 2 | 0.1 | Grudge if refused |
| `ambient_*` | Travellers, commuters, tenants, hawkers | 1 | all | Seeded, name-generated (brief §73) |

---

## 8. Repo Changes (data-only unless noted)

1. `arrival.json` → build `PGScene` as Scene 0.2 (recommended) or retarget to `WhitefieldScene` spawn `pg_gate`.
2. `WhitefieldScene` reachable from 0.2. Audit item 2 closed.
3. ₹ sinks: chai, auto, deposit, metro card, café, scooter — all `canAfford()` calls in quest data. Audit item 3 closed.
4. `districts.json` phases → metro tiers.
5. Save flags: `seen_hivr_lanyard`, `helped_by_ravi`, `helped_ravi_act1`, `ravi_supported`, `kannada_1..3`, `metro_tier`.
6. **Code (Act 1.4):** Vehicle — speed multiplier + parking zones. Trivial.
7. **Code (Act 4):** barter table swap; 4-recipe crafting; base relocation trigger. Not before the slice is fun.

---

## 9. Open Decisions

1. Protagonist names ×3, gender variants
2. Game title
3. Visiting institute origin — vague or fictional name
4. Does the player ever get infected? (Severance: fever as creeping routine)
5. Ending count — one, or two (Lalbagh holds / falls)
6. Starter B and C scene scripts
7. Co-op: which Act 4 scenes, if any
