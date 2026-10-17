# Need to audit

Everything built and waiting for your audit, oldest first. Each item has what it is, how to check it, and the calls I made that you may want to overturn. When you audit, tell me per item: **approved**, or what to change. "Approved, push" approves everything listed and pushes.

Full detail for each item is in `AUDIT_LOG.md` (its "built, awaiting audit" entry) and `DECISIONS.md` (its ADR).

**How to check anything:** run the Test Playground, open the tree, pick the scene, then **Play** to play it yourself or **▶ from here** to watch the bot play it. **▶ PLAY** in the bar plays every built scene in order.

```bash
corepack pnpm playground
```
It opens at http://localhost:6175/playground.html. To run the whole thing headless instead (it says 20/20 when everything passes):
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
| 8 | P17 · 3.1 "Outer Ring Road" (ADR-136), Act 3 opens | 2026-10-17 | local commit, not pushed | waiting |
| 9 | P18 · 3.2 "Ward 4" (ADR-137) | 2026-10-17 | local commit, not pushed | waiting |
| 10 | P19 · 3.3 "The Corridor" (ADR-138) | 2026-10-17 | local commit, not pushed | waiting |
| 11 | Audio A1 · the sound system plus Act 0, airport → bus (ADR-139) | in progress | — | not built yet |

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

## 11. Audio A1: in progress
I'll add how to check it here when it's built.
