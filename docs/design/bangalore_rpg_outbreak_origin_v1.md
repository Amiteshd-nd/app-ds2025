# NAMMA OUTBREAK — Outbreak Origin Bible v1.0
> Merges the user's "Origin Story" board (2026-10-11) into the LOCKED story (story_script_v1). Our spine stays: Ravi, HIVR, agri origin, negligence-not-villain, slow burn, Hebbal first. The board supplies the science, patient zero, the spread mechanism, the cover-up and personal connections.

## 1. What happened — the science (board, adapted)
- **Project Amrita** at **HIVR, Hebbal** (fictional). Name kept: Amrita = nectar of immortality.
- Official goal (ours, ADR-04): an agri biocontrol agent that **mimics *Ophiocordyceps*** — makes crop pests climb away from the crop and die.
- **Board's science, adopted:** in mammal trials the agent also **restarts activity in dead/damaged cells**. Lead scientist **Dr. Meera Krishnamurthy** (= existing `npc_meera`, HIVR director) — brilliant, obsessive — quietly pursued a **human tissue-regeneration** application with a private pharma partner instead of halting the trials. Ambition, not villainy (ADR-03 holds).
- **What it does to people:** it doesn't heal — it hijacks. Brain stem reactivates, **prefrontal cortex stays dead** (personality, decision-making, empathy gone); what remains is limbic: aggression, hunger, pursuit. Tissue keeps repairing → they don't die, they "just keep going" (Ravi's line in 3.3 now has science behind it).
- **Fungal-mimic → photophobic** → UV safe zones (ADR-33). One coherent rule set.
- **Changed from board:** DRDO → private pharma partner (no real defence/government org as source); IISc → HIVR (ADR-34).

## 2. The breach — Ravi causes it, Vikram is patient zero (merge)
Board: research assistant Vikram cuts himself on a contaminated slide, rainy Thursday night shift, goes home feverish to his PG in Malleswaram.
Ours: Ravi takes Appa's call in the containment corridor and skips the glove-change station (Scene 3.3, locked).
**Merged chain:** Ravi, distracted after the call, leaves a contaminated slide tray unsealed → **Vikram** (contract research assistant, same night shift) cuts his hand on it → Vikram goes home to his **PG in Malleswaram** with a fever.
- Ravi is the cause (ADR-09 spirit), not the infected — explains why he survives to tell the story, and deepens the guilt.
- Flashback 3.3 gains one silent frame: next morning, Vikram's locker, his raincoat still dripping.
- Timing: the breach happens **in the player's first week** (rainy Thursday). That's why fever Reels appear in Scenes 1.4 / 1.6 (already in story v1).

## 3. Spread — slow burn made plausible
Board spread is fast (Friday = warzone). Our story needs months. Reconciled:
| Phase | When (our acts) | What |
|---|---|---|
| Incubation & misdiagnosis | Acts 1–2 | Vikram's roommates fall ill over weeks, not hours (long incubation). Hospitals log **"acute viral encephalitis"**. Patients isolated → the cover-up *works* for months. News breadcrumbs (story 2.7): *mystery fever → HIVR denies leak → ward sealed at Hebbal → Yelahanka schools shut*. |
| Monsoon tipping point | Act 3 (player in hospital) | Heavy rain; open storm drains (rajakaluves) and flooding carry the agent across North Bangalore. **Malleswaram vegetable market** becomes the first public warzone — seen by the player on the **hospital ward TV / Reels**, not played. |
| Admission of truth | Act 3 end → Act 4 | Government finally admits it; by then it has **crossed the Outer Ring Road**. Lockdown + 5 PM plates (ADR-10). |
**Gameplay echo:** rain + waterlogged tiles = infection risk in Act 4 (stats §3) now has a canonical reason. Monsoon days raise infected spawn.

## 4. Fall order (amended, flag for user)
Locked: Hebbal → Yelahanka → Yeshwantpur → Majestic → MG Road/Cubbon → Indiranagar → Whitefield.
**Proposed:** **Hebbal + Malleswaram (ground-zero pair)** → Yelahanka → Yeshwantpur → Majestic → MG Road/Cubbon → Indiranagar → Whitefield. Malleswaram = non-metro district reached from Yeshwantpur; Act 1–2 visitable for the 18th Cross market and a filter-coffee City Moment, so its fall hurts.

## 5. The cover-up (board, adapted)
- Official label: "acute viral encephalitis". Lockdown of **HIVR campus + Hebbal + Malleswaram** (was IISc + Malleswaram).
- Delivered entirely through the **News app, Reels, ward TV and NPC chatter** (World War Z / Feed method, story v1 refs). No exposition dumps.
- Investigate missions (ADR-18) let the player collect the truth as **clues** (ADR-19-era clues system): a leaked memo, Deepa's shift log, a pharma partner's logo on a cold-chain box (the airport HIVR man, Scene 0.1 F6 — payoff!).

## 6. Why it's personal (board, adapted to our cast)
| Board | Ours |
|---|---|
| Company where the player interviews has IISc as a client | The player's **IT firm builds HIVR's lab inventory / sample-tracking software**. In Act 2 the player sees a data anomaly ("Batch AMR-07: status overwritten") — an investigate thread and a clue. The player's own code is in the cover-up's paper trail. |
| PG-mate on night shifts at a biotech firm — contract lab assistant at the facility | **Deepa** (`npc_deepa`, T2→3; was "Deepa"): contract lab assistant at HIVR, night shifts, lives in the player's building on the Ambedkar Nagar hill. Vikram's shift partner. Friendly in Act 1; goes quiet in Act 2; disappears before the accident. Act 4 `infected_fate`: open (survivor with the truth, or a recognisable infected on the hill — user to decide). |
| — | Ravi (locked) remains the main personal link. Three threads now point at HIVR: Ravi (cause), Deepa (witness), player's employer (paper trail). |

## 7. New/changed NPCs
| ID | Role | Tier | First seen |
|---|---|---|---|
| `npc_meera` | **Dr. Meera Krishnamurthy**, HIVR director, Project Amrita lead | 3 | 2.7 / 3.x (existing, now named + motivated) |
| `npc_vikram` | Contract research assistant, patient zero | 2 | 3.3 flashback only (+ Malleswaram PG in Act 4 as recognisable infected) |
| `npc_deepa` | Contract lab assistant, hill neighbour | 2→3 | 1.4 Ambedkar Nagar |
