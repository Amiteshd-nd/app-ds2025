# NAMMA OUTBREAK — Act 4 Systems & Cast Merge v1.0 (2026-10-11)
> Source: user's last notes (Key Characters, Zone Types, Combat, Infected behaviour, Damage, Detection, Random Encounters, Resource Economy, Pulse Gun). User's numbers are adopted where they differ from mine; supersessions listed in §9. Locked story not overwritten.

## 1. Cast merge (board names win over names I invented)
| Board | Role / arc (board) | Merge into ours |
|---|---|---|
| **Player** | fish out of water → survivor → **hero or deserter** | ✅ the player arc and the **ending axis** (§8) |
| **Suresh** | landlord, 50s, strict but caring → group's protector; may sacrifice himself | ✅ **landlord of the hill flat** (Ambedkar Nagar), husband of `npc_owner_aunty`. Act 4 base protector. Shanthamma stays the Act 0 PG owner |
| **Deepa** | lab worker, key to the cure, guilt, gets infected — player must save her | ✅ (already HIVR, hill neighbour). **Bitten early in Act 4**; medicine runs slow her turning; her knowledge = cure/treatment *for early exposure only* (turned infected stay incurable, ADR-34) |
| **Karthik** | startup dreamer, optimist; wants to evacuate; if not convinced, leaves and is never seen again | ✅ hill neighbour; evacuate voice |
| **Priya** | software engineer, pragmatic fighter; wants to take the fight to the source; closest ally if trust built | ✅ **user's Priya keeps the name** as fight-back ally (supersedes my "Sameer" placeholder). **Dating-app match renamed "Tanvi"** (`npc_tanvi`) |
| **Raju** | chai wallah, 60s, knows everything; info hub, secret routes; may get trapped → rescue | ✅ **hill/office-lane chai wallah** (distinct from airport chai Anna, whose fate is infected). Survivor info hub; rescue mission |
| **Kumar** | auto driver from the airport; if saved, transport through danger zones | ✅ = `npc_auto_kannada`, now **Kumar**. Rescue dilemma (chapter merge B5) |
| **Dr. Krishnamurthy**, 45 | creator of the outbreak, not a villain, tragic | ✅ Dr. Meera Krishnamurthy, 45, HIVR (origin ADR-35). "Help soldiers" → our version: regeneration ambition |
| **Major Rathore** | checkpoint commander, morally grey; may betray the player if it serves the evacuation | ✅ Vidhana Soudha checkpoint; gives supply runs; **betrayal is a branch in the Evacuate ending**. Fictional individual, not an institution |

## 2. Zone levels (Tiled tile property `infected_level`, derived from district `stability`)
| Level | Name | Stability | Encounter rate | Visual | Audio (ADR-29) |
|---|---|---|---|---|---|
| 0 | Safe | ≥ 80 or UV | 0% | normal colours | normal ambience/music |
| 1 | Warning | 60–79 | 5–10% | slight desat, distant sirens | drone onset |
| 2 | Infected | 40–59 | 20–35% | green fog, corrupted tiles | heartbeat |
| 3 | Hot | 20–39 | 50–70% | heavy distortion, red vignette, glitch | + growls, static |
| 4 | Ground Zero | < 20, **HIVR Hebbal + Malleswaram** | 90%+ | full horror, unique variants (Host) | full layers |
Refines ADR-27's three bands into five; one number still drives everything.

## 3. Player actions — real-time on the same map (Buu's Fury-style)
| Action | Keyboard | Touch (PWA) | Effect | Energy |
|---|---|---|---|---|
| Walk | WASD/arrows | joystick | normal | low |
| Run | Shift + dir | joystick push to edge | **1.6× walk**, escapes most infected | high, drains fast |
| Crouch | Ctrl | crouch toggle | 0.5× speed, detection radius → 2 tiles | low |
| Melee | Space | B button | swing held item, knockback + **stun 2 s** | medium |
| Throw distraction | Q | throw button | noise elsewhere | item consumed |
| Use / interact | E | A button / tap | eat, medkit, talk, open | none |
| Pulse Gun (late) | Space when equipped | B when equipped | **kills** infected | 1 of 20 charges |
Unarmed melee = the shove (keeps ADR-14 spirit). Weapons only stun; **only the Pulse Gun permanently kills.**

## 4. Infected AI states (board numbers adopted)
- **Idle:** wander in zone, **0.4× walk**, detection 5 tiles.
- **Alert:** turns to player, **0.5 s growl animation (telegraph)**, then speeds up.
- **Chase:** 1.5× walk / 0.9× run; relentless **8 s**; if line of sight breaks → go to last known position → **search 3 s** → idle. **Stops at its zone boundary** (another escape valve).
- **Stunned:** falls 2 s, gets up (not dead), **faster for 5 s after (angrier)**.
- Kept from ours: packs (1 lead + 2–4), night bonus (+2 tiles, +10% speed), UV repels, Namma-rep NPC hesitation 1 s, Host can't be stunned.

## 5. Damage & detection (board tables adopted, wired to stats)
| Event | Health | Stress |
|---|---|---|
| Infected touches player | −20 | +15 |
| Grab (2nd hit within 5 s) | −35 | +25 |
| Narrow escape (adrenaline) | −5 | +10 |
| Witness an NPC get infected | 0 | +30 |
| Player state | Noise | Detection radius |
|---|---|---|
| Crouching | low | 2 tiles (64 px) |
| Walking | medium | 5 tiles (160 px) |
| Running | high | 8 tiles (256 px) |
| Fighting | very high | 12 tiles (384 px) — attracts more |
Night adds +2 tiles to each (ours). Whether a hit can infect the player stays an **open decision**.

