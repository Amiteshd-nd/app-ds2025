# Need to audit

Everything built and waiting for your audit, oldest first. Each item has what it is, how to check it, and the calls I made that you may want to overturn. When you audit, tell me per item: **approved**, or what to change. "Approved, push" approves everything listed and pushes.

Full detail for each item is in `AUDIT_LOG.md` (its "built, awaiting audit" entry) and `DECISIONS.md` (its ADR).

**How to check anything:** run the Test Playground, open the tree, pick the scene, then **Play** to play it yourself or **▶ from here** to watch the bot play it. **▶ PLAY** in the bar plays every built scene in order.

```bash
corepack pnpm playground
```
It opens at http://localhost:6175/playground.html. To run the whole thing headless instead (it says 22/22 when everything passes):
```bash
corepack pnpm movie
```

## Status

| # | Item | Built | Where it is | Status |
|---|---|---|---|---|
| 1 | Movie Mode step 3: walkthroughs generated for every scene, the full movie | 2026-10-17 | on GitHub | waiting |
| 2 | Movie Mode step 4: headless `pnpm movie`, two runs must match | 2026-10-17 | on GitHub | waiting |
| 3 | P12 · 2.3 "Guitar" (ADR-131) | 2026-10-17 | on GitHub | waiting |
| 4 | P13 · 2.4 "IKEA Run" (ADR-132) | 2026-10-17 | on GitHub | waiting |
| 5 | P14 · 2.5 "Ravi, 1 AM" (ADR-133) | 2026-10-17 | on GitHub | waiting |
| 6 | P15 · 2.6 "The App" (ADR-134) | 2026-10-17 | on GitHub | waiting |
| 7 | P16 · 2.7 "Breadcrumbs" (ADR-135), Act 2 complete | 2026-10-17 | on GitHub | waiting |
| 8 | P17 · 3.1 "Outer Ring Road" (ADR-136), Act 3 opens | 2026-10-17 | on GitHub | waiting |
| 9 | P18 · 3.2 "Ward 4" (ADR-137) | 2026-10-17 | on GitHub | waiting |
| 10 | P19 · 3.3 "The Corridor" (ADR-138) | 2026-10-17 | on GitHub | waiting |
| 11 | Audio A1 · the sound system plus Act 0, airport → bus (ADR-139) | 2026-10-17 | on GitHub | waiting |
| 12 | Audio A2 · every scene, footstep areas, the Act 4 test bench (ADR-140) | 2026-10-17 | on GitHub | waiting |
| 13 | Audio A3 batch 1 · Kenney's real sounds replace 60 placeholders (ADR-141b) | 2026-10-17 | on GitHub | waiting |
| 14 | P20 · 3.4 "Three Nights, Again" (ADR-142) | 2026-10-17 | on GitHub | waiting |
| 15 | P21 · 3.5 "Discharge" (ADR-143) — Act 3 complete | 2026-10-17 | on GitHub | waiting |
| 13a | HUD settings gear + Playground mute/volume (ADR-141a) | 2026-10-17 | on GitHub | waiting |
| 16 | Act 4 S1 · the stability dial (ADR-144) | 2026-10-17 | local commit, not pushed | waiting |
| 17 | Act 4 plan defaults you took (`docs/act4_systems_plan_v1.md` §8) | 2026-10-17 | local commit, not pushed | waiting |
| 18 | Act 4 drafts 4.0 → 4.end (six stubs, your calls) — defaults taken | 2026-10-17 | local commit, not pushed | waiting |
| 19 | Act 4 S2 · the run (ADR-145) | 2026-10-17 | local commit, not pushed | waiting |
| 20 | Infected sprites step 1 · three bases (ADR-146) — defaults taken | 2026-10-17 | local commit, not pushed | waiting |
| 21 | Infected step 2 (the recipe) + the Evolved (ADR-147) | 2026-10-17 | local commit, not pushed | waiting |

Already approved (not listed above): P0–P11, Movie Mode plan and step 2, the 3.2 hill-flat re-scale, the ceiling fans removed.

---

## 1. Movie Mode step 3: every scene as a walkthrough
- **What:** `scripts/generate-walkthroughs.ts` writes a bot script for every built scene from its quest, places and dialogue. ▶ PLAY plays them all in story order through the real game.
- **Check:** ▶ PLAY in the Playground bar, then open **Report** to see every step, why it was taken, and screenshots of failures.
- **Calls to confirm:** the bot never cheats (no `set_flag`); it haggles like a careful player (Shanthamma ₹14,300, the hill flat ₹19,900); a few optional flags stay unplayed on purpose (`scooter_ridden`).

