# NAMMA OUTBREAK — Engagement Guidelines & Design Charter v1.0
> Source: user's "Guidelines" + "Simple Framework" boards (2026-10-11), applied to our game. This is the checklist every new system/mission is reviewed against.

## 1. Three loop layers (already in Components §1 — confirmed + filled)
| Layer | Generic | Ours |
|---|---|---|
| **Micro (core)** — seconds | Aim→Shoot→Eliminate | Walk → interact → choose/pay/negotiate → see result. Act 4: spot → hide/run/decoy → scavenge |
| **Meta (progression)** — hours | missions→new areas; resources→abilities; NPCs→storylines | challenges → metro stations; salary → scooter/guitar/furniture; gym → stamina; reputation Hosa→Gothu→Namma → Kannada options, side-stories |
| **Macro (aspiration)** — whole game | leaderboard, achievements, mastery, 100% world | **all 30 City Moments**, every NPC side-story, every station unlocked, Nandi Hills sunrise, Act 4 survival days, "Namma" with the whole city |

## 2. Why players come back — used ethically (ADR-42)
| Principle | Ours | Guard-rail |
|---|---|---|
| Variable rewards | random NPC encounters, Darshini daily special, Reels feed, rare City Moments only at certain weather/time | never tied to payment |
| Loss aversion | Act 4 *narrative* loss (UPI dies, you lose everything) — the story's punch | never punish the player for not logging in |
| Sunk cost | homes you furnished become Act 4 bases — your effort is *reused*, not wasted | no artificial streaks |
| Completion | City Moments album, phone checklist, metro map lighting up | all completable by play alone |
| Social proof | shareable postcards / act cards (ADR-41) | opt-in, no data collected |

## 3. Irresistible loop checklist
**Difficulty:** challenging but achievable. Acts 1–3 forgiving (faint → healthcare centre, ₹500, ADR-16). Act 4 harder but escape valves always exist (ADR-32). Optional "Relaxed mode" toggle: survival ticks halved.
**Meaningful rewards — the three kinds** (user asked what these are):
- *Cosmetic* = changes how things look, not how they play: new shirt, scooter colour, room decor, phone wallpaper.
- *Functional* = changes what you can do: scooter, umbrella, metro card, stamina pip, generator, recipe.
- *Progression* = moves you forward: new district/station, story beat, reputation tier, salary.
Rule: every act gives all three. Rewards visible in advance (locked stations shown, guitar priced in the shop window, furniture "not enough space").
**Feedback:** visual (pixel particles on ₹ spent, sparkle on clue, screen shake on accident), audio (UPI "ding", failure buzz, ADR-29 states), **haptic** (`navigator.vibrate` on Android PWA for UPI, detection sting, accident; iOS ignores gracefully), numbers (₹ deltas, stat ±, timers on delivery/bus).
**Reward pacing:** early every 5–10 min (chai, bus, hotel key, PG) → mid every 30–60 min (salary, scooter, guitar, station) → late higher value, slower (base, generator, ending). Mechanic reveals every 20–30 min (ADR-39) sit between rewards.
**Social:** leaderboards/guilds/UGC — **out of scope** (single-player PWA). Trading → **barter** in Act 4 (in-world). Async sharing only (ADR-41).

## 4. Avoid list — adopted as hard rules (ADR-43)
1. **No exploitative monetization** — design for fun first; monetization model is an open decision and must not touch design.
2. **No manipulative timers** — time limits exist only for gameplay (hotel nights, bus, delivery), never to sell skips.
3. **No excessive grinding** — no stat can be farmed faster than it's earned by playing the story; wallet goals reachable on the story path + optional gigs.
4. **No pay-to-win** — nothing purchasable affects stats, survival or progression.

## 5. The Simple Framework — filled for our game (one-page pitch sheet)
| Step | Answer |
|---|---|
| 1. Core action | Live in Bangalore: move, talk, pay, negotiate — then survive it (hide, run, scavenge) |
| 2. Clear challenges | The city itself (money, housing, traffic, rain, language, loneliness) → the outbreak (infected, hunger, falling districts) |
| 3. Meaningful rewards | Cosmetic + functional + progression every act (§3) |
| 4. Progression | Housing ladder, metro unlocks, salary→scooter, reputation, stamina, base chain |
| 5. Social | Named NPC relationships + reputation; async postcards/act cards |
| 6. Test & refine | **M0** (minimal loop) → vertical slice → playtest with 5–8 people, ideally small-town folks who moved to Bangalore; watch for: first 10 min drop-off, where they get lost, which beats they screenshot. Optional local-only telemetry (no server) export as JSON for playtests |