## 6. Random encounters (Pokémon-style) — adopted with two changes (ADR-50)
Board: every 8 steps on a tile with `encounter_rate`, roll; on hit → 100 ms white flash, player frozen, spawn 1–3 infected 4–6 tiles away in ALERT→CHASE; ends when you exit the zone, all are stunned, or 30 s pass.
**Changes, and why:**
1. **Ambushes come from cover**, not thin air: spawn points must be Tiled objects tagged `cover` (behind cars, doorways, shutters). Keeps stealth meaningful and the world readable.
2. **No full freeze** — in a chase game, losing control feels unfair. Replace with the white flash + **0.5 s slow-mo + growl** (same telegraph as Alert). Pokémon feel, fair escape.
Plus: crouching halves the roll; Level 0/UV tiles never roll. Visible packs remain the main threat; ambushes are the spice.
```ts
if (stepCounter % 8 === 0 && tile.properties.encounter_rate > 0) {
  const rate = tile.properties.encounter_rate * (player.crouching ? 0.5 : 1);
  if (Math.random() < rate) Encounters.ambushFromCover(tile.properties.infected_level);
}
```

## 7. Economy tables → `prices.json` (Acts 0–3) and 4a inflation seed
**Before outbreak:** Darshini meal ₹80–150 · chai ₹20 · auto ₹100–800 · medicine ₹50–200.
**After outbreak (4a, UPI alive, inflated):** canned food ₹500 (barricaded shops only) · clean water ₹200 (checkpoints) · medkit ₹1,000 (hospital runs) · kitchen knife ₹300 (free from your own kitchen) · cricket bat ₹800 (abandoned sports shop) · flashlight ₹400 · batteries/Pulse charges ₹2,000 (checkpoint quest reward).
4b (UPI dead) → same items in `barter.json` with relative values.
**Crafting — the 4 recipes (resolves open item):**
1. **Smoke bomb** = 1 bottle + 1 cloth (breaks LOS)
2. **Noise maker** = 1 steel tumbler + stones (lure)
3. **UV torch** = flashlight + UV LED (from a phone/repair shop) + power bank (stuns/repels briefly)
4. **Bandage** = cloth (Commercial Street) + clean water

## 8. The Pulse Gun — UV escalation ladder
**Coherence:** UV lamps repel (ADR-33) → UV torch stuns (recipe 3) → **UV Pulse Gun kills** (destroys the Amrita compound in infected cells). One weakness, three tiers.
**Board: "Getting weapons from HAL"** → HAL is a real defence PSU, same risk as DRDO/IISc → the gun is assembled by a **military engineer at Major Rathore's checkpoint** from Dr. Krishnamurthy's notes; maker unnamed or a fictional "Bengaluru Aero Works". (Proposed ADR-51.)
**Five supply runs (Act 4, reuse `deliver`/`investigate` handlers):**
1. Medical supplies — abandoned hospital (the Act 3 hospital, ruined)
2. Radio equipment — telecom tower (Level 2)
3. Battery cores — electronics megastore, **parody of Reliance Digital** (e.g. "Reliable Digital") (Level 2)
4. UV emitter components — **HIVR outer campus** (was IISc) (Level 3)
5. Frequency calibration data — **Dr. Krishnamurthy's house in Malleswaram** (Level 3–4, heavily guarded; ground zero — ties origin)
→ Engineer assembles overnight (1 in-game day) → **20 shots**. Recharge only at a powered safe zone (checkpoint or underground metro generator) → generator fuel matters again (ADR-33).
**Gameplay impact:** before = run or stun only. After = the player *chooses* to fight, but every shot counts; wasting charges on wanderers when evolved ones guard HIVR is a strategic mistake. Survivor → hero arc made mechanical.

## 9. Ending axis (proposal — resolves "ending count", user to confirm) (ADR-52)
Built from board arcs (hero or deserter; Karthik evacuate vs Priya fight; Rathore's betrayal; Deepa's cure; Suresh's sacrifice):
| Ending | Path | Cost |
|---|---|---|
| **Evacuate** ("deserter") | side with Karthik + Rathore's convoy | Rathore may betray the group; Deepa left behind unless cured; city lost |
| **Hold the hill** ("survivor") | stay with Suresh's community | Suresh's sacrifice; no cure, but people live |
| **Ground Zero** ("hero") | side with Priya; Pulse Gun + Deepa's data; enter HIVR | needs all 5 runs; Ravi's state (`ravi_supported`) changes the final scene |

## 10. Supersessions logged
- ADR-14 (no combat beyond shove + run) → **ADR-48**: real-time melee that stuns only; Pulse Gun is the only kill, late and scarce.
- ADR-31/32 numbers → **ADR-49**: idle 0.4×, 0.5 s growl telegraph, chase 8 s then last-known + search 3 s, stops at zone boundary, stun 2 s + angry 5 s; detection crouch 2 / walk 5 / run 8 / fight 12 tiles; run 1.6× walk.
- Dating match "Priya" → **Tanvi**; fight-back ally = **Priya** (user's name).