## 2. Movie Mode step 4: the headless run
- **What:** `corepack pnpm movie` plays every scene in a hidden browser and exits with an error if any scene fails. `--twice` plays everything twice in fresh pages and checks both runs match exactly. `--scene <id>` starts from one scene.
- **Check:** `corepack pnpm movie --scene act3_ward4` takes about 2 minutes. The latest full double run gave 20/20 with an identical 463-step trace.
- **Calls to confirm:** each scene's starting state comes from the Playground's prerequisites, not from the scene before it, so a scene can run alone. Starting from a beat doesn't complete earlier objectives.

## 3. 2.3 "Guitar"
- **Check:** it starts on Church Street. Find the shop between the two pots (owner behind the counter, ₹6,500, chord chart), tip the busker (₹10 makes the G lesson easier), take the 335-E home. In the flat, step in front of the guitar for the rhythm lane (E / Space / tap STRUM), one lesson a night. After D, the clip for Ananya.
- **Calls to confirm:**
  - The shop is 12×8 tiles, smaller than other interiors so the counter stays in reach.
  - The shop's name is shortened to "Guitar shop" because the full name collided with the wallet plate.
  - A failed lesson still uses up the night.
  - The lesson card is plain, with no guitar picture.
  - The guitar on your back isn't drawn.

## 4. 2.4 "IKEA Run"
- **Check:** it starts at Majestic.
  - Walk the uncle to the Green Line stairs, then take the coach.
  - At Hyggeland: the tags, the café, and the aisle. A fifth box says "Not enough space".
  - The tills, then the ride home, where an aunty helps.
  - The hill bus charges ₹10 a box.
  - In the flat, the manual has one wrong step. The shelf, lamp and rug appear; the table stays folded.
- **Calls to confirm:**
  - The coaches reuse the Purple Line art, with no green stripe.
  - Boxes are paid at the aisle, and the till only checks you out.
  - The BOXES plate uses the bus icon.
  - Sameer's "Typical." line (for forgetting the shoe rack) isn't in.
  - The staff, café and tills share one sprite.

## 5. 2.5 "Ravi, 1 AM"
- **Check:** it starts in the flat at 00:50 during a power cut.
  - The night auto from the hill road costs ₹160, and the bus says "Last bus left at 11".
  - The office gate is in moonlight blue.
  - Ravi at the shuttle shelter: sit with him, give ₹2,000, both, or leave.
  - Night auto home. A morning message arrives only if you helped.
- **Calls to confirm:**
  - The bot always leaves Ravi; the helping paths are covered by tests.
  - The night look is a flat tint, so lamps aren't brighter.
  - Ravi stands rather than sits.
  - The crowd is empty everywhere at night.

## 6. 2.6 "The App"
- **Check:** it starts in the flat at 10:00.
  - On the phone, Jodi: NOPE on all four profiles ends it, LIKE on Tanvi is a match.
  - Bus to Whitefield, then **Maps (M) → tap Church Street → METRO** to the café (pay ₹480, ₹240, or she pays).
  - Maps to Cubbon. Ananya near the bandstand; every answer leaves her "strained".
- **Calls to confirm:**
  - "Uninstalls after a week" happens the next night.
  - The bot always matches.
  - The portraits are in colour on the green phone screen.
  - Ananya stands near the bandstand, not on it.

## 7. 2.7 "Breadcrumbs" (Act 2 ends)
- **Check:** it starts in the flat at 21:00.
  - Each sleep adds a News headline and a Reel.
  - Day 2: Sameer is absent and Divya texts about AMR-07. Day 3: the guard salutes nobody. Day 4: Sameer is back.
  - Home: Amma at the door, then sleep, and Act 2 ends.
- **Calls to confirm:**
  - The guard salutes whenever you arrive that day.
  - The rice argument is a Reel.
  - The headlines say four weeks, but only four in-game days pass.

## 8. 3.1 "Outer Ring Road" (Act 3 opens)
- **Check:** to see the title card, play 2.7's last sleep: a big FEVER with "ACT 3" small under it, then Divya's text and a fifth headline. The scene itself starts at the office gate at 09:20.
  - Talk to Divya, then walk into the office door. The card sequence plays (E / tap = next panel): the HIVR day, the AMR-07 overwrite at 02:14 by `night_ops`, the Hebbal junction picture, the cut (one white frame, none if your device asks for reduced motion), the ambulance fragments (green lanyard, APPA), "Ravi.", and it lands in the ward.
  - To see Sameer's bike instead of your scooter, set `scooter_owned` off in the Playground's inspector.
