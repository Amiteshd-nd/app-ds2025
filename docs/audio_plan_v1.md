# Audio plan v1 — the sound layer for Bangalore Times

Status: **PLAN — approved with the defaults** (the user, 2026-10-17: "Take your defaults and proceed."): §9 answers = base_night is your G–C–D and Ravi's signature is the APPA ringtone; `noise` = ADR-49 tiles; no ffmpeg yet (WAV placeholders); Kenney downloads asked again at A3; order = P19 (3.3) first, then A1. Nothing below is built yet.
Extends, does not redesign: ADR-29 (state machine normal → drone → heartbeat → chase → relief, uncanny reuse, real Bangalore recordings), design system §audio (`a.bed.*`, `a.sting.*`, `a.ui.*`, `a.music.*`, crossfades 3 s approach / 5 s return), `grade(stability)` (drives audio too), ADR-63 settings (the sliders already exist: master, music, sfx, ambience, mute; Do Not Disturb), ADR-24 pacing tags, ADR-49 detection numbers, art_audio_direction §4–5 (sourcing, < 15 MB, OGG + M4A, loops ≤ 60 s).

---

## 1. What changes for you

The game stops being silent. Every place gets a sound bed made of layers (traffic, crows, a temple bell, a pressure cooker), the music sits low under it, every tap and footstep has a sound, the phone buzzes and rings, and in Act 4 the city goes quiet one layer at a time. Every sound is a named token in one manifest, so a placeholder can be swapped for a real recording without touching code. Placeholders are generated in the repo on day one, so nothing is ever silent while we wait for your recordings.

---

## 2. Architecture

### 2.1 Files
| Path | What |
|---|---|
| `src/audio/AudioSystem.ts` | The organism. The **only** code that touches Phaser's sound manager. Started once by BootScene; survives scene changes. |
| `src/audio/mix.ts` | Pure: `mixFor(ctx) → { state, bed: {token: gain}, music, duck }`. All decisions live here, so tests and the Playground read the same numbers the game plays by. |
| `src/audio/buses.ts` | Pure: bus gains from Settings (master × bus × mute; DND). |
| `src/systems/noise.ts` | Pure: the shared `noise` value (gameplay + audio), its decay, the feed table. |
| `src/data/audio/manifest.json` | token → file + bus + loop + volume + … (schema §3). |
| `src/data/audio/beds.json` | Per district: which bed layers, gains by time of day, special beds; per-layer `kind` (human / traffic / nature / machine / eerie) for the stability bands. |
| `src/data/audio/songs/*.json` | Original chiptune compositions as note data (our tiny tracker format) → rendered to audio by the pipeline. |
| `src/data/audio/synth/*.json` | sfxr-style recipes for every placeholder SFX. |
| `src/assets/_raw/audio/` | Inputs: your recordings, CC0 downloads (with a `.licence.json` sidecar each). Never loaded by the game. |
| `src/assets/audio/` | Outputs: `<token>.ogg` + `<token>.m4a` (finals), `<token>.wav` (placeholders). + `LICENSES.md`. |
| `scripts/audio-pipe.mjs` | The pipeline (§6). Node, like every other pipeline in the repo — not `tools/audio_pipe.py` (see §9, decided). Runs inside `pnpm art`; `pnpm audio` alone. |

### 2.2 How scenes talk to it — events only, never `sound.play`
```ts
gameEvents.emit('audio:cue',   { token: 'a.ui.confirm' });                       // one-shot
gameEvents.emit('audio:cue',   { token: 'a.sfx.door.metal_shutter', at: { x, y } }); // positional one-shot
gameEvents.emit('audio:music', { state: 'chase' });                              // explicit override (rare)
gameEvents.emit('audio:sting', { token: 'a.sting.fever' });                      // ducks everything, then restores
```
Most audio needs **no event at all**: AudioSystem already listens to what the game emits today — `district:entered` (bed), `time` (dawn/day/evening/night), `ui:toast`, `phone:message` / `phone:buzz`, `wallet:spent` / earned, `quest:objective` / `quest:completed`, dialogue open/advance/choice, card panels, `flag:set` (stings named in data), and the player's movement (footsteps). Data can name cues too: a dialogue node `effect.cue`, a card panel `cue`, a trigger `cue`.

