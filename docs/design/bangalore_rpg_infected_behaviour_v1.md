# NAMMA OUTBREAK — The Infected: Behaviour & Appearance v1.0
> Source: user's "The Infected" board (2026-10-11), refined. Supersedes parts of ADR-23 and ADR-28 (see §6).
> Design goal: **escapable but never comfortable.** Light combat = tension, not focus.

## 1. Movement & Chase (numbers from user's board, kept)
| State | Speed | Notes |
|---|---|---|
| Wander (idle) | 0.5× player walk | random walk inside own infected zone; twitchy anim (+50% frame rate) |
| Sprint (on detect) | **1.5× player walk / 0.9× player run** | you can outrun them, *barely* |
| Player run | costs **energy** | energy pips = `stamina` stat (3→8 via gym/sports, profile §2). Empty → forced walk 3 s |
So the gym and sports grounds in Acts 1–2 are literally training for Act 4. (Ludonarrative harmony.)

## 2. Detection & Pursuit
| Rule | Value | Refinement (ours) |
|---|---|---|
| Detect radius | **5 tiles (160 px)** day | 7 tiles at night; + `noise` adds up to 4 tiles (scooter, guitar, plates, running) |
| Pursuit | relentless within infected zone | **Escape valves** so "relentless" doesn't mean "unfair": break line of sight 6 s → they lose you; enter safe zone; close a door/shutter; throw a noise item (steel tumbler, phone alarm) to divert |
| Packs | **where there's one, 2–4 more nearby** | a pack is 1 visible "lead" + 2–4 idle in cover. Lead's detection sting alerts the pack within 8 tiles. Teaches the player: spotting one = leave |
| Day/night | active always, **more dangerous at night** | night: radius +2, sprint +10%, spawn density +50%. Pairs with ADR-25 lighting — darkness is the threat |

## 3. Safe Zones — UV street lights (user's in-world explanation, kept and grounded)
- Military/BBMP install **UV lamps** around relief camps and bases; infected won't cross UV light.
- **Why it's coherent with our virus:** it mimics *Ophiocordyceps* — a fungal-behaviour pathogen. Fungi hate UV; hosts become photophobic. One line from Ravi or the News app explains it.
- **Gameplay link:** UV lamps run on **generators → need fuel**. The scooter fuel system (ADR-06) becomes base defence in Act 4: fuel you scavenge either moves you or keeps your base lit. Real trade-off, existing system.
- Visual: UV glow is purple → echoes the Purple Line metro pillars. Sunlight is natural UV → daytime infected cluster in shade, under flyovers, inside metro stations (makes underground/covered places scary).
- Lamps can fail (power cut condition) → a safe zone becomes unsafe for a night. Scripted once per base to force relocation (base chain).

## 4. Appearance Stages (driven by days since that district fell, not global act)
| Stage | Look | Behaviour |
|---|---|---|
| **Fresh** | almost human: office clothes, kurtas, auto-driver khaki, nurse scrubs. Recognisable citizens. Disturbing. | wander + basic chase |
| **Degraded** | clothes torn, skin greying, erratic movement (infected recipe steps 1–7) | + pack behaviour |
| **Evolved** | faster, pack-hunting, glowing eyes (1px Lights2D) | sprint 1.0× run on long chases; flank in pairs |
| **Special — "Host"** | near **HIVR, Hebbal** (the source zone): larger, tougher, glowing eyes, fungal growth on shoulders | can't be shoved; slow but blocks routes; one per source-adjacent district |
Change from board: **IISc → HIVR (fictional)**. Using a real institute as the virus source is a legal and reputational risk; HIVR in Hebbal is already our origin and the first district to fall (Story v1).
Bonus: the first Host is `npc_hivr_guard` from Act 3 — the guard who waved Ravi through. The player recognises him.

## 5. Former NPCs — "They can't be saved" (strongest emotional beat on the board)
- Every named NPC gets an `infected_fate` field: `survives | infected:{district, stage} | missing`.
- Examples: **chai Anna (airport)**, Shanthamma's cook, the Kannada auto driver's colleague, the pedestrian who gave directions in Scene 1.1, a PG tenant, the gym trainer.
- They keep their **exact clothes and props** (Anna still has his kettle). Name tag appears faintly when you get close.
- **Reputation payoff (ADR-26):** NPCs you reached *Namma* with **hesitate for 1 s** before attacking — a flicker of memory. Rewards Acts 1–2 relationships, breaks the player's heart, gives a real escape window. Never curable.
- City Moments / Gallery: Act 1 photos featuring now-infected NPCs show a small grey mark. No text.
- Hard rule: **Ananya, Ravi, Amma are never on this list** without an explicit story decision (open: can main characters be infected?).

## 6. Supersessions
- ADR-23 (two tiers wanderer/cluster) → superseded by ADR-31: four stages + packs + Host.
- ADR-28 movement (T1 0.6×) → superseded by ADR-32: board's 1.5× walk / 0.9× run sprint, 0.5× wander; animation +50% kept.

## 7. Engine
`src/systems/InfectedAI.ts` — states: `wander → alert → chase → search → wander`. Inputs: distance, LOS (tilemap raycast), `noise`, time of day, `inUV(tile)`, pack id. EasyStar for chase pathing, recomputed every 500 ms (mobile perf). Spawns from `districts[].stability` (ADR-20).