- **Calls to confirm:**
  - FEVER is the big word.
  - E / tap moves one panel at a time; there is no skip-all.
  - The wrecked scooter's EMI and fuel aren't settled.
  - The HIVR day costs no food and adds no stress.
- **Fixed on the way:** Divya's late-day-one message blocked all her later messages for players who were on time.

## 9. 3.2 "Ward 4"
- **Check:** it starts in the ward at 10:20, or play 3.1 to its end.
  - You walk slower and can't run.
  - The phone has messages from Amma, Sameer and Divya.
  - Sister Lalitha at her desk (she remembers you only if you talked on the Cubbon bus), and the red line.
  - Top right, the isolation door: dark behind the glass, with tapping. The TV on the left wall. The tray by your bed (food, once).
  - The ward door: a ward boy says "Not discharged."
  - Ravi, three times, ending on "Appa called. I answered."
- **Calls to confirm:**
  - The patients only have a one-line look.
  - The tapping is text only for now; audio is coming.
  - The cast isn't drawn on you.
  - The three Ravi talks can be done back to back.
  - The ward boy is text, not a character on screen.

## 10. 3.3 "The Corridor"
- **Check:** it starts in the ward at 11:00.
  - Ravi → "Tell me." → the HIVR corridor as Ravi, with only the objective on screen.
  - The clipboard by the airlock. Appa's call as you cross the middle ("Ignore" greyed out: "It's Appa."). The glove station refuses.
  - The tray in the slide room, then the closing card: the clipboard, four ant pictures, Ravi's line, Vikram's locker. Back in the ward at 18:30.
- **Calls to confirm:**
  - The call always comes before the glove station.
  - Appa's lines appear under a "RAVI" name tag (one speaker per conversation).
  - I wrote the ant captions myself.
  - The corridor has a fixed night shade to keep its cold light.

## 11. Audio A1: the game has sound
- **What:** every sound is a named token (224 of them) with an original placeholder generated in the repo. They sound like 8-bit placeholders until your recordings and CC0 files replace them.
  - Every place plays a layered "bed" of city sounds by time of day.
  - Music sits under the city: calm by day, a warmer tune in the evening, none at night or in rooms and buses unless the mood turns.
  - Footsteps, menus, the phone, dialogue bleeps in each character's voice, money and objective chimes all make sounds.
  - Some sounds come from where they are and fade as you walk away: at the airport, chai Anna's whistle and ladle, the cab tout, and the bus at the stop.
  - The 3.1 crash card cuts to a ring in the silence, and Ravi's phone plays the APPA ringtone.
- **Check:** run the game, click once on the title (browsers only play sound after a click), and play 0.1. At the airport, listen to the hall and kerb, walk to the chai stall, talk to chai Anna (the music dips), take the bus (the bus engine during the ride card), and arrive at Whitefield (birds and light traffic in the morning). Try Settings → Audio: each slider and mute should work.
```bash
corepack pnpm dev
```
  It opens at http://localhost:6174.
- **Calls to confirm:**
  - Music is off at night and in rooms.
  - The NPC voices (man, woman, elder, kid) are my guesses.
  - The airport is mixed as hall plus kerb.
  - Interface sounds follow the SFX slider.
  - Footsteps don't change between pavement and road within a place yet (that's audio step A2).
  - Offline, a sound plays only after it has played once online.
- **Your homework for later steps:** the recording list in `docs/audio_plan_v1.md` §5.4 (20 short recordings). Also: install ffmpeg, and OK the Kenney downloads when we reach A3.

## 12. Audio A2: every scene, footstep areas, the Act 4 test bench
- **What:**
  - **Sounds from a spot in 19 of 21 places:** the Darshini's plates and dosa tawa, a pressure cooker, the hill chai stall, the ice-cream bell, the busker, metro gates, the coach doors, the ward TV, the corridor's fume hood.
  - **Footsteps follow the ground:** pavement versus road on Whitefield, and gravel paths, grass and stone in Cubbon.
  - **Guitar lessons** sound like a guitar.
  - **Vehicles:** buses honk and hiss as they pull in, and every ride starts with a sound.
  - **Key lines have sounds:** the ward's glass tapping, the TV, and the APPA ring in the corridor.
