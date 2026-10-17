# Act 4 systems plan v1 — what "CURFEW" runs on

Status: **PLAN — approved with the defaults** (the user, 2026-10-17: "default" — every §8 default taken). **S1 built** (ADR-144, awaiting audit): the dial, the look, the sound band, the crowd, the harsh survival table, the Playground dial. Changes made while building S1: the phone's Act 4 state moved from S1 to 4.0's build (it is story data); the ward's `stabilityIf` became 85/70/62 (not 75/68/62) so it sounds exactly as built.
Extends, does not redesign: `act4_systems_and_cast_v1` (zone levels, actions, AI states, damage, encounters, economy, recipes, Pulse Gun, endings), `infected_behaviour_v1` (stages, packs, UV, former NPCs), `game_components_v1` §3/§5/§7/§9, `player_profile_and_stats_v1` §2–3 (stats, the harsh Act 4 table), `chapter_board_merge_v1` §B (4a/4b economy, safe places, first encounter), `landmarks_and_retention_v1` §3.1 (mechanic reveals #19–24), `design_system_v1` §5/§7/§9 (`grade(stability)`, HUD, encounter motion), `city_pulse_v1` (same overlay machinery), story_script §7 (4.0 → 4.end), ADR-10/20/26/27/29/31/33/34/45/46/48/49/50, and the audio plan (`noise`, bands, the Act 4 test bench).

---

## 1. What changes for you

Acts 0–3 are a life sim with a slow fever underneath. Act 4 makes everything you trained turn against you. **One number per place, stability, now decides how that place looks, sounds and how dangerous it is**, and it falls day by day in the order the docs already fixed (Hebbal first, Whitefield last). Every system reads that number, so nothing is scripted per place.

On foot you get three new things: **running costs energy** (your stamina pips from the gym finally matter), you can **crouch** to go quiet, and you can **hide**. The infected hear your noise. They walk slowly until they notice you, growl for half a second, then chase you for eight seconds. They lose you if you break line of sight, reach a safe zone or leave their area. Your money dies on screen, the **barter table** takes its place, and the kitchen table that "didn't fit" becomes the **crafting bench**. Your flat becomes a **base**: a bed you can only sleep in there, a stock of food, water and fuel, and a generator that keeps the UV lamps on.

It's built as a **vertical slice**, meaning a small piece where every system works end to end. That's 4.0 walking out, 4.1's first run and 4.2's first base, with an audit stop after each step. Fighting, the Pulse Gun, the cast's missions and the endings come after you've played the slice.

---

## 2. What is already in the code to build on

| Exists | Becomes in Act 4 |
|---|---|
| `systems/noise.ts`: noise as a detection radius in tiles (crouch 2 · walk 5 · run 8 · fight 12), loud sounds fade over 1.5 s | what the infected hear; night adds +2 |
| District `stabilityIf` (stability by flag), the audio bands, the Playground Act 4 test bench | the seed of `grade()` (§3.1) |
| `Player` run (190 px/s, 1.58× walk; ADR-49 says 1.6×), `walkSpeed`, `hud: "minimal"` | energy-limited run, crouch, hide |
| `StatsManager` (health, food, stress, stamina, battery) + Act 1–3 food drain | the harsh Act 4 table (profile §3) switched on |
| Cards (`CardScene`, `then` landings, `end: "hold"`), sleepEvents, countdown plates, `nightLook`, objects by flag | travel and story beats; the "power cut" night at a base |
| `NegotiationManager` (offer / counter / walk, three temperaments) | the barter table, haggling in item value instead of ₹ |
| `InventoryManager` (8 slots, "not enough space"), carry limit (2.4) | scavenging and relocating |
| Phone apps gated by flags; UPI "Server busy" (3.4); no signal (3.4) | UPI dead, Maps cached, Chats one tick, battery as a real resource |
| Movie Mode walk grid (`walkgrid.ts`: 2 px grid, real feet box, replan) | the infected's pathfinding too, so there's no new dependency and it stays deterministic |

---

## 3. The systems

### 3.1 The dial: Act 4 day → stability → `grade()`
- **Act 4 has its own day count** (`act4Day`, which starts at 0 when you leave the hospital gate). Each district gets an `act4` block: `fallDay` (from the locked fall order: Hebbal → Yelahanka → Yeshwanthpur → Majestic → MG Road/Cubbon → Indiranagar → Whitefield; the origin addendum puts Malleswaram with Hebbal) and a `floor` (Ground Zero places sink below 20).
- `stabilityFor(district, act4Day, flags)` is pure. Before the fall day a place drifts slowly down from 85. On its fall day it drops to 55, then loses 8 a day down to its floor. A `stabilityIf` flag still overrides it (story beats win). Base UV lamps hold a place at 80 or above while the generator has fuel.
- `grade(stability)` returns a **level 0–4** (act4 doc §2: ≥80 safe · 60–79 warning · 40–59 infected · 20–39 hot · <20 ground zero). This is the **one** function the visuals, audio, people, infected and encounters all read (design system §9, ADR-27). There's no per-scene grading.

| Level | Look (one camera colour matrix + overlays, design tokens) | Sound (audio bands) | People | Infected | Encounter roll |
|---|---|---|---|---|---|
| 0 Safe | normal | normal | all | none | never |
| 1 Warning | `c.state.desat20`, distant sirens | warning | ambient ×0.5, shutters down | none visible | 5 % |
| 2 Infected | `c.state.desat50` + `c.fog.green` from the edges | infected | none except the cast | 1 pack | 25 % |
| 3 Hot | + `c.vignette.red`, a light glitch | deep | none | 2 packs | 60 % |
| 4 Ground zero | full | deep + growls | none | packs + one Host | 90 % |

- **Infected stage by days since the place fell** (infected doc §4): 0–2 Fresh · 3–6 Degraded · 7+ Evolved; the Host only near HIVR (Hebbal, Malleswaram).

### 3.2 On foot: energy, crouch, hide
- **Energy** = `stamina` pips (3–8). Running drains 1 pip every 2 s and you get 1 back every 3 s while not running. At empty you're forced to walk for 3 s (infected doc §1). The HUD shows the pips only while you run or are refilling ("a meter appears only when relevant", design system §5).
- **Crouch** (ADR-46): 0.5× speed, noise 2, halves the encounter roll. Keys: C or Ctrl (Ctrl+W closes a browser tab, so C is the main key). Touch: a toggle button.
- **Hide**: objects tagged `hide` (an open shutter, an abandoned auto, a bus shelter, a doorway) let you step in. You're hidden while crouched and still; your noise drops to 0 and the infected search instead of chase.
- Fighting (melee stun, ADR-48) and throwing decoys come **after** the slice (§6, step S4). 4.1's first encounter is a run by design.

### 3.3 The infected (`systems/infected.ts` pure + `entities/Infected.ts`)
States `wander → alert → chase → search → wander` (+ `stunned` later). Numbers from ADR-49, where player walk is 120 px/s:

| State | Speed | Rule |
|---|---|---|
| wander | 0.4× walk (48 px/s), animation +50 % | random walk inside its own **zone** |
| alert | stands | turns, **0.5 s growl** (the telegraph), the detect sting |
| chase | 0.9× run (171 px/s) | 8 s; LOS lost → last known spot → **search 3 s** → wander; **stops at its zone edge** |
| detect | — | in range when distance ≤ the player's `noise` radius (+2 at night) **and** in line of sight; a sound outside LOS (a dropped plate, the plates at five) pulls a wander to it without a chase |

- **Packs**: 1 visible lead + 2–4 idle in cover; when the lead detects you, the pack within 8 tiles joins. **UV**: never enters a UV radius. **Namma hesitation** (ADR-34): a former NPC you reached Namma with stands still for 1 s first.
- **Line of sight** = a ray against the collision grid. **Paths** = the Movie Mode walk grid, recomputed every 500 ms (the infected doc names EasyStar; our own grid is already tested and keeps runs identical).
- **Former NPCs** (ADR-34): an NPC's data gains `infected_fate: survives | infected{district, stage} | missing`. A former NPC wears their own sheet run through the infected recipe (ADR-28) and shows a faint name tag up close. Never Ananya, Ravi or Amma.
- **Deterministic**: every random roll (wander, packs, encounters) uses a seeded generator keyed by save seed + district + Act 4 day, on the game clock. Movie Mode `--twice` must still match.

### 3.4 Encounters from cover (ADR-50)
Generated maps are images with no tile properties, so (as with footstep surfaces) a **map spec carries `zones`**: rects with `level`, an optional `encounterRate`, and `cover` points (behind cars, doorways, shutters). Every 8 steps in a zone, roll `rate × (crouched ? 0.5 : 1)`. A hit means a 100 ms white flash, 0.5 s slow-mo and a growl, then 1–3 infected step out of the nearest cover 4–6 tiles away, already in alert. It ends when you leave the zone, lose them, or 30 s pass. Level 0 and UV never roll.

### 3.5 Getting hurt, and what happens at zero
- Touched: health −20, stress +15. A second hit within 5 s (grab): −35 / +25. A narrow escape: −5 / +10. Watching someone turn: stress +30 (act4 doc §5). A hit gives a red flash and a shake (`fx.hit`), and you get 1 s of grace so you can run.
- **Health 0 → fail forward** (recommended, §8 Q4): a card ("You don't remember the way back."), you wake at your base the next morning, lose half of what you were carrying, stress +20. The profile doc said "game over / last base reload". This supersedes it, if you agree.

### 3.6 Survival clock (ADR-16, profile §3, the Act 4 table)
Turned on when Act 4 starts: hunger at 0 costs health −3/min; rain without cover costs −2/min; sleep gives +15 and only works **in a base**; food drains at the Act 4 rate. **Water is an item** (bottles), not a new stat. Drinking takes the edge off the heat rule. The base keeps a **stock** (food, water, fuel counters) that each night uses up (§3.9). This also pays off the Act 1–3 debt "health/stress ticks not yet".

### 3.7 The phone degrades (game_components §3, one `network` token)
UPI: dead (§3.8 for how it dies) · Maps: **cached**, so pins are stale and infected zones appear as a hatched overlay **only where you have seen them** (stability → overlay) · Chats: one tick, so your messages never deliver and it becomes a diary · Calls: "Network busy" · Reels: the last clip loops · **Battery is real**: −1 per 2 game-minutes with the screen on, and it only charges at a powered base. The torch is a Phone action (it lights a cone and adds noise 1).

### 3.8 Money → barter (ADR-45 4a/4b)
- **4a, inflation, short**: a barricaded shop sells through a **slot in the door** (a new interaction) at `price × act4Day multiplier`. UPI goes through only on the second or third try ("Server busy"). §8 Q3 asks whether 4a lasts until the hill.
- **4b, barter**: items get `act4_value`, and `data/barter.json` lists the traders: who trades, what they want, what they hold and their temperament. The barter table **is** the negotiation mini-game with values instead of rupees: you offer items, they counter, you walk away. Traders: Manju ("hustler → trader"), the Darshini shelter later, Raju at the hill.

### 3.9 Scavenge, craft, base
- **Containers**: objects with a `loot` table (seeded, emptied once, never refilled; a new day spawns nothing). Kitchens, autos, shops behind broken shutters, the ward's cabinet.
- **Four recipes** (act4 doc §7, the later list; game_components §9's barricade/filter list is superseded by it): smoke bomb (bottle + cloth), noise maker (steel tumbler + stones), UV torch (flashlight + UV LED + power bank), bandage (cloth + clean water). You craft only at a **bench** object (the kitchen table at the hill).
- **Base** = a district with a `base` block: bed, bench, stock, generator, UV lamps. Each night uses 1 food + 1 water + 1 fuel from the stock. If fuel runs out the lamps go dark that night, the place loses its UV floor and the encounter roll starts. **Each base's scripted lamp failure** (infected doc §3) forces the move to the next base. The scooter's fuel counter becomes **generator fuel**: same counter, new use (ADR-33).
- **Relocation**: when a base's district passes its fall day, a sleepEvent card says it's time. You carry only your 8 slots (game_components §5).

### 3.10 Movie Mode and the Playground
- New walkthrough steps: `flee` (reach a point, planning around the infected as moving walls), `hide` (reach a hide spot, crouch, wait for search to end), `crouch_to`, `scavenge`, `craft`, `barter`. The generator learns zones (avoid live ones unless the beat is a run) and treats a fail-forward wake as a red scene.
- Playground: an **Act 4** node with an Act 4 day slider (stability and grade preview on any built map), a spawner, overlays for detection circles, AI state labels, zones and cover, plus a "god mode" toggle for looking around.

---

## 4. Data shapes

```jsonc
// districts.json — per district
"act4": { "fallDay": 0, "floor": 15, "base": null },
"base": { "bed": "bed_hill", "bench": "kitchen_table", "generator": "gen_hill", "uv": [{ "x": 12, "y": 6, "radius": 5 }], "lampFailsOnNight": 4 }

// map spec (alongside "surfaces") — areas drawn as rects, like the footstep surfaces
"zones": [{ "id": "lane_east", "rect": [20, 4, 14, 10], "level": "auto", "encounterRate": "auto",
            "cover": [[22, 6], [30, 11]], "hide": ["auto_wreck_1"] }]

// data/infected/<district>.json — placed packs and former NPCs
{ "packs": [{ "lead": [24, 8], "size": [2, 4], "zone": "lane_east" }],
  "former": [{ "npc": "npc_chai_anna", "zone": "kerb", "stage": "auto" }] }

// data/items/*.json — every item gains
"act4_value": 3, "tags": ["food"]           // 0 = worthless (the offer letter)

// data/barter.json
{ "trader_manju": { "temperament": "hustler", "wants": ["batteries", "medkit"], "holds": { "canned_food": 3 }, "margin": 1.5 } }

// data/recipes.json
{ "smoke_bomb": { "needs": { "bottle": 1, "cloth": 1 }, "bench": true } }

// data/stats.tuning.json — the two tables (profile §7), "gentle" and "harsh"
```
`validate-content` grows with each step: zones inside the map, cover on walkable tiles, every `act4_value` set, recipes and traders naming real items, every district's `fallDay` in fall order, at least one hide spot in any zone that has encounters.

---

## 5. Art and references needed (ADR-30: I ask before visual work)
1. **The infected look**: ADR-28's automated recipe over existing sheets (grey skin, torn clothes, twitch frames, glowing eyes for Evolved), so former NPCs keep their own clothes. **I need 2–4 reference images from you of the look you want** (how far from human Fresh should be, how much gore: I'd keep it to almost none) before step S2's art.
2. **Touch buttons** (run, crouch, later B and throw): reference images for the on-screen controls.
3. Pockets: the Hebbal General **gate** (4.0, fictional hospital on real Hebbal streets via OSM), an **Indiranagar lane with balconies** (4.1), the hill **ransacked** (4.2, a flag pass over the existing map, not a new map). The look by level is a colour pass, not new art (game_components §12).

---

## 6. Build order (an audit stop after every row)

| Step | What | You'll be able to |
|---|---|---|
| **S1 The dial** ✅ built (ADR-144) | Act 4 day, `stabilityFor`, `grade()` (visual matrix + overlays, audio bands re-pointed to it, people density), the harsh survival table, Playground day slider (the phone's Act 4 state moved to P22) | drag a slider and watch any built place go from normal to ground zero; see and hear it |
| **D1** | Draft **4.0 "Janata"** (stub, defaults, open questions) | answer it |
| **S2 The run** ✅ built (ADR-145; zones/cover/hide as district data, not map-spec rects) | energy, crouch, hide; infected AI with one Fresh pack on a Playground test map; detection, chase, search, zone edges, UV; harm + fail-forward; encounters from cover; Movie `flee` / `hide` | be chased, lose them, get hurt, wake at a base |
| **P22** | Build **4.0** (gate pocket, locked-down city, `card_leaving_ward` gets its `then`), then draft and build **4.1 "Five O'Clock"** (plates at 16:58 → the first run) | play from discharge to the first run |
| **S3 The base** ✅ built (ADR-149; barter = curated deals + one haggle) | containers, inventory pressure, four recipes at the bench, barter table, base stock + generator + UV, the sleep rule | scavenge, craft, trade, and spend a night at the base |
| **P23** | Draft and build **4.2 "The Hill"** | reach the hill and make it home |
| S4+ (after the slice) | melee stun (ADR-48), decoys and smoke, packs + Degraded/Evolved/Host, relocation + the base chain, former NPCs, Maps zone overlay, the cast's missions, Pulse Gun, endings | — |

Each step: pure modules with vitest tests (grade boundaries, stability by day, AI state transitions, detection by noise and night, the energy drain, encounter roll rate with a fixed seed, barter maths, recipe checks, fail-forward), validators extended, `pnpm movie --twice` identical, a browser look reached the way a player reaches it, an ADR with a plain-English first line, and a `NEED_TO_AUDIT.md` row.

---

## 7. Decided (engineering, delegated — each goes into the step's ADR)
- **One threshold set.** `grade()` uses the act4 doc's five levels (80/60/40/20); the audio bands (today 70/40/20) are re-pointed to them: L0 normal · L1 warning · L2 infected · L3–4 deep. To keep 3.4's ward sounding the same, its `stabilityIf` values move from 75/55/45 to 85/70/62 (normal, warning, warning, as built). The mix's "drone below 70" becomes "drone at level ≥ 1".
- **ADR-49 wins where ADR-32 differs**: wander 0.4×, chase 8 s → search 3 s (not "lose LOS for 6 s"). Chase speed is set to **0.9× run (171 px/s)**: the board's "1.5× walk" (180 px/s) would be faster than "barely outrun". Run stays 190 px/s (1.58×, which rounds to the doc's 1.6×).
- **Recipes**: act4 doc §7's four (resolves the open item), not game_components §9's older list.
- **Zones, cover and hide spots are map-spec rects and points**, not Tiled tile properties (generated maps have none), as with footstep surfaces.
- **No EasyStar**: the infected path on the Movie Mode walk grid (no new dependency, deterministic).
- **Crouch key C** (Ctrl as well where the browser allows).
- **Water is an item; the base has a stock**: no new player stat.
- **Act 4 days count from the hospital gate**, separate from the calendar day the clock shows.

## 8. Questions for you (each with my recommended default)

1. **What ships first?** → **The slice in §6: S1, draft 4.0, S2, 4.0 + 4.1, S3, 4.2**, then play it before fighting and the rest.
2. **The opening (drift guard).** Story script §7 says 4.0 = you walk out of the hospital into the locked city, and 4.1 = walking home through Indiranagar at 16:58 when the plates start. `chapter_board_merge` §B1 says 4.0 = lockdown day at home on the hill, plates at five with nothing seen, then a night Maggi errand to the kirana where a figure in auto-driver khaki sprints from behind a car. Act 3 already ends at the hospital gate. → **Keep the story script's order, and bring B1's best parts into 4.1**: the map changing live around you, the khaki figure (the auto stand colleague, foreshadowing Kumar) breaking from behind a car, no tutorial text, you just have to run.
3. **When does money die (drift guard).** ADR-45 adds a short inflation phase with UPI still working; story §7 says "UPI dead" at 4.0; 3.4 already shows "Server busy". → **UPI flickers through 4.0–4.1**: one barricaded slot shop, triple prices, it goes through on the second try. **It dies for good when you reach the hill**, and the barter table opens there (4.2, as the story says).
4. **Can the infected hurt you, and can you turn?** → **They hurt you (the act4 doc §5 numbers); health 0 = wake at your base the next morning, half your carried items lost, stress +20** (supersedes "game over"). **A hit never infects you**; that stays a story decision (open decision 4 in the design decisions: "Can the player get infected?" → no, unless a scene says so).
5. **Played or told?** → **Travel between places is told by cards** (Hebbal → Indiranagar → the hill is a long way on foot, the way 3.1's ride was told); **the pockets are played**; every chase is played.
6. **When does the cast appear?** → **At the hill in 4.2**: Suresh (the landlord, the absent aunty's husband) and Deepa (bitten early, as the doc says, from 4.3). Karthik and Raju come with the base. **Kumar's rescue in the first base-chain step (4.3)**, eased by Namma rep (ADR-26). **Priya and Major Rathore** come once you reach Cubbon / Vidhana Soudha.
7. **Barter values** (`act4_value`, 1 = a water bottle) → water 1 · food packet 2 · canned food 3 · cloth 1 · bottle 1 · stones 0 · flashlight 3 · batteries 4 · power bank 4 · fuel (1 L) 4 · medkit 5 · kitchen knife 3 · cricket bat 4 · UV LED 5 · laptop 3 ("a battery") · offer letter 0 · guitar: not for trade (it's your noise lure and your morale). Traders ask for 1.5× and haggle down like Shanthamma did.
8. **Infected references and touch-button references** (§5): send them before S2's art, or say "use your judgement" and I'll show you choices first.
