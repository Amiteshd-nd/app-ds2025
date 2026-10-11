# NAMMA OUTBREAK — Art & Audio Direction v1.0
> Source: user's Art Direction + Audio board (2026-10-11), mapped onto our acts and systems. Companion to `art_pipeline_v1.md` (how assets are made) — this file is *how the game looks and sounds over time*.

## 0. Act mapping (board chapters → our acts)
| Board | Ours | Driver |
|---|---|---|
| Ch 1–2 Normal Bangalore | Acts 0–2 (arrival → scooter, metro, dating app) | `stability` 100–80 |
| Ch 3 The Turn | late Act 2 → Act 3 (fever Reels, Ravi breakdown, accident, hospital) | 80–40, drains district by district |
| Ch 4–5 Outbreak | Act 4 (lockdown → falls → Lalbagh) | <40 per district; 0 = fallen |
Key rule (ADR-27): **visual and audio grading is driven by each district's `stability`, not by act number.** So Hebbal can look "turned" while Whitefield still looks normal — the slow burn is visible on the map as you travel. One number (ADR-20) drives art, audio, NPC density and infected density.

## 1. Visual Style Progression
| Stability | Palette | NPCs & world | Tiles |
|---|---|---|---|
| 100–80 Normal | warm earth tones, greens, sunlit; Zelter muted base | bustling, vehicles moving, shop lights on | clean |
| 80–40 The Turn | saturation −20% (linear with stability) | fewer NPCs, some shutters down, masks appear, fever-clip billboards | first cracks: road cracks, broken glass, overflowing bins |
| <40 Infected zone | heavy desaturation (−50%), green tint, fog overlay | NPC population drastically reduced; infected spawn = 1 − stability | overturned vehicles, fire scorch, barricades (`_ruined` atlas) |
| Safe zone (any base) | **warm but dim**: candle, generator, phone torch (Lights2D) | survivors only | barricaded doors, crafting stations |
Implementation: one post-process shader uniform per district (`saturation`, `tint`, `fog`) lerped from stability; `_ruined` atlas swap at <40. Supersedes the flat "desaturate 30%" in art pipeline §5.8 → now graded 0/20/50%.
**Gore is MINIMAL** — imply, don't show (2–3 stain pixels max, fade-to-black for deaths). Consistent with ADR-08 (16+).
Bangalore touches for The Turn: rain-trees drop leaves out of season, Nandini milk booths shuttered, "Work From Home Again?" hoarding, empty Darshini stools stacked.

## 2. Infected Sprite Recipe (automated in `tools/asset_pipe.py --infected`)
Applied to any NPC/ambient base — no new art (ADR-14 reuse).
1. Desaturate 50%
2. Green tint on skin-palette indices only
3. Remove 5–10 random clothing pixels (holes/tears), seeded per NPC
4. Eyes → white/yellow
5. 2–3 dark-red stain pixels
6. Shift body 1–2 px sideways (off-balance posture)
7. Walk **animation** frame-rate +50%
Tier mapping (ADR-23): **T1 wanderer** = steps 1–7, *movement* speed 0.6× player → twitchy frames, slow body = unsettling. **T2 cluster ("evolved")** = + glowing eyes (1px Lights2D point light), movement 0.9×.
Note on step 7: faster frames ≠ faster movement. Keep T1 escapable on foot (light combat = tension, not focus).

## 3. Sound Design — Infection Progression (audio state machine)
| Context | Sound | Implementation |
|---|---|---|
| Safe / normal zone | Bangalore ambience: traffic + auto horns, birds/crows, temple bells, pressure-cooker whistles, TV/FM Kannada radio, vendor calls | looping ambient bed per district |
| Approaching infected zone | ambience fades, low drone, occasional distant scream | crossfade 3 s, triggered by stability gradient at district edge |
| Inside infected zone (stability 40–20) | heartbeat pulse, metallic creaks, dripping, wind through broken windows | replace ambience entirely |
| Deep infected (<20) | intense heartbeat, growling, footsteps that aren't yours, **radio static** (Pontypool nod) | add layers |
| Infected detects player | sharp sting (violin screech / metal crash) → chase music | one-shot + loop |
| Chase | fast chiptune, dissonant notes, drums matching heartbeat | overrides area music |
| Return to safe zone | relief sigh, warm music fades in | crossfade 5 s |
Our additions:
- **Uncanny reuse**: Act 1–2 comfort sounds return wrong in Act 4 — a pressure-cooker whistle in an empty flat (lure), temple bells at 3 AM, a phone ringing Amma's ringtone. The plate-banging at 5 PM is the first-wave trigger (ADR-10) — the loudest moment in the game.
- **Noise = aggro** (ADR-23): scooter engine, guitar, plates, running feed a `noise` value the infected AI listens to. Audio and gameplay share one variable.
- `AudioSystem` reads `stability`, `noise`, `inSafeZone`, `chaseActive` → picks state; all transitions are crossfades (Phaser Sound + WebAudio gain).

## 4. Audio Sourcing (free commercial licences only)
| Need | Source | Licence |
|---|---|---|
| Real Bangalore ambience | **Record it yourself on phone** (Darshini, bus stand, Cubbon morning, rain on tin roof, temple) — unique, free, authentic | yours |
| SFX gaps | Freesound (filter CC0), Kenney audio packs, Sonniss GDC bundles | CC0 / royalty-free |
| Chiptune music | BeepBox, FamiStudio, Bosca Ceoil | free tools, outputs yours |
| Mixing/cleanup | Audacity | GPL tool, outputs yours |
Format: OGG + M4A fallback, ambience loops ≤ 60 s, total audio < 15 MB for PWA.

## 5. Loop & pacing tie-in
Calm = normal ambience · Curious = drone onset · Engaged/Tense = heartbeat layers · Reward = relief sigh + warm fade (ADR-24). Audio is the cheapest way to sell the pacing curve.