- **Check in the game:** walk Whitefield from the pavement onto the road, walk Cubbon's paths and lawns, play a guitar lesson in the flat, and wait for a bus at Whitefield.
- **Check in the Playground:** click **Audio** in the tree, then:
  - Press ▶ on any sound.
  - Watch the bus meters, or pick one bus to hear it alone.
  - Press **Open the test map**, click the game once, and drag **Stability** from 100 to 0. The people go first; then it's wind, flies and one crow; at the bottom, a heartbeat and groans.
  - Slide **Infected** closer to hear the heartbeat rise. Tick **Chase** for the chase music, and untick it for the relief chord.
  - In any map's Layer lines, tick **Sound sources + footstep surfaces** to see the speakers and their hearing range.
- **Calls to confirm:**
  - Which places got which sounds (my picks).
  - The busker only plays G and C.
  - People get half as loud at "warning".
  - The "uncanny" chai whistle is the real one, slightly flat, with a long gap.
  - Cubbon's path areas are rectangles over curved paths, so a few steps at the curves sound wrong.

## 13a. HUD settings gear + Playground mute/volume
- **What:** a gear on the HUD, top-right just left of the phone button, that pauses the game into the menu (Settings is one tap further). In the Playground toolbar: 🔊/🔇 mute, and − / + master volume in steps of 10.
- **Check:** in the Playground, play any scene and tap the gear (try **Accessibility → Larger text** too, and 3.3 "The Corridor", where the clock is hidden but the gear stays). Use 🔊 − + in the toolbar and open **Settings → Audio** in the pause menu: it shows the same values.
- **Calls to confirm:**
  - The gear opens the pause menu rather than going straight to Settings.
  - A 16px gap between the gear and the phone; the clock moved left to make room.
  - The gear stays visible in the corridor.

## 13. Audio A3 batch 1: the first real sounds (Kenney, CC0)
- **What:** 60 sounds are now real recordings from Kenney's free packs: menus, phone, HUD, footsteps on six surfaces, doors, plates, coins and cash, pickups, and the Act 4 combat sounds. Background beds, music, vehicles and voices are still placeholders until your recordings and Freesound files arrive.
- **Check:** play anything and listen to the menus, phone and footsteps. In the Playground's Audio node, the token list shows `final · CC0` for these.
- **Calls to confirm:**
  - Gravel footsteps are Kenney's snow steps (they crunch).
  - Road footsteps reuse the concrete set.
  - The money sounds are casino chips.
  - The title, UPI and ringtone jingles stay ours (original).
- **Still needed from you:** the 20 recordings (`docs/audio_plan_v1.md` §5.4). Optionally, ffmpeg (`brew install ffmpeg`) to shrink the files.

## 14. 3.4 "Three Nights, Again"
- **What:** the first week at the hotel, played backwards. Three nights in the ward with the hotel's countdown plate ("Discharge · 3 nights"); each morning the world is quieter.
- **Check:** in the Playground, pick Act 3 → 3.4 (it starts in the ward at 18:30).
  - Talk to Sister Lalitha: "Three nights…", and the plate appears.
  - Sleep in your bed (the zone at its foot). Morning 1: News has the curfew, the TV ticker matches, and Ravi says they took his phone.
  - Sleep again. Morning 2: Amma's message, then her call as you step into the aisle (two kind answers). The woman's bed is empty, the isolation door no longer taps, Ravi coughs, UPI says "Server busy", and the ward sounds thinner (fewer horns, distant sirens).
  - Sleep again. Morning 3: "Discharge · today", no signal, and Ravi's bed is stripped with the IV line on the floor. The nurse says "Moved. Another ward. Don't ask me which."
- **Calls to confirm:**
  - Amma calls as you leave the bed, not the moment you wake.
  - "Server busy" is a banner only; payments still work.
  - The ward's sound stops at "warning" (no deeper) in this act.
  - The stripped bed's stripes look pale.

## 15. 3.5 "Discharge" (Act 3 ends)
- **What:** the ward lets you go too easily, and nobody explains anything.
- **Check:** in the Playground, pick Act 3 → 3.5 (it starts on the discharge morning).
  - Talk to Sister Lalitha: "Doctor signed at six. You're done." Then "Go home. Stay inside. Don't make noise after five." Ask "Why five?"; she only looks at the isolation door.
  - The countdown plate goes.
  - The isolation doors stand open on a lit, empty room (step up to them for the line about bleach).
  - The ward boy's blue chair by the door is empty, his phone left on it.
  - Walk out: the corridor, the stairs, the gate, then **CURFEW · Act 4**, which holds until 4.0 is built.