### 2.3 What AudioSystem reads every 100 ms (the mix context)
`districtId`, `minute` (→ dawn / day / evening / night), `weather` (rain later; a district may force it), `stability` (0–100 per district, default 100 until Act 4's `grade()` exists), `noise`, `inSafeZone`, `chaseActive`, `nearestInfectedTiles`, `act`, the current beat's **pacing tag** (ADR-24), `dialogueOpen`, `cardOpen`, `stress`.

### 2.4 The state machine (ADR-29, extended — not redesigned)
| State | When (first match wins) | Sounds |
|---|---|---|
| `chase` | `chaseActive` | `a.music.chase`, bed −6 dB, heartbeat fast |
| `relief` | 6 s after a chase ends, or entering a safe zone | `a.music.relief`, `a.sfx.combat.escape_resolve`, bed fades back over 5 s |
| `heartbeat` | infected within 8 tiles, or pacing Engaged/Tense, or stress ≥ 70 | `a.music.tense`, heartbeat layer, tempo by proximity |
| `drone` | stability < 70, or pacing Curious | `a.music.curious` (calm + low drone) |
| `normal` | otherwise | `a.music.calm` by day, `a.music.evening` 17:30–20:00, music off at night (the city only) |
Crossfades: 3 s toward danger, 5 s back (design-system tokens `m.audio.approach` / `m.audio.return`). Music changes land on bar boundaries (songs carry `bpm` + `barBeats`). Music ducks 6 dB under dialogue and fully under a sting or a card's `cut`.

### 2.5 Buses
master → `music`, `ambience`, `sfx`, `ui`, `voice` (reserved). Settings today has master / music / sfx / ambience / mute — so: `ui` follows the SFX slider, `voice` follows master (both decided, §9; a UI slider can be added later in one line of settings data). Mute = master 0. **Do Not Disturb** mutes `a.phone.buzz_*` and `a.phone.ringtone` only — and, as the game already does, a `critical` message still buzzes (Ravi's 00:50 message).

### 2.6 Positional sources
Data, not code: an NPC ref, an object or a district names `audio: { token, radius }` (radius ≤ 12 tiles, default 8). Gain = linear falloff with distance from the player, updated every 100 ms; stereo pan by x offset (±0.6, so it never goes hard-left). Examples: chai Anna's ladle, the Darshini's coffee filter, the ward TV, the temple on the hill, Act 4 generators and UV lamps. The Playground draws them as speaker icons with their radius.

### 2.7 Noise (ADR-23 → ADR-31/49)
`noise` is a number in **tiles of detection radius** — the units ADR-49 already fixed: crouch **2**, walk **5**, run **8**, fight **12**. Every cue in the manifest may carry `noise` (a scooter rev 10, a dropped plate 6, the guitar 9, a shutter pull 7); the loudest recent sound wins, decaying back to the movement value over 1.5 s. Act 4's infected read `noise` directly; the Playground HUD preset shows it. (Your brief's 1 / 2 / 4 / 6 conflicts with ADR-49's numbers — §9 asks.)

### 2.8 Footsteps
Generated maps are images, so there is no ground-tile `surface` property to read (§9, decided): a district names a default `surface`, and a map spec may add `surfaces` rects (the pavement vs the road on Whitefield street, the gravel path in Cubbon). Surfaces: concrete, asphalt, gravel, grass, mud, puddle, metal (bus, metro), tile (indoors), wood. Four variants each, pitch ±5 %, one step per walk-cycle stride frame (so footsteps match the animation), crouch = quieter and slower, `a.sfx.player.run_breath` after 3 s of running. The ward's cast (`walkSpeed`) slows the step rate with the walk.

### 2.9 Mobile
Nothing plays before the title's "Tap to start" (`platform.audio.unlock()` — already in the platform API, today a no-op). Pause and resume with the app lifecycle through `src/platform/`; Phaser's own blur-pause stays off so a tab switch on desktop doesn't fight the platform layer.

---

## 3. Manifest schema (`src/data/audio/manifest.json`)
```json
{
  "a.sfx.player.step.tile": {
    "files": ["step_tile_1", "step_tile_2", "step_tile_3", "step_tile_4"],
    "bus": "sfx", "loop": false, "volume": 0.5, "pitchVar": 0.05, "cooldown": 120,
    "positional": false, "noise": 5,
    "tier": "placeholder", "licence": "original", "source": "synth/step_tile.json"
  }
}
```
| Field | Meaning |
|---|---|
| `files` | Basenames in `src/assets/audio/` (variants picked at random, seeded in Movie Mode). |
| `bus` | music · ambience · sfx · ui · voice |
| `loop`, `volume` (0–1), `pitchVar` (± share), `cooldown` (ms between plays) | as named |
| `positional` | true = needs `at` or a source; radius from the source |
| `noise` | detection tiles this sound adds (optional) |
| `tier` | `placeholder` or `final` |
| `licence` | `CC0` · `user-recording` · `original` — nothing else validates |
| `source` | recipe path, song path, your recording's file, or the CC0 URL |
| `uncanny` (Act 4) | `{ of: "<early token>", pitch, reverb, gapMs }` — the same file played wrong (§4.10) |

Validated in `pnpm validate`: every token used anywhere (data, code constants) exists; every file exists; every file has a licence entry in `LICENSES.md`; loop files are ≤ 60 s; total size per format < 15 MB.

---

## 4. The token list (every one gets a placeholder on day one)
Totals: about **210 tokens**. Grouped exactly as your brief; names follow `a.<group>.<name>`.

1. **Beds** `a.bed.*` — layers: `city_traffic`, `birds_crows`, `people_murmur`, `vendor_calls`, `temple_bell`, `fm_radio_window`, `pressure_cooker`, `construction`, `rain`, `wind`, `tube_light_hum` (50 Hz — Indian mains), `generator`, `silence_room_tone`, `crickets`, `dogs_distant`, `bike_single`, `sirens_distant`, `announcement_distant`, `flies`, `drip`, `groans_sporadic`, `heartbeat_bed`. Specials: `airport_interior`, `vayu_vajra_bus`, `hotel_room`, `pg_room`, `office`, `cubbon_park`, `hill_wind`, `metro_platform`, `metro_coach`, `darshini`, `ward` (new for 3.2: monitors, a trolley, the TV). The four ADR bands stay as the named presets `a.bed.normal / warning / infected / deep`.
2. **Music** `a.music.*` — `calm`, `evening`, `curious`, `tense`, `chase`, `relief`, `base_night`, `ending_evacuate`, `ending_hold`, `ending_groundzero`.
3. **Player** `a.sfx.player.*` — `step.<surface>` ×9, `run_breath`, `land`, `bump_wall`, `pickup`, `drop`, `eat`, `drink`, `sleep_in`, `wake_up`, `crouch_down`, `stand_up`, `hurt`, `stress_tick`, `low_energy_yawn`.
4. **NPCs** `a.sfx.npc.*` — talk bleeps `bleep.adult_m / adult_f / elder / kid` (pitch per NPC from a seed, so each voice is its own), `greet`, `laugh`, `shout`, `vendor_call` ×4, `crowd_murmur` (density from the NPC count). Signatures: chai Anna's whistle + ladle, Shanthamma's bangles, Kumar's auto horn, Major Rathore's radio static, Ravi's signature (§9 question 1).
5. **Vehicles** `a.sfx.vehicle.*` — auto (idle, pass, horn), BMTC bus (idle, pass, horn, door hiss, bell), scooter (start, idle, rev, pass, stall, brake, fuel-low beep), metro (approach, doors, departure, chime — an **original** chime, never Namma Metro's), siren (original, warning band only), tanker, cycle bell.
6. **UI / dialogue / phone / HUD** `a.ui.*`, `a.phone.*`, `a.hud.*` — every item in your §3.6, including `upi_success` as an original jingle and the ringtone as an original parody tune.
7. **World** `a.sfx.world.*` — every item in your §3.7.
8. **Infected & combat** `a.sfx.infected.*`, `a.sfx.combat.*` — every item in §3.8, `_ruined` variants as `uncanny` entries where they can be.
9. **City Pulse** `a.sfx.pulse.*` — every item in §3.9, all original or CC0.
10. **Stings** `a.sting.*` — `detect`, `turn`, `fever`, `lockdown_siren`, `reveal`, `ending_*`, `transition_whoosh`; plus the ones the built story already needs: 3.1's card **cut** (one hard silence, then a high ring that fades — no crash sound), the ward's tapping (3.2), the APPA ring (3.1, 3.3).
11. **Uncanny reuse (Act 4)** — `a.uncanny.chai_whistle_empty`, `phone_ringtone_street`, `vayu_vajra_announcement_loop`, `bus_bell_no_bus`, `temple_bell_off_time`: manifest `uncanny` entries over the Act 0–2 files.

---

## 5. Sourcing — what comes from where

### 5.1 Today, without anyone: original placeholders, generated in the repo
- **SFX**: a small sfxr-style synth (`scripts/audio/synth.mjs`, pure JS, no dependency) renders every SFX recipe in `data/audio/synth/` to WAV. UI blips, bleeps, footsteps (filtered noise bursts per surface), doors, beeps, horns, engines (pulse-wave hum + noise), sirens (original two-tone, not a real siren), heartbeat, tapping on glass.
- **Beds**: layered procedural loops — brown/pink noise shaped into traffic, wind, rain on tin (noise + random ticks), a 50 Hz tube-light hum with a flicker, a generator chug, crickets, a distant dog (synth bark). Short seamless loops (4–12 s) so placeholders stay tiny.
- **Music**: original compositions written as note data (`data/audio/songs/*.json`) and rendered by the pipeline: square/triangle "veena-and-flute" leads in **Mohanam** (C D E G A — warm, open) for `calm` / `evening` / `base_night`, **Mayamalavagowla** (C D♭ E F G A♭ B — the tension of its two semitone gaps) for `curious` / `tense`, a fast tabla-like noise-percussion pattern for `chase`, a two-bar resolve for `relief`. Seamless loops, bar-aligned.
Every one is `tier: "placeholder"`, `licence: "original"`.

### 5.2 Kenney audio packs (CC0, direct download — I fetch them **only after you say yes**; downloading is a step I ask about)
| Pack | Replaces |
|---|---|
| Interface Sounds | `a.ui.*` clicks, confirm, back, error, toggles, slider tick |
| UI Audio | menu open/close, switch, phone taps |
| Impact Sounds | footsteps on concrete, grass, wood, carpet (→ tile), plus thuds, plates, metal |
| RPG Audio | doors, cloth/bag zip, coins, creaks, book/page (register, clipboard) |
| Digital Audio | phone beeps, low battery, no signal, metro gate beep, ATM |
| Casino Audio | cash count, coins in/out (money_in / money_out) |
| Sci-Fi Sounds | Pulse Gun charge / fire / empty, UV lamp hum (pitched down) |
| Music Jingles | short relief / objective-done stings (re-pitched so they're ours in feel) |
Each file keeps a `.licence.json` sidecar (pack name, URL, CC0) and a `LICENSES.md` row.

### 5.3 Freesound, filtered to **CC0 only** (needs an account — you download, drop the files in `src/assets/_raw/audio/inbox/`, and I process them)
Search with the licence filter set to *Creative Commons 0*; take the top results that are ≥ 44.1 kHz and ≥ 20 s for ambience:
`india traffic horn` · `auto rickshaw` · `rickshaw horn` · `crows india` · `crow caw close` · `pressure cooker whistle` · `temple bell` · `rain tin roof` · `rain corrugated` · `thunder distant` · `diesel generator idle` · `fluorescent hum` · `dog bark distant night` · `crickets night` · `bus door pneumatic` · `bus engine idle diesel` · `scooter start` · `scooter idle` · `market crowd india` · `steel plates clatter` · `dosa tawa sizzle` · `coffee pouring` · `rolling shutter` · `metal gate creak` · `water tap running` · `flies buzzing` · `water drip cave` · `heartbeat slow`.
Freesound files without an explicit CC0 badge are skipped, even if "free".

### 5.4 Your recordings (the authentic layer — ADR-29). Shot list
How: phone in airplane mode; a voice-recorder app at its highest quality (iPhone Voice Memos → Settings → Audio Quality: Lossless; Android: a recorder that saves WAV); hold still, don't talk, 90 seconds each (I cut seamless 30–60 s loops); say the place and time into the first 3 s, then stay quiet. Two takes if a horn or a voice dominates. **Don't record**: radio or TV playing film songs or serials, real metro/airport announcements, anyone's conversation close enough to understand (privacy) — those parts become original placeholders.
| # | Where / what | When | Becomes |
|---|---|---|---|
| 1 | A Darshini counter: plates, the coffee filter, steam, the "one by two" calls from a little distance | morning rush, ~8:30 | `a.bed.darshini` |
| 2 | A Darshini from outside on the pavement (traffic + the shop) | same visit | street layer |
| 3 | BMTC bus stand — idling buses, conductor whistles, door hiss, the bell | evening, ~18:00 | `a.bed.vayu_vajra_bus`, vehicle SFX |
| 4 | Inside a moving BMTC/Vayu Vajra bus, seated (engine, AC, ticket machine beep) | any | `a.bed.vayu_vajra_bus` |
| 5 | Cubbon Park at dawn — birds, joggers' steps on gravel, no traffic | ~6:30 | `a.bed.cubbon_park`, gravel steps |
| 6 | A main road junction from the pavement — horns, autos, bikes | evening peak, ~19:00 | `city_traffic` (evening) |
| 7 | Same junction late | ~23:00 | `city_traffic` (night) + `bike_single` |
| 8 | Crows up close (a terrace or a tree with a crowd of them) | morning | `birds_crows`, the Act 4 lone crow, the flock-startle scare |
| 9 | A temple's evening bells from the street | ~18:30 | `temple_bell` |
| 10 | Rain on a tin/asbestos roof, from underneath | first heavy rain | `rain` (the ward, the hill) |
| 11 | A pressure cooker whistle in a kitchen (three whistles) | any | `pressure_cooker` |
| 12 | A residential lane — vendor calls ("soppu", "tender coconut"), a scooter passing, a gate | late morning | `vendor_calls`, `people_murmur` |
| 13 | A hill/elevated lane at night — wind, far traffic, dogs | night | `a.bed.hill_wind` (Ambedkar Nagar) |
| 14 | An auto: starting, idling while you sit in it, the horn (ask the driver — two taps) | any | auto SFX |
| 15 | Your own scooter (or a friend's): start, idle, rev, stand down | any | scooter SFX |
| 16 | A rolling shutter pulled down and up | shop closing time | `a.sfx.world.shutter` |
| 17 | Footsteps (your shoes): pavement, tiled floor, gravel, wet road | any | `step.*` (replaces Kenney where better) |
| 18 | An office floor from a desk — keyboards, AC, a printer, no voices | quiet hour | `a.bed.office` |
| 19 | A government hospital corridor or OPD waiting area from a distance (no voices close) | daytime | `a.bed.ward` |
| 20 | A diesel generator running (apartment/shop) | power cut | `generator` |
Optional bonus: a metro platform's ambience *without* the announcement (train arriving, doors) · a hotel corridor at night · chai being poured at a tea stall.

---

## 6. Pipeline — `scripts/audio-pipe.mjs` (`pnpm audio`, also inside `pnpm art`)
1. Renders synth recipes and songs to WAV (pure JS).
2. For `_raw/audio/` inputs (your recordings, CC0 files): trim silence, fade loop seams (equal-power crossfade of the last 200 ms into the first), check the loop point (RMS jump < 1 dB), normalise **−16 LUFS** (beds **−20 LUFS**), resample (SFX mono 22.05 kHz; beds mono 22.05 kHz; music stereo 44.1 kHz), export **OGG (q4 music, q2 beds/SFX) + M4A (AAC)**.
3. Updates `manifest.json` (`tier: final` for a token whose input arrived), writes `LICENSES.md` from the sidecars, and **fails** if any file has no licence entry or any licence is not CC0 / user-recording / original.
4. Reports size per format against the 15 MB budget.
Steps 2's encoding and loudness need **ffmpeg** on this Mac (not installed today; §9 question). Until it is, placeholders ship as small WAVs and recordings wait in `_raw/audio/`.

Budget (per format — a browser downloads one of OGG or M4A, never both): beds ~22 × 45 s × 24 kbps ≈ 3.0 MB · music 10 × 60 s × 64 kbps ≈ 4.8 MB · SFX ~180 × 0.5 s ≈ 1.2 MB · stings/uncanny ≈ 0.6 MB → **≈ 9.6 MB per format**. The PWA precaches the beds and music of the current act only; the rest loads on demand.

---

## 7. Playground
- **Audio** root node in the tree: every token with tier, licence and bus; ▶ play; a live meter per bus; "solo bus" (mute all but this one); a filter for `placeholder` vs `final`.
- **Location inspection**: positional sources drawn as speaker icons with their radius circle; surfaces tinted by type.
- **HUD readout preset**: the current state (normal / drone / heartbeat / chase / relief), the bed layers with their gains, the music token, the `noise` value, the stability band.
- **Movie Mode**: audio runs muted in headless runs (determinism) but the AudioSystem still makes its decisions, so the trace can assert "the bed changed" without sound.

---

## 8. Build order (your §6, mapped onto the repo's audit gates)
| Step | What | Gate |
|---|---|---|
| A1 | AudioSystem, mix/buses/noise, manifest + validator, the synth + song renderer, placeholders for **every** token, settings sliders live (remove "No audio in this build yet"), the lint test. Wire **Act 0 airport → bus** fully: airport bed, the Vayu Vajra bed, calm music, footsteps (tile, concrete, metal), chai Anna, the phone, UI, dialogue ticks, HUD. | your audit |
| A2 | Wire every built scene (0.1 → 3.2, plus 3.3 if built by then); stability bands + Act 4 states on one Act 4 test map (a copy of a pocket with `stability` sliders in the Playground). | your audit |
| A3+ | Batches: Kenney packs → your recordings → Freesound CC0, each updating LICENSES.md and the tiers. | your audit per batch |
| Tests (all steps) | manifest validation; state-machine transitions; bus volumes follow Settings; DND; noise feed values; positional falloff; no `sound.play` / `sound.add` / `new Audio(` outside `src/audio/` (a source lint test); every built scene has a bed. Existing tests stay green. Mobile smoke (unlock, background pause) stays blocked on T-018 like the rest. |
| Docs | ADR-139 (tokens + manifest + licence rules), TASKS, MEMORY, AUDIT_LOG, ARCHITECTURE, CREDITS. |

---

## 9. Decisions and questions

**Decided (engineering, delegated — logged in the ADR):**
- The pipeline is `scripts/audio-pipe.mjs` (Node, like every other pipeline here), not `tools/audio_pipe.py`; assets live in `src/assets/audio/` + `_raw/audio/`, not `assets/audio/` (rule 10: art is generated, `pnpm art` regenerates it).
- Footsteps read district `surface` + spec `surfaces` rects, because generated maps carry no ground-tile properties.
- `ui` follows the SFX slider, `voice` follows master — the settings screen already has four sliders.
- The < 15 MB budget is per format (a client downloads one).
- Your brief narrows art_audio_direction §4: CC0 / your recordings / original only (Sonniss GDC bundles, allowed by the doc, are out).

**Need your answer (drift guard — conflicts with logged decisions):**
1. **Ravi's guitar.** The brief gives Ravi a guitar riff and makes `base_night` "the lonely guitar fragment Ravi played in Act 2". In the game you bought and learned the guitar (2.3, ADR-131: lessons G, C, D, the clip for Ananya); Ravi never plays one. Recommendation: `base_night` = **your** progression from the lessons, slowed down; Ravi's signature sound = the **APPA ringtone** (it buzzes in 3.1's ambulance and rings in 3.3). Keep the guitar for Ravi instead (that would need a beat where he plays)?
2. **Noise numbers.** The brief says crouch 1 / walk 2 / run 4 / fight 6 "scaled to ADR-49"; ADR-49 says detection tiles crouch 2 / walk 5 / run 8 / fight 12, and those don't scale evenly from the brief's (4 → 8 but 2 → 5). Recommendation: `noise` **is** ADR-49's tiles, one scale, no conversion.
3. **ffmpeg.** Loudness, OGG and M4A need ffmpeg on this Mac (`brew install ffmpeg`; it's a build tool like Audacity, never shipped). Install it yourself, or let me ask before running the install? Until then placeholders ship as WAV.
4. **Kenney downloads.** OK for me to download the eight CC0 packs above (~60 MB of zips, into `src/assets/_raw/audio/kenney/`, gitignored zips, only the used files kept)?
5. **Order with the story.** Build A1 (audio, Act 0) before P19 (3.3 The Corridor), or after? Recommendation: answer the 3.3 draft first, build P19, then A1 — or tell me to run A1 now while you think about 3.3.