- **Calls to confirm:**
  - The hold screen's wording.
  - The plastic bag is only mentioned, not an item.
  - The isolation room is seen through the doors, not entered.
  - The slip comes on your second talk with the nurse that morning (after "Moved.").
  - Your cast stays on into Act 4.

## 16. Act 4 S1: the stability dial
- **What:** every place has a stability (0–100) that falls day by day in Act 4, and one rule turns it into five levels that decide the look, the sound and how many people are out. Act 4 also makes hunger harsher.
- **Check:** in the Playground, pick **Act 4 · stability dial**, then **▶ Open a map to look**.
  - Tick **Act 4 has begun** and slide **Day**: the list shows each place's stability and level. Re-open the map to see the crowd change (people are counted when a map opens).
  - Or tick **Hold** and slide one stability over everything: 75 (warning, slightly grey), 50 (infected, greyer, green edges), 30 (hot, a red rim, a small shake every few seconds), 10 (ground zero).
  - The Audio node's Act 4 bench slider now moves the look too.
- **Calls to confirm:**
  - The fall days: Hebbal 0 · airport 2 · Nagasandra 4 · Majestic 6 · Cubbon and Church Street 8 · Whitefield 12 · the hill 13.
  - The curve: 85 on the first day and −2 a day before a place falls, 55 on the day, −8 a day after, down to 25 (Hebbal to 10).
  - How strong each level looks, and the glitch being a small screen shake.
  - The 3.4 ward now also looks a little paler on its last two nights (its sound was already "warning").
  - Harsh hunger: half a health point a minute at empty food; sleep gives 15 health and no free food. Nothing happens at 0 health yet (that comes with step S2).

## 17. Act 4 plan: the defaults you took
- **What:** you answered the plan's eight questions with "default". They're listed here so you can overturn any of them later. Full detail is in `docs/act4_systems_plan_v1.md` §7–8.
- **Calls to confirm:**
  - **Build order:** a vertical slice. S1 the dial (built) → draft 4.0 → S2 the run → build 4.0 + 4.1 → S3 the base → 4.2. Fighting, the Pulse Gun, the cast's missions and the endings come after.
  - **The opening:** the story script's order (walk out of the hospital, the plates in Indiranagar). The chapter board's best moment moves into 4.1: the map changes live, a figure in khaki breaks from behind a car, and there's no tutorial text.
  - **Money:** UPI flickers through 4.0–4.1 (one shop at triple price, it works on the second try) and dies for good at the hill, where the barter table opens.
  - **Getting hurt:** the infected hurt you. At 0 health you wake at your base the next morning, with half of what you carried lost and stress +20 (this replaces "game over"). A hit never infects you.
  - **Played or told:** travel between places is told by cards; the places and every chase are played.
  - **The cast:** Suresh and the neighbours are at the hill (4.2), Deepa is bitten in 4.3, Kumar's rescue is the first step of the base chain, Priya and Major Rathore are at Cubbon / Vidhana Soudha.
  - **Barter values (1 = a water bottle):** water 1, food packet 2, canned food 3, cloth 1, bottle 1, flashlight 3, batteries 4, power bank 4, fuel 4, medkit 5, kitchen knife 3, cricket bat 4, UV LED 5, laptop 3, offer letter 0. The guitar is not for trade. Traders ask 1.5× and you haggle them down.
  - **References:** I need yours for the infected look and the touch buttons before step S2's art. Without them I'll show you options first.
  - **Engineering calls** (§7): the infected chase at 90 % of your run speed, crouch is the C key, water is an item (not a new stat), and Act 4 counts its own days from the hospital gate.

## 18. Act 4 drafts: 4.0 → 4.end
- **What:** all six Act 4 scenes are drafted as stubs (`src/data/scenes/act4_*.json`), each with its beats, cast, places and the art it needs. Each question below has my default in its wording. When you've decided, say "take the defaults" or tell me what to change. Nothing here is built.
- **Check:** the Playground tree, Act 4: each scene's inspector shows its draft. Or open the JSON files.
- **Things in the drafts that are new, not from the design docs:** a constable checking your ID at the hospital gate, a milk van lift, Suresh back from Mysuru, Karthik already packing, Ravi's voice note "Okay. Okay.", and 'Rameshwara Tiffin Room' as the café's parody name.
- **4.0 "Janata" (the hospital gate → the walk)** — Get out of Hebbal and start for home — the hill at Ambedkar Nagar, across the city.
  - **The pocket:** draft = the gate of the fictional Hebbal General and one street outside it, on real Hebbal streets (near the ward's map pin). Keep, or a different spot?
  - **The scooter:** draft = only the chain lock left in your bay (3.1 wrecked it, or Sameer's bike was collected). Keep?
  - **The constable:** draft = checks your ID card and the slip, says 'Stay inside after five' — the second person to say 'five'. Keep, or no police at all (only tape)?
  - **The slot shop:** draft = water ₹60, biscuits ₹90, UPI fails once then works (plan Q3: money flickers until the hill). Keep the prices?
  - **The walk:** draft = told by a card (the empty flyover, a milk van to Shivajinagar, the walk east), landing in Indiranagar at 16:40. Keep, or play part of it?
  - **The look:** draft = already at 'warning' (a fifth of the colour gone) on the first morning. Or full colour until five o'clock, so the plates are the first change?
- **4.1 "Five O'Clock" (Indiranagar, the plates, the first run)** — Get through Indiranagar and out to the main road before dark.
  - **The ritual:** draft = the News push at 16:58 says 'thank our frontline workers' (no leader, no date); the plates are shown with respect — the horror is only that it calls them. Keep the words?
  - **The khaki shirt:** draft = an auto driver from Kumar's airport stand (foreshadows Kumar's rescue in 4.3). Or someone the player knew (chai Anna, the Majestic uncle)?
  - **How many:** draft = the khaki shirt chases; 3–4 others only walk toward the balconies. Keep it to one chaser?
  - **The balconies:** draft = no one is shown being hurt — a plate drops, a door slams. Keep?
  - **The first UV lamp:** draft = a purple lamp flickering at a petrol bunk on the main road, unexplained until the hill. Keep?
  - **Energy with a cast:** draft = you can run in Act 4 even with the cast (3.2's slow walk ends at discharge). Or keep the cast slowing you for this one chase?
- **4.2 "The Hill" (the first base, UPI dies, barter)** — Get up the hill to the flat, and make it somewhere you can survive the night.
  - **Owner aunty:** draft = gone ('She went to the temple on Tuesday' — nothing more); her door stays locked. Do we ever learn what happened (an infected aunty later is possible but cruel)? Default: never shown.
  - **Suresh:** draft = her husband, back from their daughter's in Mysuru, keeping the generator and the lamp; the base protector (may sacrifice himself in the Hold ending). Keep?
  - **The still figures:** draft = two infected standing facing a wall at the foot of the hill (the first crouch). Or no infected on the hill on day 0 (safe all night)?
  - **Manju the trader:** draft = the broker from 1.4 runs the barter table on the terrace. Keep?
  - **The first trade:** draft = laptop → power bank + two food packets. Keep?
  - **Raju:** the act4 doc names 'Raju, chai wallah, 60s, knows everything' as the info hub; the hill's chai man in the game is Mani, and a Raju already runs the Whitefield Darshini. Draft = Mani is the hill's info hub; the Darshini's Raju is the one who gets trapped (4.3). Keep?
  - **Deepa:** draft = not seen at the hill on day 0 ('hasn't come home since the lab'); she turns up bitten in 4.3. Keep?
- **4.3 "Base Chain" (hill → café → Cubbon → Palace → Lalbagh)** — Keep moving from one lit place to the next, keep your people alive, and decide what you're fighting for.
  - **Scope:** draft = the first Act 4 build ships the hill only (S3 + 4.2); the chain is built one base per phase after that. Keep?
  - **Direction (drift guard):** the locked base chain walks toward the centre (Indiranagar → Cubbon → Palace → Lalbagh) while the locked fall order sends the infection outward (Hebbal first, Whitefield last) — so you move into places that fell earlier. Draft = every base is a lit island (army/BBMP UV lamps, a café generator) inside a fallen district, and you relocate because of each base's lamp failure plus a story pull (Deepa's medicine, Rathore's camp), not because of the fall. Keep, or reverse the chain?
  - **The café:** ADR-47 (proposed) says rename 'Rameshwaram Café' (a real brand) → draft 'Rameshwara Tiffin Room'. Accept the parody name?
  - **Kumar:** draft = save (costs items + risk) → he drives you between bases; walk away → his line ends. Keep?
  - **Deepa:** draft = bitten on day 2; medicine slows the turn; she survives injured if the medicine run succeeds and her data is needed for Ground Zero. Keep, or can she turn (the cure 'for early exposure only' failing)?
  - **The five runs:** draft = all five as in the act4 doc, with Priya; the Pulse Gun needs all five. Keep all five?
  - **The office return (ADR-44):** draft = from the café base; colleagues infected at their desks; the AMR-07 log is a clue. Who do you recognise — Sameer? Default: Sameer is NOT infected (he leaves the city with his family in 4.0's chats); Prakash is.
  - **Former NPCs:** draft = chai Anna (airport), Prakash, Vikram, the HIVR guard (the first Host). Ananya, Ravi, Amma never. Anyone else on or off the list?
- **4.5 "Ravi"** — Find Ravi.
  - **The branches:** draft = supported → HIVR, working with Meera, he gives you the calibration notes; not supported → his mother's bedside, he gives you nothing (or his ID). Keep, or swap (bedside as the kinder ending)?
  - **Ravi's family (design decisions open #8):** draft = his mother is ill, Appa is far away; the subplot resolves only by 'Tell Appa I picked up.' Keep?
  - **Meera:** draft = seen once, through glass, one line. Does she survive to the Ground Zero ending?
  - **Both branches in the first build:** draft = yes (the bot plays 'supported', a test covers the other). Keep?
- **4.6 "Tunnel" (the endings)** — Get your people through the tunnel to where you chose to go.
  - **The endings (ADR-52, proposed):** draft = three — Evacuate / Hold the hill / Ground Zero — as in the act4 doc. Accept three?
  - **The tunnel for all three:** draft = every ending starts in the tunnel; they split at Majestic. Or the tunnel is the Ground Zero route only?
  - **Rathore's betrayal:** draft = only in Evacuate, only if trust is low. Keep?
  - **Suresh's sacrifice:** draft = in Hold, he stays at the gate. Can it be avoided?
  - **Ananya's fate:** draft = with you if the relationship is resolved; otherwise a photo she left at the bandstand; never infected. Keep?
  - **After the ending:** draft = 'My Bangalore' card, then the title (no New Game+). Keep?

## 19. Act 4 S2: the run
- **What:** in Act 4 you can now be chased. Running costs energy, C crouches, you can hide, the infected hunt by noise and sight, ambushes come out of cover, a touch hurts, and at 0 health you wake at the base instead of dying.
- **Check:** in the Playground, pick **Act 4 · stability dial**, then **▶ Open the Act 4 test bench**. Tick **Show zones, cover, hide spots, paths and your detection ring** to see their areas (yellow), cover (orange), hide spots (blue), each infected's state (green wander, orange alert, red chase, yellow search) and your noise ring.
  - You start in the UV lamp's light (the blue disc), where they can't see you. Walk right toward the pack, then run (Shift): the energy pips appear under your meters.
  - Break their line of sight, or leave the street's area: they search, then give up.
  - Go to a blue hide spot and press E (HIDE) or C, then keep still: they walk past.
  - Stand still and let them catch you: each touch costs health, and at 0 the card plays and you wake in the hill flat.
  - Crouch-walk the pavement for a while: an ambush flashes and steps out of the nearest cover.
- **Calls to confirm:**
  - The infected are the crowd's sheets greyed by a tint. That's a placeholder: **I need 2–4 reference images for the infected look** (and for any new touch buttons; crouch reuses the action button for now).
  - Crouch has no animation; the sprite only dims.
  - The numbers: they chase at 90 % of your run speed for at most 8 seconds; a touch costs 20 health and a second touch within 5 seconds costs 35; after any hit everyone waits a second; an ambush roll every 8 steps at the place's rate (25 % at "infected").
  - Failing forward wakes you at 40 health, stress +20, with every second thing you carried gone (never a key item).
  - Ambushers melt away after 30 seconds or when you leave their area.
  - Someone you knew hesitates only if you met them and your reputation is "Trusted Helper" or higher (the game doesn't have Hosa / Gothu / Namma yet).

## 20. Infected sprites, step 1: the three bases
- **What:** your infected spec's step 1. An infected man, woman and elder in plain grey clothes, each with a lurching walk sheet (all five skin tones) and an action sheet (alert, lunge, stagger, in four directions). Nothing in the game uses them yet.
- **Check:** open `docs/review/infected_bases_v1.png` (zoomed ×3, an existing crowd sprite on the left for scale).
- **Calls to confirm (the look):**
  - At game size the pale eyes and the grey-green skin mostly disappear. My plan: the Degraded recipe (desaturate, green skin, pale eyes) makes them read, and Fresh stays nearly human, as the spec says.
  - They're slimmer and smaller-headed than the chibi crowd. Keep that (it reads as "wrong"), or reroll with bigger heads to match?
  - The action poses are a bit more cartoonish than the walks, and the elder's action skin is warmer. Reroll those two sheets?
- **Your spec vs what's already decided (drift guard: you choose, I've built neither way):**
  1. **Camera:** the spec says "3/4 top-down (Zelter style)". The game is locked to the LeafGreen top-down and the Emerald/Stardew sprite template, so I used the locked template. Keep it?
  2. **Frames:** the spec wants 7 animations with 4–6 frames each. Our sheet format is 3 frames × 4 directions (the validator enforces it). I made a walk sheet and a three-pose action sheet; sprint plays the walk faster. Fall (needed only once the Pulse Gun exists) isn't made. Default: keep the 3-frame format and add a fall sheet when the Pulse Gun is built. Or should I extend the format to longer animations?
  3. **Clothes compositing:** the spec composites each NPC's clothing layer onto a base, but our NPCs are whole generated sprites with no clothing layers. Default: a former NPC (chai Anna with his kettle, Shanthamma's bangles) becomes infected through the recipe applied to their own sheet (walk and idle), and borrows the action poses from their body type's base. Anonymous infected use the bases with colour variants. OK?
  4. **The Host at 48×64:** golden rule 5 says characters are 32×48 (the validator enforces it). Default: allow one exception, a "large" 48×64 class for the Host only, with the validator taught it. Or keep the Host at 32×48 and make it hulking inside the frame?
  5. **Speeds and timings (spec vs ADR-49, which S2 built):**
     - Wander: spec 0.5× your walk (ADR-32), built 0.4× (ADR-49).
     - The alert freeze: spec 300 ms, built 500 ms (ADR-49's growl).
     - Search: spec 6 s at 0.35× after losing sight (ADR-32), built 3 s (ADR-49).
     - Default: keep ADR-49 (your later board numbers). Or switch to the spec's?
  6. **Tools:** the spec names `tools/asset_pipe.py`, PixelLab and EasyStar. The repo uses Node `scripts/` (every pipeline), the Figma image generator (every sprite so far) and its own grid pathfinding (ADR-145). Default: keep ours.

## 21. Infected step 2 (the recipe) and the Evolved
- **What:** people now turn in their own clothes, Fresh (almost human) or Degraded (grey, torn, stained, off balance), depending on how long ago the place fell. The Evolved are rare, faster than you, and make you bleed.
- **Check:**
  - The sheets: `docs/review/infected_recipe_v1.png` (original / Fresh / Degraded for chai Anna, Prakash, the auto driver, four crowd people and a base) and `docs/review/infected_evolved_v1.png` (the Evolved man, woman and elder: prowl and shriek / swipe / snarl).
  - In the Playground, **Act 4 · stability dial**:
    - **▶ Bench: a pack with one Evolved** (the street drops to "hot"). The crouched one is the Evolved. Get close: a red flash and a shriek, then it's on you. A hit knocks you back and you bleed until you reach the lamp's blue light.
    - **▶ Bench: flank test (two Evolved)**: make noise and watch them come from two sides.
- **Calls to confirm:**
  - Fresh is subtle: only a little paler. Degraded reads as grey with stains. The pale eyes still barely show at this size; the Evolved's red eye dots (in-engine glow) aren't built yet.
  - The Evolved action poses (shriek, swipe) come out smaller than the prowl, because each sheet is scaled so its tallest pose is 40 px (most visible on the elder). Fix by scaling the action sheets to match their prowl sheet?
  - The first Evolved prompt (gashes, raw flesh, dried blood) was refused by the image generator. The accepted version shows stains, scratches and fungus. Gorier art would need another tool or hand edits.
  - The Evolved numbers are in `src/data/infected/evolved.json` (you asked for `data/atoms/infected/`, but the repo's data lives in `src/data/`). One heart = 20 health, so the swipe costs 40 and bleeding −10 every 3 seconds.
  - The gate is the flag `base_cafe_set` (the café base, the "Darshini" stop of the base chain); nothing sets it yet, only the bench.
  - Not built yet: the red eye glow and blood drip, a separate wet shriek sound (it reuses the shriek), stun and the Pulse Gun's two-charge rule (with melee, S4), the Host (your call on its 48×64 size is still open: the default exception was taken).
  - Fixed on the way: in step S2, a chase along a straight line froze the infected in place. It's fixed and tested.

